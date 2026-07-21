import { Buffer } from "node:buffer";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { Container } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

type SecretEnv = {
  LOGIN_EMAIL: string;
  LOGIN_PASSWORD_SCRYPT: string;
  SESSION_SIGNING_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
};

type AppEnv = Env & SecretEnv;

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_COOKIE = "tc_session";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const WORKSPACE_KEY = "workspace/v1/current.json";
const MAX_LOGIN_BODY = 8 * 1024;
const MAX_WORKSPACE_BODY = 8 * 1024 * 1024;
const MAX_ASSET_PART = 10 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UI_RELEASE = "2026-07-21.2";
const CRITICAL_APP_PATHS = new Set([
  "/play",
  "/init.js",
  "/script.js",
  "/scripts/taverncraft-ui/bootstrap.js",
  "/scripts/taverncraft-ui/main.js",
  "/css/taverncraft-modern.css",
  "/play/init.js",
  "/play/script.js",
  "/play/scripts/taverncraft-ui/bootstrap.js",
  "/play/scripts/taverncraft-ui/main.js",
  "/play/css/taverncraft-modern.css",
]);
const CACHEABLE_APP_PATH = /^\/(?:play\/)?(?:css|img|lib|scripts|webfonts)\/.+\.(?:css|gif|ico|jpe?g|js|mjs|png|svg|wasm|webp|woff2?)$/i;
const CACHEABLE_APP_ROOT_ASSETS = new Set(["/favicon.ico", "/lib.js", "/style.css"]);

type SessionPayload = {
  sub: "owner";
  email: string;
  iat: number;
  exp: number;
  nonce: string;
};

type LoginBody = { email?: unknown; password?: unknown };
type WorkspaceEnvelope = {
  format: "taverncraft_cloud_workspace";
  version: 1;
  savedAt: string;
  payload: unknown;
};

type MultipartCompleteBody = {
  hash?: unknown;
  uploadId?: unknown;
  parts?: unknown;
};

export class LoginRateLimiter extends DurableObject<AppEnv> {
  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS login_failures (attempted_at INTEGER NOT NULL)");
      this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_login_failures_at ON login_failures(attempted_at)");
    });
  }

  check(now: number): { allowed: boolean; retryAfterSeconds: number; failures: number } {
    const cutoff = now - LOGIN_WINDOW_MS;
    this.ctx.storage.sql.exec("DELETE FROM login_failures WHERE attempted_at < ?", cutoff);
    const row = this.ctx.storage.sql
      .exec<{ failures: number; oldest: number | null }>(
        "SELECT COUNT(*) AS failures, MIN(attempted_at) AS oldest FROM login_failures",
      )
      .one();
    const retryAfterSeconds = row.oldest === null
      ? 0
      : Math.max(1, Math.ceil((row.oldest + LOGIN_WINDOW_MS - now) / 1000));
    return {
      allowed: row.failures < LOGIN_MAX_FAILURES,
      retryAfterSeconds,
      failures: row.failures,
    };
  }

  recordFailure(now: number): { allowed: boolean; retryAfterSeconds: number; failures: number } {
    this.ctx.storage.sql.exec("INSERT INTO login_failures (attempted_at) VALUES (?)", now);
    return this.check(now);
  }

  clear(): void {
    this.ctx.storage.sql.exec("DELETE FROM login_failures");
  }
}

export class TavernContainer extends Container<AppEnv> {
  override defaultPort = 8000;
  override sleepAfter = "4h";
  override enableInternet = true;
  override envVars = {
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_BUCKET_NAME: this.env.R2_BUCKET_NAME,
    R2_PREFIX: this.env.R2_PREFIX,
    TAVERNCRAFT_COOKIE_NAME: "taverncraft-cloud-session",
  };

  override onStart(): void {
    console.log(JSON.stringify({ message: "taverncraft container started", environment: this.env.ENVIRONMENT }));
  }

  override onStop(): void {
    console.log(JSON.stringify({ message: "taverncraft container stopped", environment: this.env.ENVIRONMENT }));
  }

