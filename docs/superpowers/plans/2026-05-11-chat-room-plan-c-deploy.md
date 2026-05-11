# Chat-Room Plan C: Deploy backend + publish client to npm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship chat-room MVP — backend running on a GCP VM behind Cloudflare Tunnel with Discord OAuth, client published to npm and runnable via `npx`.

**Architecture:**
- Backend dockerised, runs on existing VM (host `wisp`, Ubuntu 24.04, Docker 29.3), host port `8081 → container 8080` to avoid colliding with existing `wisp-wisp-1` container on `:8080`. Image pushed to Artifact Registry `asia-east1-docker.pkg.dev/careful-broker-485510-r0/chat-room/backend`.
- Public HTTPS via Cloudflare Tunnel — VM `cloudflared` (already active) forwards a sub-domain to `http://localhost:8081`. No public ports opened on the VM.
- Discord-only OAuth for MVP. GitHub / Google secrets become optional in the backend config schema; auth start returns `503` for unconfigured providers; client renders ErrorScreen.
- Client published as a scoped npm package, runnable via `npx <pkg> --server wss://<sub-domain>`.

**Tech Stack:** Node 20, pnpm 9 workspace, Fastify, Docker + Compose v5.1, Cloudflare Tunnel, GitHub Artifact Registry, supabase (already provisioned), Discord OAuth.

---

## Prerequisites — fill these in BEFORE starting Task 1

These values are referenced by exact placeholders throughout the plan. Replace every occurrence in commands / config when you reach the step.

| Placeholder | Meaning | How to obtain |
|---|---|---|
| `<SUBDOMAIN>` | e.g. `chat.example.com` | Pick a sub-domain on a Cloudflare-managed zone you control |
| `<DISCORD_CLIENT_ID>` | Discord app's Client ID | Discord Developer Portal → New Application → OAuth2 → Client ID |
| `<DISCORD_CLIENT_SECRET>` | Discord app's Client Secret | Same page, "Reset Secret" |
| `<SUPABASE_URL>` | e.g. `https://abcdefgh.supabase.co` | Existing Supabase project → Project Settings → API |
| `<SUPABASE_SERVICE_ROLE_KEY>` | service_role secret | Same page (NEVER paste into client; backend only) |
| `<JWT_SIGNING_KEY>` | 32+ random chars | `openssl rand -base64 48` |
| `<NPM_PACKAGE_NAME>` | default `@noracami/chat-room` | npm scoped package; change only if you've already claimed another |
| `<GCP_PROJECT_ID>` | `careful-broker-485510-r0` | From your existing setup (already inspected) |
| `<TUNNEL_NAME>` | name of your existing Cloudflare tunnel | `cloudflared tunnel list` on the VM |

### Discord redirect URL to register on Discord Developer Portal

```
https://<SUBDOMAIN>/auth/oauth/callback
```

(Single callback for all providers — backend looks the provider up by `state`.)

---

## File Structure (Plan C only)

**Backend container packaging:**
- Create: `packages/backend/Dockerfile`
- Create: `packages/backend/.dockerignore`
- Create: `deploy/docker-compose.yml` — chat-room service definition
- Create: `deploy/.env.example` — documented env-var template
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
- Modify: `packages/shared/package.json` — ensure publishable shape (private OK if bundled, but `chat-room` depends on `@chat-room/shared` via workspace; for publish we will inline-build shared into client `dist` via tsc — see Task 12)

**Deploy helpers:**
- Create: `scripts/build-and-push-backend.sh`
- Create: `scripts/deploy-backend.sh` (runs on the VM via `ssh wisp`)

**Docs:**
- Modify: `README.md` (or create if missing) — production deploy + npx usage

---

## Architecture Notes

### Why host port 8081, not 8080
`ss -tlnp` on the VM shows `wisp-wisp-1` already binds host 8080. Re-binding fails. The chat-room **container** still listens on 8080 internally (no app changes); only the `ports:` mapping in compose changes.

