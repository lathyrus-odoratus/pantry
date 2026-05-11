# Pantry Plan C: Deploy backend + publish client to npm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pantry MVP — backend running on a GCP VM behind Cloudflare Tunnel with Discord OAuth, client published to npm and runnable via `npx`.

**Architecture:**
- Backend dockerised, runs on existing VM (host `wisp`, Ubuntu 24.04, Docker 29.3), host port `8081 → container 8080` to avoid colliding with existing `wisp-wisp-1` container on `:8080`.
- **Image is built on the VM itself** — source synced via `rsync`, then `docker compose up --build`. No external image registry. Aligns with the existing wisp/dixit deploy style on the same VM.
- Public HTTPS via Cloudflare Tunnel — VM `cloudflared` (already active) forwards a sub-domain to `http://localhost:8081`. No public ports opened on the VM.
- Discord-only OAuth for MVP. GitHub / Google secrets become optional in the backend config schema; auth start returns `503` for unconfigured providers; client renders ErrorScreen.
- Client published as a scoped npm package, runnable via `npx @noracami/pantry`.

**Tech Stack:** Node 20, pnpm 9 workspace, Fastify, Docker + Compose v5.1, Cloudflare Tunnel, supabase (already provisioned), Discord OAuth.

---

## Prerequisites — locked-in values

These were decided up-front and baked into the plan body:

| Name | Value |
|---|---|
| Sub-domain | `pantry.miao-bao.cc` |
| npm package name | `@noracami/pantry` |
| VM SSH alias | `wisp` |
| VM deploy dir | `/opt/pantry` |
| Deploy method | rsync source to VM, `docker compose up -d --build` on VM |

You still need to gather these — they remain as placeholders:

| Placeholder | Meaning | How to obtain |
|---|---|---|
| `<DISCORD_CLIENT_ID>` | Discord app's Client ID | Discord Developer Portal → New Application → OAuth2 → Client ID |
| `<DISCORD_CLIENT_SECRET>` | Discord app's Client Secret | Same page, "Reset Secret" |
| `<SUPABASE_URL>` | e.g. `https://abcdefgh.supabase.co` | Existing Supabase project → Project Settings → API |
| `<SUPABASE_SERVICE_ROLE_KEY>` | service_role secret | Same page (NEVER paste into client; backend only) |
| `<JWT_SIGNING_KEY>` | 32+ random chars | `openssl rand -base64 48` |
| `<TUNNEL_NAME>` | name of your existing Cloudflare tunnel | `cloudflared tunnel list` on the VM |

### Discord redirect URL to register on Discord Developer Portal

```
https://pantry.miao-bao.cc/auth/oauth/callback
```

(Single callback for all providers — backend looks the provider up by `state`.)

---

## File Structure (Plan C only)

**Backend container packaging:**
- Create: `packages/backend/Dockerfile`
- Create: `packages/backend/.dockerignore`
- Create: `docker-compose.yml` (repo root) — pantry service definition with `build:` directive
- Create: `.dockerignore` (repo root)
- Create: `.env.example` (repo root) — documented env-var template
- Create: `deploy/cloudflared-ingress.example.yml` — paste snippet for VM-side `~/.cloudflared/config.yml`

**Backend code changes (relax OAuth schema):**
- Modify: `packages/backend/src/config.ts` — make GitHub/Google secrets optional
- Modify: `packages/backend/src/config.test.ts` — drop tests requiring GH/Google
- Modify: `packages/backend/src/auth/routes.ts` — return 503 when chosen provider is unconfigured

**Client changes (npm-publishable):**
- Modify: `packages/client/package.json` — add `bin`, `files`, `publishConfig`, version bump, `prepublishOnly`
- Modify: `packages/client/src/cli.tsx` — add `#!/usr/bin/env node` shebang (preserved by `tsc`)
- Modify: `packages/client/tsconfig.json` — ensure `outDir: dist`, declaration optional
- Create: `packages/client/README.md` — short usage doc shown on npm page

**Deploy helper:**
- Create: `scripts/deploy.sh` — rsync source to VM, run `docker compose up -d --build` remotely

**Docs:**
- Modify: `README.md` (or create if missing) — production deploy + npx usage

---

## Architecture Notes

### Why host port 8081, not 8080
`ss -tlnp` on the VM shows `wisp-wisp-1` already binds host 8080. Re-binding fails. The pantry **container** still listens on 8080 internally (no app changes); only the `ports:` mapping in compose changes.