  override onError(error: unknown): void {
    console.error(JSON.stringify({
      message: "taverncraft container error",
      error: error instanceof Error ? error.message : String(error),
      environment: this.env.ENVIRONMENT,
    }));
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

function base64UrlEncode(value: Uint8Array | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function createSessionCookie(env: AppEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: "owner",
    email: normalizeEmail(env.LOGIN_EMAIL),
    iat: now,
    exp: now + SESSION_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(env.SESSION_SIGNING_SECRET, encoded);
  const expires = new Date(payload.exp * 1000).toUTCString();
  return `${SESSION_COOKIE}=${encoded}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`;
}

async function readSession(request: Request, env: AppEnv): Promise<SessionPayload | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = await hmac(env.SESSION_SIGNING_SECRET, encoded);
  const actualBytes = base64UrlDecode(signature);
  const expectedBytes = base64UrlDecode(expected);
  if (actualBytes.byteLength !== expectedBytes.byteLength || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.sub !== "owner" ||
      typeof payload.email !== "string" ||
      normalizeEmail(payload.email) !== normalizeEmail(env.LOGIN_EMAIL) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.nonce !== "string" ||
      payload.exp <= now ||
      payload.exp - payload.iat !== SESSION_SECONDS
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [scheme, nRaw, rRaw, pRaw, saltBase64, hashBase64, extra] = encodedHash.split("$");
  if (scheme !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltBase64 || !hashBase64 || extra) {
    throw new Error("LOGIN_PASSWORD_SCRYPT has an invalid format");
  }
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 16384 || r < 8 || p < 1) {
    throw new Error("LOGIN_PASSWORD_SCRYPT has unsafe parameters");
  }
  const expected = Buffer.from(hashBase64, "base64");
  if (expected.byteLength !== 64) throw new Error("LOGIN_PASSWORD_SCRYPT has an invalid digest");
  const actual = scryptSync(password, Buffer.from(saltBase64, "base64"), expected.byteLength, {
    N,
    r,
    p,
    maxmem: Math.max(64 * 1024 * 1024, 128 * N * r + 1024),
  });
  return timingSafeEqual(actual, expected);
}

async function readBodyTextLimited(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) throw new RangeError("request body is too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) throw new RangeError("request body is too large");
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function readJsonLimited<T>(request: Request, limit: number): Promise<T> {
  const text = await readBodyTextLimited(request, limit);
  return JSON.parse(text) as T;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function clientShard(request: Request, email: string): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}\u0000${normalizeEmail(email)}`))
    .then((digest) => Buffer.from(digest).toString("hex"));
}

async function handleLogin(request: Request, env: AppEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });

  let body: LoginBody;
  try {
    body = await readJsonLimited<LoginBody>(request, MAX_LOGIN_BODY);
  } catch {
    return json({ error: "invalid_request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 320 || password.length > 1024) return json({ error: "invalid_credentials" }, { status: 401 });

  const shard = await clientShard(request, email);
  const limiter = env.RATE_LIMITER.getByName(shard);
  const current = await limiter.check(Date.now());
  if (!current.allowed) {
    return json(
      { error: "too_many_attempts", retryAfterSeconds: current.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(current.retryAfterSeconds) } },
    );
  }

  let passwordMatches = false;
  try {
    passwordMatches = verifyPassword(password, env.LOGIN_PASSWORD_SCRYPT);
  } catch (error) {
    console.error(JSON.stringify({ message: "authentication secret configuration error", error: error instanceof Error ? error.message : String(error) }));
    return json({ error: "service_unavailable" }, { status: 503 });
  }
  const valid = normalizeEmail(email) === normalizeEmail(env.LOGIN_EMAIL) && passwordMatches;
  if (!valid) {
    const result = await limiter.recordFailure(Date.now());
    const headers = result.allowed ? undefined : { "retry-after": String(result.retryAfterSeconds) };
    return json({ error: "invalid_credentials" }, { status: result.allowed ? 401 : 429, headers });
  }

  await limiter.clear();
  const cookie = await createSessionCookie(env);
  return json(
    { ok: true, expiresInSeconds: SESSION_SECONDS },
    { status: 200, headers: { "set-cookie": cookie } },
  );
}

async function handleAuthApi(request: Request, env: AppEnv, pathname: string): Promise<Response> {
  if (pathname === "/_portal/auth/login") return handleLogin(request, env);
  if (pathname === "/_portal/auth/session") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET" } });
    const session = await readSession(request, env);
    return session
      ? json({ authenticated: true, email: session.email, expiresAt: new Date(session.exp * 1000).toISOString() })
      : json({ authenticated: false }, { status: 401 });
  }
  if (pathname === "/_portal/auth/logout") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } });
    if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });
    return json(
      { ok: true },
      { headers: { "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax` } },
    );
  }
  return json({ error: "not_found" }, { status: 404 });
}