### Why Cloudflare Tunnel, not a public load balancer
- VM already runs `cloudflared` as a systemd service
- No firewall change required (no public ingress port)
- Free TLS handled at Cloudflare edge
- Drop-in for OAuth callbacks (Discord requires HTTPS)

### Why scoped npm package (`@noracami/chat-room`)
- Scoped packages are guaranteed-free under your own scope, no name-squat risk
- `npx @noracami/chat-room` is one extra character; acceptable
- `--access public` on first publish

### Why Discord-only MVP
- Single OAuth app to register; no Google verification queue
- Existing client UI shows all 4 identity options (anon + 3 OAuth); we relax backend so unconfigured providers return 503 cleanly, and client surfaces "Provider not configured" in ErrorScreen
- Re-enabling GH/Google later is just adding env vars + redeploy

### Why supabase migrations are not in Plan C
You confirmed migrations are already pushed to the existing project. Plan C only consumes `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env.

### Image registry path
`asia-east1-docker.pkg.dev/careful-broker-485510-r0/chat-room/backend:<tag>` — a new repository `chat-room` inside the existing project. Repo creation is Task 8.

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
pnpm --filter @chat-room/backend test -- src/config.test.ts
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
pnpm --filter @chat-room/backend test -- src/config.test.ts
```

Expected: all pass. If the file `providers.ts` complains about `config.oauth.github.clientId` (since `github` is now optional), that is intentional — handled in Task 2.

- [ ] **Step 5: Run typecheck** (will reveal `auth/routes.ts` and `auth/providers.ts` callsites)

```bash
pnpm --filter @chat-room/backend typecheck
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
pnpm --filter @chat-room/backend typecheck
pnpm --filter @chat-room/backend test
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
pnpm --filter chat-room test
pnpm --filter chat-room typecheck
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
RUN pnpm install --frozen-lockfile --filter @chat-room/backend...

# --- build shared then backend ---
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN pnpm --filter @chat-room/shared build \
 && pnpm --filter @chat-room/backend build

# --- runtime: re-install prod-only deps, then copy dist ---
FROM base AS runtime
WORKDIR /app
COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --prod --filter @chat-room/backend...
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/backend/dist packages/backend/dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Local build smoke test**

```bash
docker build -f packages/backend/Dockerfile -t chat-room-backend:dev .
```

Expected: build succeeds. Should produce an image around 200-300 MB.

- [ ] **Step 4: Local run smoke test (will fail — env vars missing — that's the point)**

```bash
docker run --rm -p 18080:8080 chat-room-backend:dev
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
  chat-room-backend:dev &

sleep 2
curl -fsS http://localhost:18080/health
docker ps --filter ancestor=chat-room-backend:dev -q | xargs -r docker kill
```

Expected: `{"ok":true}`. Discord OAuth callback against `example.test` will fail in real life, that's fine — we're only sanity-checking startup + health.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore packages/backend/Dockerfile packages/backend/.dockerignore
git commit -m "chore(backend): Dockerfile and dockerignore for prod image"
```

### Task 6: Production env example + Compose file

**Files:**
- Create: `deploy/.env.example`
- Create: `deploy/docker-compose.yml`

- [ ] **Step 1: Create `deploy/.env.example`** with this exact content:

```
# chat-room backend production env
# Copy to deploy/.env on the VM and fill in real values.

# Public URL the backend serves under (Cloudflare Tunnel hostname). MUST be https.
PUBLIC_BACKEND_URL=https://<SUBDOMAIN>

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

- [ ] **Step 2: Create `deploy/docker-compose.yml`** with this exact content:

```yaml
services:
  backend:
    image: asia-east1-docker.pkg.dev/careful-broker-485510-r0/chat-room/backend:latest
    container_name: chat-room-backend
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
- `wget` is present in `node:20-alpine`.

- [ ] **Step 3: Commit**

```bash
git add deploy/.env.example deploy/docker-compose.yml
git commit -m "chore(deploy): docker-compose + env template for VM"
```

---

## Phase 3: Image registry + push

### Task 7: Confirm gcloud auth on local machine