### Why Cloudflare Tunnel, not a public load balancer
- VM already runs `cloudflared` as a systemd service
- No firewall change required (no public ingress port)
- Free TLS handled at Cloudflare edge
- Drop-in for OAuth callbacks (Discord requires HTTPS)

### Why scoped npm package (`@noracami/pantry`)
- Scoped packages are guaranteed-free under your own scope, no name-squat risk
- `npx @noracami/pantry` is one extra character; acceptable
- `--access public` on first publish

### Why Discord-only MVP
- Single OAuth app to register; no Google verification queue
- Existing client UI shows all 4 identity options (anon + 3 OAuth); we relax backend so unconfigured providers return 503 cleanly, and client surfaces "Provider not configured" in ErrorScreen
- Re-enabling GH/Google later is just adding env vars + redeploy

### Why supabase migrations are not in Plan C
You confirmed migrations are already pushed to the existing project. Plan C only consumes `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env.

### Why build on VM (no registry)
- Existing VM workflow (wisp / dixit) builds on-host; pantry follows the same pattern
- Skips Artifact Registry / GHCR setup and the associated gcloud / GitHub auth dance
- Tradeoffs accepted for MVP: no image tag history (rollback = `git checkout <sha>` + redeploy), ~30 s downtime on rebuild, build runs on a 2 GB / 5 GB-free machine (tight but acceptable)
- The image is tagged locally as `pantry-backend:latest`; compose's `build:` directive rebuilds it from the synced source tree

---

## Phase 1: Backend OAuth schema relaxation

### Task 1: Make GH/Google OAuth secrets optional in config

**Files:**
- Modify: `packages/backend/src/config.ts`
- Modify: `packages/backend/src/config.test.ts`

- [ ] **Step 1: Update the failing-tests-first list** — open `packages/backend/src/config.test.ts` and:
  - Delete tests asserting that missing `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` cause rejection.
  - Add a new test that the config parses successfully when only `DISCORD_*` are set and `GITHUB_*` / `GOOGLE_*` are absent. Insert immediately above the existing `it("rejects missing SUPABASE_URL", ...)`:

```typescript
  it("accepts missing GitHub and Google OAuth secrets (Discord-only deploy)", () => {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ...rest } = valid;
    const cfg = parseConfig(rest);
    expect(cfg.oauth.github).toBeUndefined();
    expect(cfg.oauth.google).toBeUndefined();
    expect(cfg.oauth.discord.clientId).toBe("d");
  });

  it("still rejects missing DISCORD_CLIENT_ID", () => {
    const { DISCORD_CLIENT_ID, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow();
  });
```

- [ ] **Step 2: Run test, confirm failure**

```bash
pnpm --filter @pantry/backend test -- src/config.test.ts
```

Expected: first new test fails (typescript error on `cfg.oauth.github`/`google` being potentially `undefined` is a clue — the schema and `Config` type still demand them).

- [ ] **Step 3: Update the schema and `Config` type** — replace the entire contents of `packages/backend/src/config.ts` with:

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8080"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_BACKEND_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SIGNING_KEY: z.string().min(32),

  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
});

export type ProviderCreds = { clientId: string; clientSecret: string };

export type Config = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  publicBackendUrl: string;
  supabase: { url: string; serviceRoleKey: string };
  jwtSigningKey: string;
  oauth: {
    github?: ProviderCreds;
    google?: ProviderCreds;
    discord: ProviderCreds;
  };
};

export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    publicBackendUrl: parsed.PUBLIC_BACKEND_URL,
    supabase: {
      url: parsed.SUPABASE_URL,
      serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    },
    jwtSigningKey: parsed.JWT_SIGNING_KEY,
    oauth: {
      github:
        parsed.GITHUB_CLIENT_ID && parsed.GITHUB_CLIENT_SECRET
          ? { clientId: parsed.GITHUB_CLIENT_ID, clientSecret: parsed.GITHUB_CLIENT_SECRET }
          : undefined,
      google:
        parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
          ? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
          : undefined,
      discord: {
        clientId: parsed.DISCORD_CLIENT_ID,
        clientSecret: parsed.DISCORD_CLIENT_SECRET,
      },
    },
  };
}

export function loadConfig(): Config {
  return parseConfig(process.env);
}
```

- [ ] **Step 4: Re-run tests**

```bash
pnpm --filter @pantry/backend test -- src/config.test.ts
```

Expected: all pass. If the file `providers.ts` complains about `config.oauth.github.clientId` (since `github` is now optional), that is intentional — handled in Task 2.

- [ ] **Step 5: Run typecheck** (will reveal `auth/routes.ts` and `auth/providers.ts` callsites)

```bash
pnpm --filter @pantry/backend typecheck
```

Expected: typecheck error(s) inside `auth/providers.ts` `getProviderConfig` because `config.oauth.github` is now `ProviderCreds | undefined`. Leave it — Task 2 fixes it.

### Task 2: Auth routes return 503 for unconfigured providers

**Files:**
- Modify: `packages/backend/src/auth/providers.ts`
- Modify: `packages/backend/src/auth/routes.ts`

- [ ] **Step 1: Change `getProviderConfig` to return `undefined` if the provider has no secrets**

Open `packages/backend/src/auth/providers.ts`. Replace the `getProviderConfig` function signature and the `clientId` / `clientSecret` reads. Find:

```typescript
export function getProviderConfig(
  provider: Exclude<AuthProvider, "anon">,
  config: Config,
): ProviderConfig {
  switch (provider) {
    case "github":
      return {
        name: "github",
        clientId: config.oauth.github.clientId,
        clientSecret: config.oauth.github.clientSecret,
```

Replace with:

```typescript
export function getProviderConfig(
  provider: Exclude<AuthProvider, "anon">,
  config: Config,
): ProviderConfig | undefined {
  switch (provider) {
    case "github": {
      const creds = config.oauth.github;
      if (!creds) return undefined;
      return {
        name: "github",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
```

Then locate the `case "google":` block and update the same way:

```typescript
    case "google": {
      const creds = config.oauth.google;
      if (!creds) return undefined;
      return {
        name: "google",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
```

Then locate `case "discord":` and update to:

```typescript
    case "discord": {
      const creds = config.oauth.discord;
      return {
        name: "discord",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
```

(`discord` is always configured per schema — no `undefined` branch.)

Close each `case` block with `}` (since we introduced a brace after `case "github": {` etc.). If the existing structure already uses `return` without a `case` block-scope, just add `{ ... }` around each case body.

- [ ] **Step 2: Handle the new `undefined` return in `auth/routes.ts`**

In `packages/backend/src/auth/routes.ts`, find inside the `app.post("/auth/oauth/start", ...)` handler:

```typescript
      const state = stateStore.createPending(provider.data);
      const cfg = getProviderConfig(provider.data, config);
      const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
```

Replace with:

```typescript
      const cfg = getProviderConfig(provider.data, config);
      if (!cfg) {
        return reply.code(503).send({
          error: "provider_not_configured",
          provider: provider.data,
        });
      }
      const state = stateStore.createPending(provider.data);
      const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
```

(`createPending` moves after the check so we don't allocate state for a request we'll reject.)

Then, inside the `app.get("/auth/oauth/callback", ...)` handler, find:

```typescript
        const cfg = getProviderConfig(provider, config);
        const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
```

Replace with:

```typescript
        const cfg = getProviderConfig(provider, config);
        if (!cfg) {
          return reply
            .code(503)
            .type("text/html")
            .send("<h1>Provider not configured on server.</h1>");
        }
        const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
```

- [ ] **Step 3: Typecheck + run all backend tests**

```bash
pnpm --filter @pantry/backend typecheck
pnpm --filter @pantry/backend test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/config.ts packages/backend/src/config.test.ts \
        packages/backend/src/auth/providers.ts packages/backend/src/auth/routes.ts
git commit -m "feat(backend): make GH/Google OAuth optional; 503 when unconfigured"
```

### Task 3: Client surfaces 503 as a readable error

`OAuthWaiting.tsx` already catches errors from `runOAuthFlow` and routes them via `setError` → ErrorScreen. The change needed is purely in `oauth.ts`: turn a 503 into a human-readable message rather than `oauth start failed (503)`.

**Files:**
- Modify: `packages/client/src/auth/oauth.ts`

- [ ] **Step 1: Replace the start-response error branch**

In `packages/client/src/auth/oauth.ts`, find:

```typescript
  if (!startRes.ok) {
    throw new Error(`oauth start failed (${startRes.status})`);
  }
```

Replace with:

```typescript
  if (startRes.status === 503) {
    const body = (await startRes.json().catch(() => ({}))) as {
      provider?: string;
    };
    throw new Error(
      `OAuth provider "${body.provider ?? input.provider}" is not configured on this server.`,
    );
  }
  if (!startRes.ok) {
    throw new Error(`oauth start failed (${startRes.status})`);
  }
```

- [ ] **Step 2: Run client tests + typecheck**

```bash
pnpm --filter pantry test
pnpm --filter pantry typecheck
```

Expected: 41 tests pass, typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/auth/oauth.ts
git commit -m "feat(client): readable error when backend returns 503 for OAuth provider"
```

---

## Phase 2: Backend container

### Task 4: Backend `.dockerignore`

**Files:**
- Create: `packages/backend/.dockerignore`

- [ ] **Step 1: Create the file** with this exact content:

```
node_modules
dist
.env
.env.*
*.log
.DS_Store
coverage
```

(The Dockerfile copies from repo root, so per-package `.dockerignore` does nothing on its own — we'll also add a root-level `.dockerignore` in Task 5.)

- [ ] **Step 2: Commit (combined with next task)** — skip, do at end of Task 5.

### Task 5: Backend Dockerfile + root `.dockerignore`

**Files:**
- Create: `.dockerignore` (repo root)
- Create: `packages/backend/Dockerfile`

- [ ] **Step 1: Create `.dockerignore` at repo root** with this exact content:

```
node_modules
**/node_modules
**/dist
.git
.github
docs
supabase
*.log
.env
.env.*
.DS_Store
packages/client
```

(`packages/client` excluded — the backend image doesn't need it. `supabase` excluded — migrations live there and are not needed in the image.)

- [ ] **Step 2: Create `packages/backend/Dockerfile`** with this exact content:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

# --- install workspace deps (cached by lockfile + manifests) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --filter @pantry/backend...

# --- build shared then backend ---
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN pnpm --filter @pantry/shared build \
 && pnpm --filter @pantry/backend build

# --- runtime: re-install prod-only deps, then copy dist ---
FROM base AS runtime
WORKDIR /app
COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --prod --filter @pantry/backend...
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/backend/dist packages/backend/dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Local build smoke test**

```bash
docker build -f packages/backend/Dockerfile -t pantry-backend:dev .
```

Expected: build succeeds. Should produce an image around 200-300 MB.

- [ ] **Step 4: Local run smoke test (will fail — env vars missing — that's the point)**

```bash
docker run --rm -p 18080:8080 pantry-backend:dev
```

Expected: fast crash with zod parse error mentioning `PUBLIC_BACKEND_URL` (and SUPABASE_URL, JWT_SIGNING_KEY, DISCORD_*) — proves config validation runs.

- [ ] **Step 5: Local run with a dummy env, hit `/health`**

```bash
docker run --rm -p 18080:8080 \
  -e PUBLIC_BACKEND_URL=https://example.test \
  -e SUPABASE_URL=https://x.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=k \
  -e JWT_SIGNING_KEY=this-is-just-thirty-two-bytes-long-for-test \
  -e DISCORD_CLIENT_ID=d \
  -e DISCORD_CLIENT_SECRET=d \
  pantry-backend:dev &

sleep 2
curl -fsS http://localhost:18080/health
docker ps --filter ancestor=pantry-backend:dev -q | xargs -r docker kill
```

Expected: `{"ok":true}`. Discord OAuth callback against `example.test` will fail in real life, that's fine — we're only sanity-checking startup + health.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore packages/backend/Dockerfile packages/backend/.dockerignore
git commit -m "chore(backend): Dockerfile and dockerignore for prod image"
```

### Task 6: Production env example + Compose file

**Files:**
- Create: `.env.example` (repo root)
- Create: `docker-compose.yml` (repo root)

- [ ] **Step 1: Create `.env.example` at repo root** with this exact content:

```
# pantry backend production env
# Copy to .env on the VM and fill in real values.

# Public URL the backend serves under (Cloudflare Tunnel hostname). MUST be https.
PUBLIC_BACKEND_URL=https://pantry.miao-bao.cc

# Supabase project (the existing one — migrations already pushed)
SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>

# Session JWT signing key. Generate with: openssl rand -base64 48
JWT_SIGNING_KEY=<JWT_SIGNING_KEY>

# OAuth — Discord only for MVP. GitHub/Google left blank; backend returns 503 if selected.
DISCORD_CLIENT_ID=<DISCORD_CLIENT_ID>
DISCORD_CLIENT_SECRET=<DISCORD_CLIENT_SECRET>

# Optional — uncomment + fill in to enable
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

NODE_ENV=production
PORT=8080
```

- [ ] **Step 2: Create `docker-compose.yml` at repo root** with this exact content:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    image: pantry-backend:latest
    container_name: pantry-backend
    restart: unless-stopped
    ports:
      - "127.0.0.1:8081:8080"
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Notes:
- Host port bound to `127.0.0.1` only — cloudflared on the host reaches it via loopback; nothing exposed publicly.
- `:8081` chosen to avoid colliding with the existing `wisp-wisp-1` container.
- `build.context: .` means compose builds from the same directory it lives in (repo root). On the VM, the repo working tree IS `/opt/pantry`, so `docker compose up --build` rebuilds from the synced source.
- `wget` is present in `node:20-alpine`.

- [ ] **Step 3: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "chore(deploy): docker-compose + env template (build on host)"
```

---

## Phase 3: First deploy on the VM (rsync → build → up)

### Task 7: Sync source to VM and bring the service up

This task is purely VM-side ops; no code changes, no commit.

The user's `.env` already exists at `/opt/pantry/.env` (populated during plan-prep). We rsync the repo into `/opt/pantry/` while excluding `.env` so the secrets stay put, then `docker compose up -d --build` from inside.

- [ ] **Step 1: From your local machine, dry-run the rsync to verify the exclude list**

```bash
cd "$(git rev-parse --show-toplevel)"
rsync -avzn --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules' \
  --exclude='**/node_modules' \
  --exclude='dist' \
  --exclude='**/dist' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='coverage' \
  ./ wisp:/opt/pantry/
```

Expected: a list of files that WOULD be transferred (the `n` flag = dry-run). Confirm `.env` is **not** in the list. If it is, fix the exclude before continuing.

- [ ] **Step 2: Real rsync**

Same command without `-n`:

```bash
rsync -avz --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules' \
  --exclude='**/node_modules' \
  --exclude='dist' \
  --exclude='**/dist' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='coverage' \
  ./ wisp:/opt/pantry/
```

Expected: files transferred, `.env` on the VM untouched. Verify on the VM:

```bash
ssh wisp 'ls -la /opt/pantry/.env /opt/pantry/docker-compose.yml /opt/pantry/packages/backend/Dockerfile'
```

All three should exist; `.env` should still be mode 600.

- [ ] **Step 3: Build + start on the VM**

```bash
ssh wisp 'cd /opt/pantry && docker compose up -d --build'
```

Expected: docker build runs (~2-5 min on this VM — tight on RAM but should complete), then container starts. First build will be slowest; subsequent rebuilds reuse layers.

If build OOMs (`tsc` killed mid-compile), try a low-memory workaround:

```bash
ssh wisp 'cd /opt/pantry && docker compose build --memory 1g && docker compose up -d'
```

- [ ] **Step 4: Check status**

```bash
ssh wisp 'cd /opt/pantry && docker compose ps'
```

Expected: `pantry-backend` listed, status `Up (healthy)` after ~15 s of start_period.

- [ ] **Step 5: Local-loopback health check on the VM**

```bash
ssh wisp 'curl -fsS http://127.0.0.1:8081/health'
```

Expected: `{"ok":true}`.

If this fails: `ssh wisp 'cd /opt/pantry && docker compose logs --tail=50 backend'` — most likely a zod env-parse error (missing/malformed env var) or a Discord secret typo.

- [ ] **Step 6: Disk hygiene check**

A first build can leave 1-2 GB of intermediate layers. The VM has 5 GB free, so monitor:

```bash
ssh wisp 'df -h / && docker system df'
```

If `/` drops below 1 GB free, prune:

```bash
ssh wisp 'docker builder prune -f && docker image prune -f'
```

---

## Phase 4: Cloudflare Tunnel ingress

### Task 8: Wire the sub-domain through cloudflared

**Files:**
- Create: `deploy/cloudflared-ingress.example.yml`

- [ ] **Step 1: Identify the tunnel**

On the VM:

```bash
cloudflared tunnel list
```

Note `<TUNNEL_NAME>` and tunnel ID. The active tunnel's config is usually `/etc/cloudflared/config.yml` or `~/.cloudflared/config.yml`.

- [ ] **Step 2: Find the config file**

```bash
systemctl cat cloudflared | grep -E 'ExecStart|--config'
ls -la /etc/cloudflared/ ~/.cloudflared/ 2>/dev/null
```

Identify which `config.yml` is loaded.

- [ ] **Step 3: Create `deploy/cloudflared-ingress.example.yml`** in the repo (this is documentation only — the live config lives on the VM):

```yaml
# Add this entry to the `ingress:` list in your cloudflared config.yml on the VM.
# It MUST come BEFORE the catch-all `service: http_status:404`.

  - hostname: pantry.miao-bao.cc
    service: http://localhost:8081
```

- [ ] **Step 4: Edit the live config on the VM**

```bash
sudo $EDITOR /etc/cloudflared/config.yml   # (or wherever it lives)
```

Insert the snippet inside the existing `ingress:` list, ABOVE the final `- service: http_status:404` line.

- [ ] **Step 5: Validate and reload**

```bash
cloudflared tunnel ingress validate
sudo systemctl reload cloudflared || sudo systemctl restart cloudflared
systemctl status cloudflared --no-pager | head -10
```

Expected: `validate` prints OK; service stays active.

- [ ] **Step 6: Map the DNS record (in Cloudflare dashboard)**

In Cloudflare → DNS, or via CLI on the VM:

```bash
cloudflared tunnel route dns <TUNNEL_NAME> pantry.miao-bao.cc
```

Expected: prints `Added CNAME pantry.miao-bao.cc ...`. (Returns an error if already wired — fine.)

- [ ] **Step 7: End-to-end smoke test**

From your local machine:

```bash
curl -fsS https://pantry.miao-bao.cc/health
```

Expected: `{"ok":true}`. TLS handled by Cloudflare; backend served via tunnel.

- [ ] **Step 8: Commit the example file**

```bash
git add deploy/cloudflared-ingress.example.yml
git commit -m "docs(deploy): example cloudflared ingress snippet"
```

---

## Phase 5: Discord OAuth registration

### Task 9: Register Discord app and run OAuth round-trip

This task is mostly portal clicks; no code.

- [ ] **Step 1: Discord Developer Portal**

Visit https://discord.com/developers/applications → **New Application** → name e.g. `pantry (prod)`.

- [ ] **Step 2: OAuth2 → Redirects → Add**

```
https://pantry.miao-bao.cc/auth/oauth/callback
```

Save.

- [ ] **Step 3: OAuth2 → Client information**

Copy `CLIENT ID` → store as `DISCORD_CLIENT_ID`.
Press `Reset Secret` → copy `CLIENT SECRET` → store as `DISCORD_CLIENT_SECRET`. **The secret is only shown once.**

- [ ] **Step 4: Update the VM `.env`** if you used placeholder values in Task 7

```bash
ssh wisp 'sed -i "s|^DISCORD_CLIENT_ID=.*|DISCORD_CLIENT_ID=<DISCORD_CLIENT_ID>|" /opt/pantry/.env'
ssh wisp 'sed -i "s|^DISCORD_CLIENT_SECRET=.*|DISCORD_CLIENT_SECRET=<DISCORD_CLIENT_SECRET>|" /opt/pantry/.env'
ssh wisp 'cd /opt/pantry && docker compose up -d'
```

(`up -d` re-creates the container with the new env.)

- [ ] **Step 5: OAuth start endpoint smoke test**

```bash
curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"provider":"discord"}' \
  https://pantry.miao-bao.cc/auth/oauth/start