function assetKey(hash: string): string {
  return `assets/sha256/${hash.slice(0, 2)}/${hash}`;
}

function cleanEtag(value: string | null): string | null {
  if (!value) return null;
  return value.trim().replace(/^W\//, "").replace(/^\"|\"$/g, "");
}

function validateWorkspaceEnvelope(value: unknown): value is WorkspaceEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceEnvelope>;
  return candidate.format === "taverncraft_cloud_workspace" && candidate.version === 1 && typeof candidate.savedAt === "string" && "payload" in candidate;
}

async function handleWorkspace(request: Request, env: AppEnv): Promise<Response> {
  if (request.method === "GET") {
    const object = await env.EDITOR_BUCKET.get(WORKSPACE_KEY);
    if (!object) return json({ error: "not_found" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        etag: object.httpEtag,
        "x-workspace-revision": object.etag,
      },
    });
  }
  if (request.method !== "PUT") return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET, PUT" } });
  if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });

  let envelope: WorkspaceEnvelope;
  try {
    envelope = await readJsonLimited<WorkspaceEnvelope>(request, MAX_WORKSPACE_BODY);
  } catch (error) {
    return json({ error: error instanceof RangeError ? "payload_too_large" : "invalid_json" }, { status: error instanceof RangeError ? 413 : 400 });
  }
  if (!validateWorkspaceEnvelope(envelope)) return json({ error: "invalid_workspace" }, { status: 400 });

  const baseRevision = cleanEtag(request.headers.get("if-match"));
  const createOnly = request.headers.get("if-none-match") === "*";
  if (!baseRevision && !createOnly) return json({ error: "missing_precondition" }, { status: 428 });
  const payload = JSON.stringify(envelope);
  const conditions = new Headers();
  if (createOnly) conditions.set("if-none-match", "*");
  else conditions.set("if-match", `\"${baseRevision}\"`);
  const stored = await env.EDITOR_BUCKET.put(WORKSPACE_KEY, payload, {
    onlyIf: conditions,
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    customMetadata: { format: envelope.format, version: String(envelope.version) },
  });
  if (!stored) {
    const current = await env.EDITOR_BUCKET.head(WORKSPACE_KEY);
    return json({ error: "revision_conflict", revision: current?.etag ?? null }, { status: 409 });
  }
  return json({ ok: true, revision: stored.etag, savedAt: envelope.savedAt }, { headers: { etag: stored.httpEtag } });
}

