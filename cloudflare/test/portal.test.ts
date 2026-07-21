import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://taverncraft.example.test";

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, init);
}

async function login(): Promise<string> {
  const response = await request("/_portal/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: "OWNER@example.test", password: "test-owner-password" }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie!.split(";", 1)[0]!;
}

describe("public and private surfaces", () => {
  it("exposes the deployed UI release for production verification", async () => {
    const response = await request("/_portal/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, uiRelease: "2026-07-21.3" });
  });

  it("serves marketing without exposing the configured owner", async () => {
    const response = await request("/");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("TavernCraft");
    expect(body).not.toContain("owner@example.test");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("redirects an unauthenticated HTML request to sign-in", async () => {
    const response = await request("/portal?from=test", {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/signin?next=%2Fportal%3Ffrom%3Dtest`);
  });
});

describe("owner authentication", () => {
  it("opens TavernCraft in the modern interface from the private portal", async () => {
    const cookie = await login();
    const response = await request("/portal", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('href="/play?ui=modern"');
  });

  it("rejects cross-origin login requests", async () => {
    const response = await request("/_portal/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ email: "owner@example.test", password: "test-owner-password" }),
    });
    expect(response.status).toBe(403);
  });

  it("returns a generic error for invalid credentials", async () => {
    const response = await request("/_portal/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: "owner@example.test", password: "incorrect-password" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
  });

  it("issues a secure absolute seven-day session and detects tampering", async () => {
    const cookie = await login();
    const loginResponse = await request("/_portal/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: "owner@example.test", password: "test-owner-password" }),
    });
    const setCookie = loginResponse.headers.get("set-cookie")!;
    expect(setCookie).toContain("Max-Age=604800");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const valid = await request("/_portal/auth/session", { headers: { cookie } });
    expect(valid.status).toBe(200);
    expect((await valid.json() as { authenticated: boolean }).authenticated).toBe(true);

    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;
    const invalid = await request("/_portal/auth/session", { headers: { cookie: tampered } });
    expect(invalid.status).toBe(401);
  });

  it("throttles repeated failures on the same client shard", async () => {
    let response!: Response;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await request("/_portal/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "cf-connecting-ip": "203.0.113.42",
        },
        body: JSON.stringify({ email: "limited@example.test", password: "incorrect-password" }),
      });
    }
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});

describe("private editor storage", () => {
  it("requires auth and enforces optimistic workspace revisions", async () => {
    const unauthorized = await request("/_portal/editor/workspace");
    expect(unauthorized.status).toBe(401);

    const cookie = await login();
    const first = await request("/_portal/editor/workspace", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: ORIGIN,
        "if-none-match": "*",
      },
      body: JSON.stringify({
        format: "taverncraft_cloud_workspace",
        version: 1,
        savedAt: "2026-07-20T00:00:00.000Z",
        payload: { characters: [{ name: "测试角色" }], worlds: [] },
      }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { revision: string };
    expect(firstBody.revision).toBeTruthy();

    const conflict = await request("/_portal/editor/workspace", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: ORIGIN,
        "if-match": '"stale-revision"',
      },
      body: JSON.stringify({
        format: "taverncraft_cloud_workspace",
        version: 1,
        savedAt: "2026-07-20T00:01:00.000Z",
        payload: { characters: [], worlds: [] },
      }),
    });
    expect(conflict.status).toBe(409);

    const read = await request("/_portal/editor/workspace", { headers: { cookie } });
    expect(read.status).toBe(200);
    expect(read.headers.get("etag")).toBeTruthy();
    expect((await read.json() as { payload: { characters: unknown[] } }).payload.characters).toHaveLength(1);
  });
});