- [ ] **Step 1:** Run:

```bash
gcloud config get-value project
gcloud auth list
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

Expected: project shows `careful-broker-485510-r0` (or you set it: `gcloud config set project careful-broker-485510-r0`). `auth list` shows an account marked `ACTIVE`. `configure-docker` writes a credHelper into `~/.docker/config.json`.

- [ ] **Step 2:** If `gcloud` is not signed in:

```bash
gcloud auth login
gcloud config set project careful-broker-485510-r0
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

No commit — this is one-time machine setup.

### Task 8: Create Artifact Registry repo for chat-room

- [ ] **Step 1:** Create the repo (skip if `gcloud artifacts repositories describe chat-room --location=asia-east1` already returns success):

```bash
gcloud artifacts repositories create chat-room \
  --repository-format=docker \
  --location=asia-east1 \
  --description="chat-room backend images"
```

Expected: `Created repository [chat-room].` — or `ALREADY_EXISTS` (ignore).

- [ ] **Step 2:** Verify visibility:

```bash
gcloud artifacts repositories list --location=asia-east1
```

Expected: `chat-room` in the list.

No commit.

### Task 9: Build + push script

**Files:**
- Create: `scripts/build-and-push-backend.sh`

- [ ] **Step 1: Create the script** with this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build the backend image and push to Artifact Registry.
# Tags: <git-sha> + latest
#
# Run from repo root:
#   ./scripts/build-and-push-backend.sh

REGISTRY="asia-east1-docker.pkg.dev/careful-broker-485510-r0/chat-room"
IMAGE="${REGISTRY}/backend"
SHA="$(git rev-parse --short HEAD)"

cd "$(git rev-parse --show-toplevel)"

echo "==> Building ${IMAGE}:${SHA}"
docker buildx build \
  --platform linux/amd64 \
  -f packages/backend/Dockerfile \
  -t "${IMAGE}:${SHA}" \
  -t "${IMAGE}:latest" \
  --push \
  .

echo "==> Pushed:"
echo "    ${IMAGE}:${SHA}"
echo "    ${IMAGE}:latest"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/build-and-push-backend.sh
```

- [ ] **Step 3: First run — push the image**

```bash
./scripts/build-and-push-backend.sh
```

Expected: buildx builds for `linux/amd64` (matches the VM) and pushes both tags. If you don't have `buildx`, install Docker Desktop / `docker-buildx-plugin`; or replace with two steps: `docker build` + `docker push`. The cross-platform flag matters because if you build on a Mac M-series, native is `linux/arm64` and the VM is `linux/amd64`.

- [ ] **Step 4: Confirm in Artifact Registry**

```bash
gcloud artifacts docker images list \
  asia-east1-docker.pkg.dev/careful-broker-485510-r0/chat-room/backend
```

Expected: two rows for the latest two tags.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-and-push-backend.sh
git commit -m "chore(deploy): build-and-push backend script"
```

---

## Phase 4: First deploy on the VM

### Task 10: Provision deploy dir on VM, pull image, run

- [ ] **Step 1: Open a shell on the VM**

```bash
ssh wisp
```

- [ ] **Step 2: Create the deploy dir**

```bash
sudo mkdir -p /opt/chat-room
sudo chown "$USER":"$USER" /opt/chat-room
cd /opt/chat-room
```

- [ ] **Step 3: Configure Docker to pull from Artifact Registry**

```bash
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

If `gcloud` is not present on the VM, install (one-time):

```bash
sudo apt-get update && sudo apt-get install -y google-cloud-cli
gcloud auth login
gcloud config set project careful-broker-485510-r0
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

(Alternatively, attach a service account to the VM; for MVP, user-account login is fine.)

- [ ] **Step 4: Place the compose file** — back on your local machine, scp it up:

```bash
scp deploy/docker-compose.yml wisp:/opt/chat-room/docker-compose.yml
```

- [ ] **Step 5: Create the env file on the VM** (the `<…>` values come from the Prerequisites table at the top of this plan)

On the VM:

```bash
cat > /opt/chat-room/.env <<'EOF'
PUBLIC_BACKEND_URL=https://<SUBDOMAIN>
SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
JWT_SIGNING_KEY=<JWT_SIGNING_KEY>
DISCORD_CLIENT_ID=<DISCORD_CLIENT_ID>
DISCORD_CLIENT_SECRET=<DISCORD_CLIENT_SECRET>
NODE_ENV=production
PORT=8080
EOF
chmod 600 /opt/chat-room/.env
```

- [ ] **Step 6: Pull + start**

```bash
cd /opt/chat-room
docker compose pull
docker compose up -d
docker compose ps
```

Expected: `chat-room-backend` listed, status `Up (healthy)` after ~15 s.

- [ ] **Step 7: Local-loopback health check on the VM**

```bash
curl -fsS http://127.0.0.1:8081/health
```

Expected: `{"ok":true}`.

If this fails: `docker compose logs --tail=50 backend` — most likely a zod env-parse error.

No commit (this task is purely server-side ops).

---

## Phase 5: Cloudflare Tunnel ingress

### Task 11: Wire the sub-domain through cloudflared

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

  - hostname: <SUBDOMAIN>
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
cloudflared tunnel route dns <TUNNEL_NAME> <SUBDOMAIN>
```

Expected: prints `Added CNAME <SUBDOMAIN> ...`. (Returns an error if already wired — fine.)

- [ ] **Step 7: End-to-end smoke test**

From your local machine:

```bash
curl -fsS https://<SUBDOMAIN>/health
```

Expected: `{"ok":true}`. TLS handled by Cloudflare; backend served via tunnel.

- [ ] **Step 8: Commit the example file**

```bash
git add deploy/cloudflared-ingress.example.yml
git commit -m "docs(deploy): example cloudflared ingress snippet"
```

---

## Phase 6: Discord OAuth registration

### Task 12: Register Discord app and run OAuth round-trip

This task is mostly portal clicks; no code.

- [ ] **Step 1: Discord Developer Portal**

Visit https://discord.com/developers/applications → **New Application** → name e.g. `chat-room (prod)`.

- [ ] **Step 2: OAuth2 → Redirects → Add**

```
https://<SUBDOMAIN>/auth/oauth/callback
```

Save.

- [ ] **Step 3: OAuth2 → Client information**

Copy `CLIENT ID` → store as `DISCORD_CLIENT_ID`.
Press `Reset Secret` → copy `CLIENT SECRET` → store as `DISCORD_CLIENT_SECRET`. **The secret is only shown once.**

- [ ] **Step 4: Update the VM `.env`** if you used placeholder values in Task 10

```bash
ssh wisp 'sed -i "s|^DISCORD_CLIENT_ID=.*|DISCORD_CLIENT_ID=<DISCORD_CLIENT_ID>|" /opt/chat-room/.env'
ssh wisp 'sed -i "s|^DISCORD_CLIENT_SECRET=.*|DISCORD_CLIENT_SECRET=<DISCORD_CLIENT_SECRET>|" /opt/chat-room/.env'
ssh wisp 'cd /opt/chat-room && docker compose up -d'
```

(`up -d` re-creates the container with the new env.)

- [ ] **Step 5: OAuth start endpoint smoke test**

```bash
curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"provider":"discord"}' \
  https://<SUBDOMAIN>/auth/oauth/start
```

Expected: JSON with `authUrl` pointing at `discord.com/api/oauth2/authorize?...`, `pollUrl`, and `state`.

- [ ] **Step 6: Full OAuth round-trip**

In a browser, open the `authUrl` from Step 5. Authorise. You should land on `https://<SUBDOMAIN>/auth/oauth/callback?...` and see "Signed in!".

If this works, OAuth is wired end-to-end. No commit (no code change in this task).

---

## Phase 7: Client npm publish