async function handleAsset(request: Request, env: AppEnv, pathname: string, url: URL): Promise<Response> {
  if (pathname === "/_portal/editor/assets/multipart/init") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });
    if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });
    let body: { hash?: unknown; contentType?: unknown; size?: unknown };
    try { body = await readJsonLimited(request, MAX_LOGIN_BODY); } catch { return json({ error: "invalid_request" }, { status: 400 }); }
    if (typeof body.hash !== "string" || !HASH_PATTERN.test(body.hash)) return json({ error: "invalid_hash" }, { status: 400 });
    const existing = await env.EDITOR_BUCKET.head(assetKey(body.hash));
    if (existing) return json({ exists: true, hash: body.hash, size: existing.size });
    const contentType = typeof body.contentType === "string" && body.contentType.length <= 200 ? body.contentType : "application/octet-stream";
    const upload = await env.EDITOR_BUCKET.createMultipartUpload(assetKey(body.hash), {
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { sha256: body.hash, size: String(body.size ?? "") },
    });
    return json({ exists: false, uploadId: upload.uploadId });
  }

  if (pathname === "/_portal/editor/assets/multipart/part") {
    if (request.method !== "PUT") return json({ error: "method_not_allowed" }, { status: 405 });
    if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });
    const hash = url.searchParams.get("hash") ?? "";
    const uploadId = url.searchParams.get("uploadId") ?? "";
    const partNumber = Number(url.searchParams.get("partNumber"));
    const size = Number(request.headers.get("content-length") ?? "0");
    if (!HASH_PATTERN.test(hash) || !uploadId || uploadId.length > 1024 || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      return json({ error: "invalid_request" }, { status: 400 });
    }
    if (!request.body || !Number.isFinite(size) || size <= 0 || size > MAX_ASSET_PART) return json({ error: "invalid_part_size" }, { status: 413 });
    const upload = env.EDITOR_BUCKET.resumeMultipartUpload(assetKey(hash), uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  }

  if (pathname === "/_portal/editor/assets/multipart/complete") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });
    if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });
    let body: MultipartCompleteBody;
    try { body = await readJsonLimited(request, 1024 * 1024); } catch { return json({ error: "invalid_request" }, { status: 400 }); }
    if (typeof body.hash !== "string" || !HASH_PATTERN.test(body.hash) || typeof body.uploadId !== "string" || body.uploadId.length > 1024 || !Array.isArray(body.parts)) {
      return json({ error: "invalid_request" }, { status: 400 });
    }
    const parts: R2UploadedPart[] = [];
    const seen = new Set<number>();
    for (const item of body.parts) {
      if (!item || typeof item !== "object") return json({ error: "invalid_parts" }, { status: 400 });
      const candidate = item as { partNumber?: unknown; etag?: unknown };
      if (!Number.isInteger(candidate.partNumber) || Number(candidate.partNumber) < 1 || Number(candidate.partNumber) > 10_000 || typeof candidate.etag !== "string" || candidate.etag.length > 256) {
        return json({ error: "invalid_parts" }, { status: 400 });
      }
      const partNumber = Number(candidate.partNumber);
      if (seen.has(partNumber)) return json({ error: "duplicate_part" }, { status: 400 });
      seen.add(partNumber);
      parts.push({ partNumber, etag: candidate.etag });
    }
    parts.sort((a, b) => a.partNumber - b.partNumber);
    if (parts.length === 0) return json({ error: "invalid_parts" }, { status: 400 });
    const upload = env.EDITOR_BUCKET.resumeMultipartUpload(assetKey(body.hash), body.uploadId);
    const object = await upload.complete(parts);
    return json({ ok: true, hash: body.hash, size: object.size, etag: object.etag });
  }

  const hash = pathname.slice("/_portal/editor/assets/".length);
  if (!HASH_PATTERN.test(hash)) return json({ error: "invalid_hash" }, { status: 400 });
  const key = assetKey(hash);
  if (request.method === "HEAD") {
    const object = await env.EDITOR_BUCKET.head(key);
    return object
      ? new Response(null, { status: 200, headers: { "content-length": String(object.size), etag: object.httpEtag, "cache-control": "private, no-store" } })
      : new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (request.method === "GET") {
    const object = await env.EDITOR_BUCKET.get(key);
    if (!object) return json({ error: "not_found" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }
  if (request.method === "PUT") {
    if (!sameOrigin(request)) return json({ error: "invalid_request" }, { status: 403 });
    const size = Number(request.headers.get("content-length") ?? "0");
    if (!request.body || !Number.isFinite(size) || size <= 0 || size > MAX_ASSET_PART) return json({ error: "invalid_asset_size" }, { status: 413 });
    const contentType = (request.headers.get("content-type") ?? "application/octet-stream").slice(0, 200);
    const stored = await env.EDITOR_BUCKET.put(key, request.body, {
      sha256: hash,
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { sha256: hash },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!stored) {
      const existing = await env.EDITOR_BUCKET.head(key);
      return json({ ok: true, exists: true, hash, size: existing?.size ?? size });
    }
    return json({ ok: true, exists: false, hash, size: stored.size, etag: stored.etag });
  }
  return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET, HEAD, PUT" } });
}

async function handleEditorApi(request: Request, env: AppEnv, pathname: string, url: URL): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });
  if (pathname === "/_portal/editor/workspace") return handleWorkspace(request, env);
  if (pathname.startsWith("/_portal/editor/assets/")) return handleAsset(request, env, pathname, url);
  return json({ error: "not_found" }, { status: 404 });
}

const PUBLIC_ASSETS = new Map<string, string>([
  ["/", "/index.html"],
  ["/signin", "/signin.html"],
  ["/site.css", "/site.css"],
  ["/signin.js", "/signin.js"],
  ["/portal.js", "/portal.js"],
  ["/favicon.svg", "/favicon.svg"],
]);

