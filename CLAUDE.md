# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`pantry` is a small real-time chat tool. Backend owns WebSocket connections and gates room access; client is an Ink TUI distributed on npm as `@lathyrus-odoratus/pantry` and runnable via `npx`. Knowledge of a `room_name` (pre-created by admin) is the only access gate; there is no public room-creation API.

Full design doc: `docs/superpowers/specs/2026-05-11-pantry-design.md`. Deployment runbook (VM + Cloudflare Tunnel + npm publish): `docs/superpowers/plans/2026-05-11-pantry-plan-c-deploy.md`. Future roadmap / things considered-but-deferred: `BACKLOG.md`.

## Workspace layout

pnpm workspace (`pnpm@9`, Node ≥ 20, `"type": "module"` everywhere). Three packages under `packages/`:

- **`@pantry/shared`** — Zod schemas + types for WS protocol (`protocol.ts`) and persistence models (`models.ts`). Built first; consumed by both other packages. Has `composite: true` and is referenced via TS project references.
- **`@pantry/backend`** — Fastify HTTP (health + OAuth routes) plus a native `ws` `WebSocketServer` mounted at `/ws`. Talks to Supabase using the service-role key. Logger is `pino`.
- **`pantry`** (npm name `@lathyrus-odoratus/pantry`) — Ink-based TUI. Zustand store drives screen routing (`room_input → identity_select → nickname_input | oauth_waiting → chat | error`). Transport layer uses `ws` directly with exponential backoff reconnect.

Imports between packages go through the workspace alias (`@pantry/shared`). The client's published build inlines `@pantry/shared` (see Plan C, Task 10): its `tsconfig.json` uses `paths` + `rootDir: ".."` so `tsc` emits both packages into the client's `dist/` and the published package has no workspace dependency.

## Commands

Run from repo root unless noted. Most scripts fan out via `pnpm -r` or `--filter`.

```sh
# Install
pnpm install

# Build everything (respects workspace order)
pnpm build

# Typecheck / test everything
pnpm typecheck
pnpm test

# Dev — backend (tsx watch, loads packages/backend/.env)
pnpm dev:backend

# Dev — client TUI
pnpm dev:client
# or, with overrides:
pnpm --filter pantry dev -- --server ws://localhost:8080/ws --room lobby

# Admin CLI against Supabase (uses service_role; requires packages/backend/.env)
pnpm admin room create <name>
pnpm admin room list
pnpm admin room delete <name>           # prompts y/N (use -y to skip)
pnpm admin user list --room <name>

# Per-package
pnpm --filter @pantry/backend test
pnpm --filter @pantry/backend test -- src/config.test.ts   # single file
pnpm --filter @pantry/backend test:watch
pnpm --filter pantry test
pnpm --filter @pantry/backend typecheck

# Single Vitest test by name
pnpm --filter @pantry/backend test -- -t "rejects missing SUPABASE_URL"
```

Backend env is loaded from `packages/backend/.env` (template at `packages/backend/.env.example`). The Vitest config in the backend also loads that file, so integration tests in `src/__tests__/integration/` run against the configured Supabase project — keep that in mind before running `pnpm --filter @pantry/backend test` blindly.

## Architecture — what's worth knowing before editing

### WebSocket protocol is the contract

Shared schemas in `packages/shared/src/protocol.ts` are the source of truth for both client and backend. Adding or changing a message means: (1) edit the discriminated union there, (2) build `@pantry/shared` (or rely on tsc project refs), (3) update both the backend handler (in `packages/backend/src/ws/handlers/`) and the client transport/store. Both sides validate with the same Zod schemas — invalid client frames close the socket with code 4000.

### Connection lifecycle (backend)

`packages/backend/src/ws/server.ts` is the WS entry. Per connection:

1. 5s `AUTH_TIMEOUT_MS` — must send `auth.anon` or `auth.oauth`, else close with 4001.
2. On auth: resolve room by name → for OAuth, verify JWT (`utils/jwt.ts`) and look up user; for anon, mint a fresh `users` row with random `auth_subject` and a 4-char alphanumeric `discriminator` (retry up to 8× on the `UNIQUE (nickname, discriminator)` collision — `db/users.ts`).
3. Register in `ConnectionRegistry` (`ws/connection-registry.ts`, in-memory `byId` + `byRoom` maps), send `auth.ok` then `room.snapshot` (last 50 messages + online list), broadcast `system{join}` + `presence` to the rest of the room.
4. Subsequent frames route to `handlers/send.ts`, `handlers/nick.ts`, `handlers/history.ts`.
5. Close → registry.remove + `system{leave}` + `presence`.

Broadcast is **in-memory only** (single-instance backend, no Redis/pub-sub). Multi-instance scale is explicitly out of MVP scope.

### Persistence

Supabase Postgres, single migration in `supabase/migrations/20260511000000_init.sql`. Tables: `rooms`, `users`, `messages`. The backend uses **service_role** (`db/supabase.ts`) — there is no RLS; all authorization lives in backend code.

Two key invariants:

- **Author identity is snapshotted on `messages.insert`** (`author_nickname`, `author_discriminator`). Renames never rewrite history.
- **Message send is fan-out-then-persist**: `handlers/send.ts` broadcasts immediately (in-memory, ~ms) and writes to Supabase in parallel; an insert failure only notifies the original sender.

### OAuth flow

Local-callback style. `auth/state-store.ts` is an in-memory map: `POST /auth/oauth/start` allocates a `state` nonce (10 min TTL), client opens `authUrl` in a browser, provider redirects to `GET /auth/oauth/callback?code&state`, backend exchanges code → access_token → profile → upserts user → mints HS256 JWT (`utils/jwt.ts`) and parks it under `state`. The TUI polls `GET /auth/oauth/poll?state=…` until it sees `{status: "ready", token}`. Token is then sent over WS as `auth.oauth` and persisted client-side at `~/.pantry/credentials.json` mode 600 (`client/src/auth/credentials.ts`).

Provider config lives in `auth/providers.ts`. **Discord is required**; GitHub and Google are optional in `config.ts` and `getProviderConfig` returns `undefined` for unconfigured providers — auth routes then return HTTP 503, and the client's OAuth helper surfaces this as a readable "provider not configured" message (`client/src/auth/oauth.ts`).

### Client state

Single Zustand store in `client/src/store.ts`. The `screen` field is a small state machine; `app.tsx` is a `switch` over it. `transport/client.ts` wraps `ws` with reconnect (backoff `2s → 4s → 8s → 16s → 30s` capped). Default server URL is hard-coded to `wss://pantry.miao-bao.cc/ws` in `client/src/config.ts`; override with `--server <wss://…>` or `PANTRY_SERVER`.

## Deployment

Backend runs on the `wisp` VM in a container built on-host (no registry):

- `docker-compose.yml` + `packages/backend/Dockerfile` (multistage: deps → build → runtime, alpine).
- Host port `127.0.0.1:8081` → container `:8080` (8080 is taken by another container on that VM).
- Cloudflare Tunnel routes `pantry.miao-bao.cc` → `http://localhost:8081`. No public ports opened on the VM.
- `scripts/deploy.sh` rsyncs source to `/opt/pantry/` on `wisp` (excluding `.env`) and runs `docker compose up -d --build` remotely.

The client publishes to npm as `@lathyrus-odoratus/pantry` (scoped, public). `bin: pantry` → `dist/client/src/cli.js` (path reflects `tsconfig.json` `rootDir: ".."` so both packages emit into the published `dist/`). `tsc-alias` rewrites the `@pantry/shared` specifier to the relative `dist/shared/src/...` path so the published package has no workspace dependency.

## Release flow

### Client (npm publish via GitHub Actions)

Triggered by pushing a tag matching `client-v*`. Workflow at `.github/workflows/publish-client.yml` runs `pnpm install --frozen-lockfile`, verifies the tag matches `packages/client/package.json#version`, builds (which also typechecks), then `pnpm publish` from `packages/client/`. Auth via `NPM_TOKEN` repo secret.

Three version constants must be **bumped in lockstep** before tagging, plus one new changelog entry:

1. `packages/client/package.json` — `version`
2. `packages/client/src/version.ts` — `CLIENT_VERSION`
3. `packages/backend/src/version.ts` — `LATEST_CLIENT_VERSION`
4. `packages/client/src/changelog.ts` — prepend a new `ChangelogEntry` at the top of `CHANGELOG`

(2) is what the client tells the server it is; (3) is what the server tells clients is the newest available. Without bumping (3) **and redeploying the backend**, connected clients won't see the "update available" hint even after the new version is on npm. (4) is what `/changelog` shows users in-app — keep it short and end-user oriented (not internal commit chatter).

Procedure:

```sh
# 1. Bump all three places (same version string)
# 2. Commit
git commit -am "chore(client): bump to X.Y.Z"
git push

# 3. Signed annotated tag (tag.gpgsign=true is on)
git tag -s client-vX.Y.Z -m "client vX.Y.Z: <one-line summary>"
git push origin client-vX.Y.Z   # ← triggers GHA publish

# 4. Redeploy backend so LATEST_CLIENT_VERSION takes effect
pnpm run deploy
# or for graceful announce-then-restart:
pnpm run deploy:with-notice <room>
```

**Versions are never reused.** If a CI run fails (tag was pushed but publish didn't reach npm), bump to the next patch and tag again. Don't force-update a tag.

### Backend (Docker rebuild on wisp)

`pnpm run deploy` rsyncs source to `wisp:/opt/pantry/` and rebuilds the container. The in-memory connection registry can't broadcast leaves on container death, so use `pnpm run deploy:with-notice <room> [delay-seconds]` when active users would notice — it posts an admin announcement, sleeps, then deploys.

## World feature — credit accounting

The `/the-world` feature uses an LLM-backed NPC. `WORLD_CREDIT_TOTAL` (default `100000`) is the per-world budget in a **weighted-cost unit**, not raw tokens. Weights are pinned to Anthropic's Haiku 4.5 list price so 1 credit ≈ 1 input token at full rate (≈ `$0.000001`). The formula lives in `packages/backend/src/world/brain.ts` as `weightedTokens()`:

```
input          × 1.0     ($1.00 / 1M tokens)
cache_create   × 1.25    ($1.25 / 1M tokens, 5-min TTL)
cache_read     × 0.1     ($0.10 / 1M tokens)
output         × 5.0     ($5.00 / 1M tokens)
```

Cost conversion: **1 credit ≈ $0.000001**, so the default 100k-credit world budget ≈ **$0.10** of Haiku spend. The TUI progress bar shows `creditUsed / creditTotal`; it tracks $ spend, not raw token throughput.

This pegs to **`claude-haiku-4-5`** specifically. Switching model means revisiting both the weight constants and the `MODEL` const in `brain.ts` (e.g. Sonnet 4.6 input $3 / output $15 would shift the ratios). Keep these together — the weighting is meaningless if it doesn't match the model's pricing.

## Version awareness (the "update available" hint)

Pull-on-connect, not pushed: `auth.ok` carries `latestClientVersion` (from backend's `LATEST_CLIENT_VERSION`). Client's `version.ts` exports `CLIENT_VERSION` + `compareSemver`; when latest > self, store sets `updateAvailable` and `StatusBar` renders the hint.

For active broadcasts to currently-connected users (e.g. "new version, please reconnect"), the backend exposes `POST /admin/broadcast` (gated by `ADMIN_KEY`). That's the mechanism used by `deploy:with-notice` and is the right vehicle for any release-time notice.

## Conventions worth respecting

- **ESM only.** All packages have `"type": "module"`; relative imports use the `.js` extension even from `.ts` source (matches Node ESM + TS Bundler resolution).
- **Strict TS** with `noUncheckedIndexedAccess` and `noImplicitOverride` — array/map lookups are typed as possibly-undefined; handle it.
- **Zod at boundaries.** Server validates every WS frame with `ClientMessageSchema.parse`; client validates inbound with `ServerMessageSchema.safeParse`. Don't bypass.
- **Logger:** backend uses `pino` via `logger.ts` (stdout JSON). Don't `console.log` in backend code.
- **No comments unless they explain non-obvious WHY.** Existing code follows this; match it.