```

Expected: JSON with `authUrl` pointing at `discord.com/api/oauth2/authorize?...`, `pollUrl`, and `state`.

- [ ] **Step 6: Full OAuth round-trip**

In a browser, open the `authUrl` from Step 5. Authorise. You should land on `https://pantry.miao-bao.cc/auth/oauth/callback?...` and see "Signed in!".

If this works, OAuth is wired end-to-end. No commit (no code change in this task).

---

## Phase 6: Client npm publish

### Task 10: Make `packages/client` publishable

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/cli.tsx`
- Create: `packages/client/README.md`

- [ ] **Step 1: Add shebang to `src/cli.tsx`**

Open `packages/client/src/cli.tsx`. The very first line MUST become:

```typescript
#!/usr/bin/env node
```

The rest of the file is unchanged. `tsc` preserves the shebang.

- [ ] **Step 2: Update `packages/client/package.json`** — replace its contents with:

```json
{
  "name": "@noracami/pantry",
  "version": "0.1.0",
  "description": "Tiny TUI chat client (companion to the pantry backend)",
  "type": "module",
  "bin": {
    "pantry": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli.tsx",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prepublishOnly": "pnpm run build && chmod +x dist/cli.js"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "ink-select-input": "^6.0.0",
    "ink-text-input": "^6.0.0",
    "open": "^10.1.0",
    "react": "^18.3.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/ws": "^8.5.10",
    "ink-testing-library": "^4.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "ws": "^8.18.0"
  }
}
```

Key changes vs. previous `package.json`:
- `name` switched from `pantry` (workspace-internal) to `@noracami/pantry` (the scoped npm name).
- `@pantry/shared` removed from dependencies (it's a workspace package and will be bundled into the client's `dist`; see Step 3).
- `version: 0.1.0`, `files: ["dist", "README.md"]`, `publishConfig.access: public`, `prepublishOnly` script that runs build + ensures executable bit.

Note: removing `@pantry/shared` from dependencies means `tsc` must inline the shared package into the client's `dist`. Step 3 handles this.

- [ ] **Step 3: Inline `@pantry/shared` into the client tsconfig** — open `packages/client/tsconfig.json` and add `paths` so the import resolves to source (this way `tsc --build` will copy the compiled JS into the client's `dist`):

Replace the file with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "..",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react",
    "noEmit": false,
    "declaration": false,
    "sourceMap": false,
    "paths": {
      "@pantry/shared": ["../shared/src/index.ts"],
      "@pantry/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src/**/*", "../shared/src/**/*"]
}
```