const PROTECTED_ASSETS = new Map<string, string>([
  ["/portal", "/portal.html"],
  ["/editor", "/editor.html"],
]);

function securityHeaders(response: Response, surface: "public" | "protected" | "editor"): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("x-frame-options", "DENY");
  if (surface !== "public") headers.set("cache-control", "no-store");
  const csp = surface === "editor"
    ? "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:"
    : "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'";
  headers.set("content-security-policy", csp);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function serveAsset(request: Request, env: AppEnv, path: string, surface: "public" | "protected" | "editor"): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET", headers: request.headers }));
  return securityHeaders(response, surface);
}

function unauthorized(request: Request): Response {
  const url = new URL(request.url);
  const wantsHtml = request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html") && request.headers.get("upgrade")?.toLowerCase() !== "websocket";
  if (!wantsHtml) return json({ error: "unauthorized" }, { status: 401 });
  const next = `${url.pathname}${url.search}`;
  return Response.redirect(`${url.origin}/signin?next=${encodeURIComponent(next)}`, 302);
}

function secureContainerCookies(headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length === 0) return;
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    headers.append("set-cookie", /;\s*secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`);
  }
}

function setContainerCachePolicy(request: Request, pathname: string, headers: Headers): void {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  if (CRITICAL_APP_PATHS.has(pathname)) {
    headers.set("cache-control", "private, no-store");
    return;
  }
  if (CACHEABLE_APP_ROOT_ASSETS.has(pathname) || CACHEABLE_APP_PATH.test(pathname)) {
    headers.set("cache-control", "private, max-age=3600, must-revalidate");
  }
}

async function proxyTavern(request: Request, env: AppEnv): Promise<Response> {
  if (env.CONTAINER_ENABLED !== "true") return json({ error: "tavern_unavailable" }, { status: 503 });
  const incoming = new URL(request.url);
  const target = new URL(request.url);
  if (incoming.pathname === "/play") target.pathname = "/";
  else if (incoming.pathname.startsWith("/play/")) target.pathname = incoming.pathname.slice(5) || "/";
  target.protocol = "http:";
  target.host = "taverncraft.internal";
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-prefix", "/play");
  const proxyRequest = new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" });
  const container = env.TAVERN.getByName("taverncraft-singleton");
  const containerStartedAt = performance.now();
  const response = await container.fetch(proxyRequest);
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket" || response.status === 101) return response;
  const outputHeaders = new Headers(response.headers);
  const location = outputHeaders.get("location");
  if (location) {
    try {
      const resolved = new URL(location, incoming.origin);
      if (resolved.origin === incoming.origin && resolved.pathname === "/") outputHeaders.set("location", `/play${resolved.search}${resolved.hash}`);
    } catch {
      if (location === "/") outputHeaders.set("location", "/play");
    }
  }
  secureContainerCookies(outputHeaders);
  setContainerCachePolicy(request, incoming.pathname, outputHeaders);
  outputHeaders.set("x-content-type-options", "nosniff");
  outputHeaders.set("x-taverncraft-ui-release", UI_RELEASE);
  outputHeaders.append("server-timing", `taverncraft-container;dur=${(performance.now() - containerStartedAt).toFixed(1)}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outputHeaders });
}

async function handleRequest(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  if (pathname === "/_portal/health") {
    return json({
      ok: true,
      environment: env.ENVIRONMENT,
      containerEnabled: env.CONTAINER_ENABLED === "true",
      uiRelease: UI_RELEASE,
    });
  }
  if (pathname.startsWith("/_portal/auth/")) return handleAuthApi(request, env, pathname);
  if (pathname.startsWith("/_portal/editor/")) return handleEditorApi(request, env, pathname, url);

  const publicAsset = PUBLIC_ASSETS.get(pathname);
  if (publicAsset) return serveAsset(request, env, publicAsset, "public");

  const protectedAsset = PROTECTED_ASSETS.get(pathname);
  if (protectedAsset) {
    const session = await readSession(request, env);
    if (!session) return unauthorized(request);
    return serveAsset(request, env, protectedAsset, pathname === "/editor" ? "editor" : "protected");
  }

  const session = await readSession(request, env);
  if (!session) return unauthorized(request);
  return proxyTavern(request, env);
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: "request failed",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: "internal_error", requestId }, { status: 500 });
    }
  },
} satisfies ExportedHandler<AppEnv>;
