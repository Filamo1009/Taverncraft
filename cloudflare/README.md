# TavernCraft Cloudflare portal

This directory packages three surfaces behind one Cloudflare Worker:

- a public Simplified Chinese marketing page;
- a fixed-owner sign-in and private portal with an absolute seven-day session;
- the private character/world editor and the TavernCraft container.

The browser receives only an `HttpOnly`, `Secure`, `SameSite=Lax` signed session cookie. The configured password is converted locally into a scrypt verifier and is never stored in the Worker, frontend, Git, or R2.

## Architecture and storage

| Surface | Access | Storage |
| --- | --- | --- |
| `/` and `/signin` | Public | Static Worker assets |
| `/portal` and `/editor` | Signed-in owner | Editor workspace/assets in private R2 |
| `/play` and TavernCraft routes | Signed-in owner | One Cloudflare Container; `data/` mounted from a private R2 bucket |
| Login attempt limiter | Internal | SQLite Durable Object, sharded by IP and normalized email |

The edge session expires exactly seven days after login and is not extended by activity. Browser password managers may remember the credentials, but TavernCraft JavaScript never stores the password.

## Prerequisites

1. A Cloudflare account with Workers Paid and Containers enabled.
2. Docker Desktop running locally for the container image build.
3. Node.js and npm, followed by `npm ci` in this directory.
4. Wrangler authenticated to the intended Cloudflare account.
5. An R2 S3 API credential scoped only to the TavernCraft data buckets. Do not reuse a full-account API token.

Cloudflare Containers cannot be deployed from a free Workers plan. Upgrading the plan is a billing action and is deliberately not automated here.

## Local validation

```sh
cd cloudflare
npm ci
npm run types
npm run check
npm test
npm run build
```

`npm run build` is a dry run. It must not create or mutate Cloudflare resources.

## One-time R2 setup

Keep staging and production isolated:

```sh
npx wrangler r2 bucket create taverncraft-editor-staging
npx wrangler r2 bucket create taverncraft-data-staging
npx wrangler r2 bucket create taverncraft-editor-prod
npx wrangler r2 bucket create taverncraft-data-prod
```

Use the Cloudflare dashboard to create R2 S3 credentials with access to only the corresponding TavernCraft data bucket(s). The access key, secret key, and account ID are Worker secrets because the container receives them at runtime.

## Secrets

Generate the owner-login secrets in a local interactive terminal. Input is hidden and the resulting file defaults to `~/Library/Application Support/TavernCraft/cloudflare-auth-secrets.json`, outside this repository.

```sh
npm run secrets:generate
```

Load the three generated authentication fields, then add the R2 FUSE fields through hidden Wrangler prompts. Repeat for staging without `--env staging` when configuring production.

```sh
npx wrangler secret bulk "$HOME/Library/Application Support/TavernCraft/cloudflare-auth-secrets.json" --env staging
npx wrangler secret put AWS_ACCESS_KEY_ID --env staging
npx wrangler secret put AWS_SECRET_ACCESS_KEY --env staging
npx wrangler secret put R2_ACCOUNT_ID --env staging
```

Production:

```sh
npx wrangler secret bulk "$HOME/Library/Application Support/TavernCraft/cloudflare-auth-secrets.json"
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
npx wrangler secret put R2_ACCOUNT_ID
```

Never place secret values in `wrangler.jsonc`, shell history, source files, screenshots, or issue/PR text.

## Staging migration and proof

The snapshot command intentionally refuses to run while the local TavernCraft server answers on `127.0.0.1:8000`. Stop the server first so chats, settings, cards, and worlds form one consistent snapshot.

```sh
npm run migration:prepare
npm run migration:upload -- "/absolute/path/printed/by/prepare" taverncraft-data-staging staging
npm run deploy:staging
```

The preparation tool:

- creates a mode-`0600` full local backup before sanitizing;
- removes `secrets.json`, `cookie-secret.txt`, caches, transient uploads, thumbnails, locks, and logs;
- rejects symbolic links and scans small text files for common credential formats;
- emits a SHA-256 manifest and verifies every file again before upload;
- uploads the manifest last as the completion marker.

Before production, verify all of the following on staging:

1. The marketing page and sign-in render correctly on desktop and mobile.
2. Invalid credentials receive a generic error; repeated failures are throttled.
3. The correct login opens `/portal`; the session survives a browser restart and expires after seven days.
4. The editor round-trips characters, worlds, images, refreshes, offline changes, and deliberate revision conflicts.
5. TavernCraft can open chats/cards/worlds, save a new chat, rename and atomically replace files, upload media, and reconnect WebSockets.
6. Restart the container and prove the changed data remains in R2.
7. Confirm no model/API credentials were migrated and configure model keys manually inside the private TavernCraft UI only if needed.

R2 is object storage rather than a native POSIX filesystem. Do not promote if file rename, atomic replacement, concurrent save, or restart tests fail through the FUSE mount.

## Production cutover

Stop local TavernCraft, generate a fresh snapshot, and upload it to the production prefix:

```sh
npm run migration:prepare
npm run migration:upload -- "/absolute/path/printed/by/prepare" taverncraft-data-prod production
npm run deploy
```

Run the same smoke tests against the production `workers.dev` URL. Keep the local data and the timestamped backup untouched until production has completed a soak period.

## Rollback

- Worker code: use Wrangler's deployment history and rollback to the last known-good version.
- Data: stop the production container, retain the affected R2 prefix for forensics, restore the timestamped private archive into a new prefix, then point `R2_PREFIX` at that prefix and redeploy.
- Service continuity: the original local TavernCraft data is never deleted by these scripts, so it remains the recovery source.

Do not overwrite the only production prefix in place during a restore. A new prefix makes rollback auditable and reversible.