Note: `rootDir: ".."` is required so emitted output of files under `../shared/src/*` lands inside `dist/`. Verify after build that `dist/` looks like:

```
dist/
  client/   <- compiled from packages/client/src
    src/
      cli.js
      app.js
      ...
  shared/
    src/
      index.js
      ...
```

If the emitted layout differs and `cli.js` ends up at `dist/cli.js` directly (because tsc collapses single-package), update the `bin` field to match the actual emitted path. Sanity check in Step 5.

- [ ] **Step 4: Build and verify shape**

```bash
cd packages/client
rm -rf dist
pnpm run build
find dist -maxdepth 3 -type f | sort | head -30
```

Expected: see compiled `*.js` for both client and shared. Note the actual path to the compiled `cli.js`.

- [ ] **Step 5: If `cli.js` ended up at a different path, fix `bin`**

If `find` shows `dist/client/src/cli.js`, change `package.json` `bin` to:

```json
  "bin": {
    "pantry": "./dist/client/src/cli.js"
  },
```

Re-run `pnpm run build`.

- [ ] **Step 6: Verify the binary works locally**

```bash
node dist/<path-to-cli.js> --help 2>&1 | head -20
```

(If `--help` isn't supported, just run without `--help` for two seconds and Ctrl+C — the goal is to confirm Node can execute it.)

- [ ] **Step 7: Create `packages/client/README.md`** with this exact content (replace `@noracami/pantry` and `pantry.miao-bao.cc` with your actual values when committing):

```markdown
# pantry

Tiny TUI chat client. Companion to a pantry backend.

## Usage

```sh
npx @noracami/pantry
```

Steps inside the TUI:
1. Type a room name → Enter.
2. Pick Anonymous (Discord OAuth also supported).
3. Type a nickname (for anon) or sign in.
4. Chat. `/nick <name>` to rename. `Ctrl+C` to quit.

## CLI flags

| Flag | Description |
|---|---|
| `--server <ws-url>` | Override the backend WebSocket URL. Defaults to `wss://pantry.miao-bao.cc/ws`. |
| (env) `PANTRY_SERVER` | Same as `--server`. |

## Source

https://github.com/<your-gh-handle>/pantry
```

- [ ] **Step 8: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json \
        packages/client/src/cli.tsx packages/client/README.md
git commit -m "chore(client): package for npm publish (bin, files, shebang, bundled shared)"
```

### Task 11: Dry-run publish, then publish

- [ ] **Step 1: npm auth (one-time)**

```bash
npm whoami
```

If "not logged in":

```bash
npm login
```

- [ ] **Step 2: Pack inspection**

```bash
cd packages/client
npm pack --dry-run 2>&1 | head -40
```

Expected: lists files under `dist/` and `README.md`. **Should NOT** contain `src/`, `node_modules/`, `*.test.*`. If it does, fix the `files` array.

- [ ] **Step 3: First publish**

```bash
pnpm publish --no-git-checks
```

Expected: `+ @noracami/pantry@0.1.0`. If the registry rejects with "package name already taken", change the `name` field and re-pack.

- [ ] **Step 4: Smoke test via npx**

In a fresh terminal (or even a fresh VM, anywhere with Node ≥ 20):

```bash
npx @noracami/pantry@latest
```

Expected: the TUI opens at the Room input screen.

- [ ] **Step 5: Tag the publish in git**

```bash
git tag -a client-v0.1.0 -m "client v0.1.0 first publish"
git push --tags 2>/dev/null || echo "(no remote; tag stays local)"
```

No commit beyond the tag.

---

## Phase 7: End-to-end smoke test (real users, real OAuth)

### Task 12: Two-client live smoke test

This produces no code; it validates the whole stack.

- [ ] **Step 1: Open two terminals** (yours + a friend's machine works best — different IPs surface bugs that two terminals on one host hide)

In each:

```bash
npx @noracami/pantry@latest
```

- [ ] **Step 2: Anonymous round-trip**
- Room: `prod-smoke`
- Identity: Anonymous
- Nickname: `Alice` / `Bob`

Expected:
- Both clients reach the chat screen, status `Connected` in green.
- A `── Bob#xxxx joined ──` line in Alice's terminal once Bob arrives.
- Typing `hello` in Alice's terminal makes it appear in both.
- `/nick Alicia` produces `── Alice#xxxx → Alicia#xxxx ──` in both.

- [ ] **Step 3: Discord OAuth round-trip** (one client)

Restart one client. At the Identity screen, select **Discord**. A browser tab opens, you authorise on Discord, the browser shows "Signed in!", and the TUI lands in chat.

- [ ] **Step 4: Reconnect smoke**

On the VM:

```bash
cd /opt/pantry
docker compose stop backend
```

Expected on clients: status flips to `Reconnecting (attempt N)` (yellow).

```bash
docker compose start backend
```

Expected on clients: status flips back to `Connected` once the backend is healthy.

- [ ] **Step 5: Cleanup**

```bash
ssh wisp 'cd /opt/pantry && docker compose ps'
```

(No teardown — leave running. Use `pnpm admin room delete prod-smoke -y` against the prod backend if you want to drop the test room.)

- [ ] **Step 6: Document outcome**

In the project root, append a one-line note to `README.md` (create it if absent) under a `## Production` heading:

```markdown
## Production
- Backend: https://pantry.miao-bao.cc
- Client: `npx @noracami/pantry@latest`
```

```bash
git add README.md
git commit -m "docs: note production URLs"
```

---

## Phase 8: One-touch redeploy script

### Task 13: One-touch deploy script

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create the script** with this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Sync local source to wisp and rebuild + restart pantry-backend.
# Run from anywhere inside the repo:
#   ./scripts/deploy.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> rsync source to wisp:/opt/pantry"
rsync -avz --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules' \
  --exclude='**/node_modules' \
  --exclude='dist' \
  --exclude='**/dist' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='coverage' \
  ./ wisp:/opt/pantry/

echo "==> docker compose up -d --build on wisp"
ssh wisp '
  set -euo pipefail
  cd /opt/pantry
  docker compose up -d --build
  docker compose ps
'

echo "==> verifying /health"
ssh wisp 'curl -fsS http://127.0.0.1:8081/health' && echo
```

- [ ] **Step 2: Make executable + smoke test**

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Expected: rsync transfers a small delta (no changes if nothing was edited since last deploy), build either reuses cache or rebuilds quickly, container ends `Up (healthy)`, `/health` returns `{"ok":true}`.

- [ ] **Step 3: Commit**

```bash
git add scripts/deploy.sh
git commit -m "chore(deploy): one-touch rsync + rebuild deploy script"
```

### Task 14: (Deferred) Push-to-deploy via existing webhook

Skip this task — it requires a Git remote (e.g. GitHub) that the VM can `git pull` from, which is out of scope for this plan. Documenting the future shape only:

When you push the repo to GitHub:
1. On the VM: `cd /opt/pantry && git remote add origin <github-url> && git fetch origin main && git reset --hard origin/main` (one-time bootstrap)
2. Wire the existing `deploy-webhook.service` (`:9000`) with a `pantry` hook that runs:
   ```bash
   cd /opt/pantry && git pull --ff-only && docker compose up -d --build
   ```
3. Reload: `sudo systemctl restart deploy-webhook`
4. Add a GitHub Actions workflow that POSTs to the webhook on `main` pushes.

For now, `scripts/deploy.sh` from Task 13 is the deploy mechanism.

---

## Done — Plan C Exit Criteria

- `https://pantry.miao-bao.cc/health` returns `{"ok":true}` from the open internet.
- `npx @noracami/pantry@latest` (no flags) opens the TUI from a clean machine; default server URL is the production sub-domain (baked into the client at build time).
- Two clients can exchange messages via the production backend.
- Discord OAuth round-trip completes in a real browser; the TUI lands in chat as the authenticated user.
- GitHub / Google selections from the identity screen produce a clean ErrorScreen ("Provider not configured…"), not a crash.
- `./scripts/deploy.sh` rsyncs source, rebuilds the image on the VM, and rolls out the new container.

**Out of scope (deferred):**
- GitHub / Google OAuth round-trip (just add env vars + redeploy; no code change needed).
- Multi-region failover or rolling deploy — the VM and the tunnel terminate at one point.
- Monitoring + alerting (the existing fluent-bit + otelopscol on the VM likely already collect; out of scope here).
- Image vulnerability scanning / supply-chain attestation.
- Push-to-deploy via Git remote + webhook (sketched in Task 14; requires GitHub remote).