### Task 13: Make `packages/client` publishable

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
  "name": "<NPM_PACKAGE_NAME>",
  "version": "0.1.0",
  "description": "Tiny TUI chat client (companion to the chat-room backend)",
  "type": "module",
  "bin": {
    "chat-room": "./dist/cli.js"
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
- `name` switched from `chat-room` (workspace-internal) to `<NPM_PACKAGE_NAME>` (the scoped npm name).
- `@chat-room/shared` removed from dependencies (it's a workspace package and will be bundled into the client's `dist`; see Step 3).
- `version: 0.1.0`, `files: ["dist", "README.md"]`, `publishConfig.access: public`, `prepublishOnly` script that runs build + ensures executable bit.

Note: removing `@chat-room/shared` from dependencies means `tsc` must inline the shared package into the client's `dist`. Step 3 handles this.

- [ ] **Step 3: Inline `@chat-room/shared` into the client tsconfig** — open `packages/client/tsconfig.json` and add `paths` so the import resolves to source (this way `tsc --build` will copy the compiled JS into the client's `dist`):

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
      "@chat-room/shared": ["../shared/src/index.ts"],
      "@chat-room/shared/*": ["../shared/src/*"]
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
    "chat-room": "./dist/client/src/cli.js"
  },
```

Re-run `pnpm run build`.

- [ ] **Step 6: Verify the binary works locally**

```bash
node dist/<path-to-cli.js> --server wss://<SUBDOMAIN> --help 2>&1 | head -20
```

(If `--help` isn't supported, just run without `--help` for two seconds and Ctrl+C — the goal is to confirm Node can execute it.)

- [ ] **Step 7: Create `packages/client/README.md`** with this exact content (replace `<NPM_PACKAGE_NAME>` and `<SUBDOMAIN>` with your actual values when committing):

```markdown
# chat-room

Tiny TUI chat client. Companion to a chat-room backend.

## Usage

```sh
npx <NPM_PACKAGE_NAME> --server wss://<SUBDOMAIN>
```

Steps inside the TUI:
1. Type a room name → Enter.
2. Pick Anonymous (Discord OAuth also supported).
3. Type a nickname (for anon) or sign in.
4. Chat. `/nick <name>` to rename. `Ctrl+C` to quit.

## CLI flags

| Flag | Description |
|---|---|
| `--server <ws-url>` | Backend WebSocket URL. Defaults to `ws://localhost:8080`. |
| (env) `CHAT_ROOM_SERVER` | Same as `--server`. |

## Source

https://github.com/<your-gh-handle>/chat-room
```

- [ ] **Step 8: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json \
        packages/client/src/cli.tsx packages/client/README.md
git commit -m "chore(client): package for npm publish (bin, files, shebang, bundled shared)"
```

### Task 14: Dry-run publish, then publish

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

Expected: `+ <NPM_PACKAGE_NAME>@0.1.0`. If the registry rejects with "package name already taken", change the `name` field and re-pack.

- [ ] **Step 4: Smoke test via npx**

In a fresh terminal (or even a fresh VM, anywhere with Node ≥ 20):

```bash
npx <NPM_PACKAGE_NAME>@latest --server wss://<SUBDOMAIN>
```

Expected: the TUI opens at the Room input screen.

- [ ] **Step 5: Tag the publish in git**

```bash
git tag -a client-v0.1.0 -m "client v0.1.0 first publish"
git push --tags 2>/dev/null || echo "(no remote; tag stays local)"
```

No commit beyond the tag.

---

## Phase 8: End-to-end smoke test (real users, real OAuth)

### Task 15: Two-client live smoke test

This produces no code; it validates the whole stack.

- [ ] **Step 1: Open two terminals** (yours + a friend's machine works best — different IPs surface bugs that two terminals on one host hide)

In each:

```bash
npx <NPM_PACKAGE_NAME>@latest --server wss://<SUBDOMAIN>
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
cd /opt/chat-room
docker compose stop backend
```

Expected on clients: status flips to `Reconnecting (attempt N)` (yellow).

```bash
docker compose start backend
```

Expected on clients: status flips back to `Connected` once the backend is healthy.

- [ ] **Step 5: Cleanup**

```bash
ssh wisp 'cd /opt/chat-room && docker compose ps'
```

(No teardown — leave running. Use `pnpm admin room delete prod-smoke -y` against the prod backend if you want to drop the test room.)

- [ ] **Step 6: Document outcome**

In the project root, append a one-line note to `README.md` (create it if absent) under a `## Production` heading:

```markdown
## Production
- Backend: https://<SUBDOMAIN>
- Client: `npx <NPM_PACKAGE_NAME>@latest --server wss://<SUBDOMAIN>`
```

```bash
git add README.md
git commit -m "docs: note production URLs"
```

---

## Phase 9: One-touch redeploy script

### Task 16: VM-side update helper

**Files:**
- Create: `scripts/deploy-backend.sh`

- [ ] **Step 1: Create the script** with this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Trigger a backend redeploy on the VM.
# Assumes ./scripts/build-and-push-backend.sh was already run (or run it inline with --build).

BUILD=0
if [[ "${1:-}" == "--build" ]]; then BUILD=1; fi

if [[ "$BUILD" == "1" ]]; then
  echo "==> Building + pushing"
  ./scripts/build-and-push-backend.sh
fi

echo "==> Triggering VM pull + restart"
ssh wisp '
  set -euo pipefail
  cd /opt/chat-room
  docker compose pull
  docker compose up -d
  docker compose ps
'
```

- [ ] **Step 2: Make executable + first dry use**

```bash
chmod +x scripts/deploy-backend.sh
./scripts/deploy-backend.sh
```

Expected: VM pulls `:latest`, restarts container in-place, prints `Up (healthy)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/deploy-backend.sh
git commit -m "chore(deploy): one-touch backend redeploy script"
```

### Task 17: (Optional) Wire into existing deploy-webhook

Skip this task unless you want zero-touch CI redeploy. Your existing `deploy-webhook.service` on `:9000` already runs locally on the VM; the standard pattern is:

- [ ] **Step 1: Find its config** (likely `/etc/webhook/hooks.yaml` or `/etc/webhook/hooks.json`)

```bash
ssh wisp 'sudo grep -ril webhook /etc /opt 2>/dev/null | head -5'
ssh wisp 'sudo find /etc -name "hooks*" 2>/dev/null'
```

- [ ] **Step 2:** Append a hook for chat-room that runs:

```bash
cd /opt/chat-room && docker compose pull && docker compose up -d
```

Use the existing entries as a template — same author, same secret style.

- [ ] **Step 3:** Reload the webhook service:

```bash
ssh wisp 'sudo systemctl restart deploy-webhook'
```

- [ ] **Step 4:** From your laptop, trigger:

```bash
curl -X POST -H 'X-Hub-Signature: ...' https://<SUBDOMAIN-OR-IP>:9000/hooks/chat-room
```

(Use whatever auth the existing webhooks use — sign with the same secret.)

No commit if the change is only on the VM side. If you template a hooks file in the repo, commit it as `deploy/webhook-hooks.example.yml`.

---

## Done — Plan C Exit Criteria

- `https://<SUBDOMAIN>/health` returns `{"ok":true}` from the open internet.
- `npx <NPM_PACKAGE_NAME>@latest --server wss://<SUBDOMAIN>` opens the TUI from a clean machine.
- Two clients can exchange messages via the production backend.
- Discord OAuth round-trip completes in a real browser; the TUI lands in chat as the authenticated user.
- GitHub / Google selections from the identity screen produce a clean ErrorScreen ("Provider not configured…"), not a crash.
- `./scripts/deploy-backend.sh` rebuilds and rolls out a new image.

**Out of scope (deferred):**
- GitHub / Google OAuth round-trip (just add env vars + redeploy; no code change needed).
- Multi-region failover or rolling deploy — the VM and the tunnel terminate at one point.
- Monitoring + alerting (the existing fluent-bit + otelopscol on the VM likely already collect; out of scope here).
- Image vulnerability scanning / supply-chain attestation.
- Auto-cleanup of old Artifact Registry tags.
