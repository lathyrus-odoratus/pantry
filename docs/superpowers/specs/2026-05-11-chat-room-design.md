# Chat Room — Design / PRD

**Date:** 2026-05-11
**Status:** Draft for implementation
**Scope:** MVP — TUI chat client + custom backend, multi-room, knowledge-of-room-name as access gate.

---

## 1. Goals & Non-Goals

### Goals
- A small, real-time chat tool intended for use among friends or a small team.
- TUI client published to npm, runnable via `npx chat-room`.
- Custom backend on GCP Cloud Run that gates room access and handles broadcast.
- Supabase for Postgres persistence and OAuth handshake support.
- Knowledge of `room_name` is the primary access gate; rooms are pre-created by admin.

### Non-Goals (MVP)
- Public registration; open lobby; user-created rooms.
- Message editing / deletion / search.
- Private messaging.
- File or image attachments.
- Emoji, Markdown, syntax highlighting, link previews.
- Push notifications, sound alerts.
- Multi-instance backend, Redis pub/sub, horizontal scale.

---

## 2. High-Level Architecture

```
┌────────────────────────────────┐
│  Ink TUI Client (npm package)  │
│                                │
│  1. Prompt for room_name       │
│  2. Identity: anon / GitHub /  │
│     Google / Discord           │
│  3. WebSocket → Backend        │
└──────────────┬─────────────────┘
               │  wss://, zod-validated JSON
               ▼
┌────────────────────────────────┐
│  Backend (Node.js + TS)        │
│  on GCP Cloud Run              │
│                                │
│  • POST /auth/oauth/*          │
│  • WS  /ws                     │
│  • Room validation, broadcast, │
│    presence, persistence       │
└──────────────┬─────────────────┘
               │  supabase-js (service_role)
               ▼
┌────────────────────────────────┐
│  Supabase                      │
│  • Postgres: rooms / users /   │
│    messages                    │
└────────────────────────────────┘
```

- **Region**: Backend on GCP `asia-east1` (Changhua) or `asia-northeast1` (Tokyo). Supabase on `Northeast Asia (Tokyo)`.
- **Realtime model**: Backend owns WebSocket connections directly. Persistence to Supabase happens in parallel with broadcast (does not sit in the hot path).

---

## 3. MVP Feature List

| Category | Behavior |
|---|---|
| Entry | Prompt for `room_name`. Reject if room does not exist. |
| Identity | Anonymous nickname; GitHub / Google / Discord OAuth. |
| Display name | `Nickname#abcd` (4-char alphanumeric discriminator). |
| Messages | Plain text only, 1–2000 chars. Real-time broadcast and persisted. |
| Online list | Sidebar with currently connected users. |
| Join/leave | System messages broadcast on connect/disconnect. |
| History | Last 50 messages on join. Scroll up to load more. |
| Rename | `/nick <new>` command. Old messages keep historical name. |
| Rooms | Pre-created via admin script; no public creation API. |
| Distribution | TUI published to public npm. |
| Access control | Room name knowledge is the gate (no whitelist). |

---

## 4. Data Model (Supabase Postgres)

```sql
-- Rooms (pre-created by admin)
CREATE TABLE rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  created_by  uuid
);

-- Users
-- OAuth user: auth_provider in ('github','google','discord'), auth_subject = provider's user id
-- Anonymous: auth_provider='anon', auth_subject = random per-session uuid
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider  text NOT NULL,        -- 'anon' | 'github' | 'google' | 'discord'
  auth_subject   text NOT NULL,
  nickname       text NOT NULL,
  discriminator  text NOT NULL,        -- 4-char alphanumeric
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (auth_provider, auth_subject),
  UNIQUE (nickname, discriminator)
);

-- Messages — snapshot author identity at write time
CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  author_nickname       text NOT NULL,    -- snapshot at send time
  author_discriminator  text NOT NULL,    -- snapshot at send time
  body                  text NOT NULL,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_room_created
  ON messages (room_id, created_at DESC);
```

### Design notes

- **Anonymous users persist in `users`** so messages always have a valid FK.
- **Discriminator generation**: random 4-char `[a-z0-9]` (~1.68M combinations per nickname); on `UNIQUE` violation, retry up to a small limit.
- **No RLS**: backend uses `service_role` key. All authorization happens in backend code.
- **No room membership table**: presence is in-memory in backend (`Map<roomId, Set<Connection>>`).
- **No per-user "last read" state** in MVP.
- **Renaming a user updates `users.nickname` but never rewrites `messages.author_nickname`** — history is immutable.

---

## 5. WebSocket Protocol

Shared zod schemas live in a `shared` package consumed by both client and backend.

### Common types

```typescript
type Message = {
  id: string
  body: string
  createdAt: string                // ISO 8601
  author: { nickname: string; discriminator: string }
}

type User = {
  nickname: string
  discriminator: string
}
```

### Client → Server

```typescript
type AuthMessage =
  | { type: 'auth.anon';  nickname: string; roomName: string }
  | { type: 'auth.oauth'; token: string;    roomName: string }

type SendMessage = {
  type: 'message.send'
  body: string                     // 1–2000 chars
}

type NickChange = {
  type: 'nick.change'
  newNickname: string
}

type HistoryRequest = {
  type: 'history.load'
  beforeId: string                 // cursor
  limit: number                    // default 50, max 100
}
```

### Server → Client

```typescript
type AuthResult =
  | { type: 'auth.ok';    user: { id: string; nickname: string; discriminator: string } }
  | { type: 'auth.error'; reason: 'room_not_found' | 'invalid_token' | 'nickname_invalid' }

type RoomSnapshot = {
  type: 'room.snapshot'
  room: { id: string; name: string }
  messages: Message[]              // last 50, chronological ascending
  onlineUsers: User[]
}

type NewMessage = {
  type: 'message'
  data: Message
}

type SystemMessage = {
  type: 'system'
  event: 'join' | 'leave' | 'rename'
  body: string                     // pre-formatted, e.g. "Alice#a1b2 joined"
}

type PresenceUpdate = {
  type: 'presence'
  onlineUsers: User[]              // full list; client replaces
}

type HistoryResponse = {
  type: 'history'
  messages: Message[]
  hasMore: boolean
}
```

### Connection lifecycle

```
Client opens wss://backend/ws
  └─ Server waits ≤5s for auth.*; otherwise close

Client sends auth.anon | auth.oauth
  ├─ Backend validates room exists + identity
  ├─ Failure → auth.error then close
  └─ Success → auth.ok then room.snapshot
                ├─ broadcast system{join} to others in room
                └─ broadcast presence to room

Normal traffic:
  Client → message.send | nick.change | history.load
  Server → message | system | presence | history

Disconnect:
  Backend detects close → remove from room map
    ├─ broadcast system{leave}
    └─ broadcast presence
```

### Broadcast & persistence ordering

When `message.send` arrives:

1. Generate `id` (uuid) and `createdAt` on backend.
2. Broadcast `message` to all connections in the room **immediately** (in-memory fanout, ~1–5ms).
3. In parallel, `INSERT` into Supabase.
4. If insert fails, retry up to 3 times. On final failure, send `error` to the original sender (other clients have already received it; this is acceptable for MVP).

---

## 6. Authentication Flows

### Anonymous

1. Client opens WS.
2. Client sends `{type:'auth.anon', nickname, roomName}`.
3. Backend validates: room exists, nickname matches `^[\S][\S ]{0,18}[\S]$` (no leading/trailing whitespace, 1–20 chars, no control chars).
4. Backend generates random `auth_subject` (session uuid), random `discriminator`, retries on collision.
5. Backend `INSERT` user with `auth_provider='anon'`.
6. Backend responds `auth.ok` + `room.snapshot`.

Anonymous identity lives only for the connection. Reconnecting creates a fresh user row.

### OAuth (GitHub / Google / Discord) — local-callback flow

```
Client                       Provider                  Backend
  │
  │ POST /auth/oauth/start {provider:'github'}
  │ ─────────────────────────────────────────────────►
  │                                                    ├─ generate state (nonce)
  │                                                    ├─ store state with 10-min TTL
  │ {authUrl, pollUrl}                                  │
  │ ◄─────────────────────────────────────────────────
  │
  │ TUI prints authUrl, attempts to open browser
  │
  │            browser navigates to authUrl
  │            ───────────────────────────►
  │                              user approves
  │                              redirect → https://backend/auth/oauth/callback
  │                                            ?code=...&state=...&provider=...
  │                                                    │
  │                                                    ├─ exchange code → access_token
  │                                                    ├─ fetch profile (id, name, email)
  │                                                    ├─ UPSERT users(provider, subject)
  │                                                    ├─ mint backend-signed JWT (7d)
  │                                                    └─ persist state → JWT mapping
  │
  │ Client polls /auth/oauth/poll?state=...
  │ ─────────────────────────────────────────────────►
  │                                                    ├─ state matches token? clear & return
  │                                                    └─ otherwise: pending
  │ {token, user}
  │ ◄─────────────────────────────────────────────────
  │
  │ Persist token to ~/.chat-room/credentials.json (mode 600)
  │
  │ Send auth.oauth over WS with token
```

### Backend OAuth app configuration

| Provider | Callback URL |
|---|---|
| GitHub  | `https://<backend>/auth/oauth/callback?provider=github` |
| Google  | `https://<backend>/auth/oauth/callback?provider=google` |
| Discord | `https://<backend>/auth/oauth/callback?provider=discord` |

### Backend environment variables

```
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
JWT_SIGNING_KEY                 # backend-signed JWTs (HS256)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PORT                            # Cloud Run injects
```

### Token

- Backend-signed JWT, HS256, 7-day expiry, claims: `{sub: user_id, provider, iat, exp}`.
- No refresh in MVP; expired token forces a new OAuth flow.
- Stored in `~/.chat-room/credentials.json`, file mode `0600`.

---

## 7. Rename Flow

1. User types `/nick Bob`.
2. Client sends `{type:'nick.change', newNickname:'Bob'}`.
3. Backend:
   1. Validate nickname format (same regex as anonymous).
   2. `UPDATE users SET nickname='Bob', updated_at=now() WHERE id=current_user`.
   3. On `UNIQUE (nickname, discriminator)` collision, regenerate discriminator and retry.
   4. Update the in-memory connection state for this user.
   5. Broadcast `system { event:'rename', body:'Alice#a1b2 → Bob#a1b2' }` to room.
   6. Broadcast `presence` with updated list.
4. Historical `messages` are untouched.

### Edge cases

| Case | Behavior |
|---|---|
| New name === old name | Silently ignore (no broadcast). |
| Invalid format | Return `error` to sender; don't broadcast. |
| High-frequency renames | MVP: no rate limit. Add later if abused. |
| Anonymous user rename | Allowed; lost on reconnect (anon identity is per-session). |
| OAuth user rename | Persisted; survives reconnect and future sessions. |

---

## 8. Admin Tooling

Admin operations run from the maintainer's machine against Supabase using `service_role`. Not deployed.

**Path**: `packages/backend/src/admin/cli.ts`, invoked via `pnpm admin <command>`.

```bash
pnpm admin room create <name>
pnpm admin room list
pnpm admin room delete <name>        # prompts y/N
pnpm admin user list [--room <name>]
```

MVP excludes: ban, mute, message deletion.

---

## 9. TUI Screens

### Room input

```
┌─ chat-room ──────────────────────────────────┐
│  Welcome to chat-room                        │
│  Room name: ▮                                │
│  (Enter to continue, Ctrl+C to quit)         │
└──────────────────────────────────────────────┘
```

### Identity selection

```
┌─ chat-room ──────────────────────────────────┐
│  Room: lobby                                 │
│  How do you want to join?                    │
│  ▸ Anonymous (just a nickname)               │
│    Sign in with GitHub                       │
│    Sign in with Google                       │
│    Sign in with Discord                      │
└──────────────────────────────────────────────┘
```

### OAuth waiting

```
┌─ chat-room ──────────────────────────────────┐
│  Open this URL in your browser:              │
│    https://github.com/login/oauth/...        │
│  Waiting for authorization...                │
│  (Ctrl+C to cancel)                          │
└──────────────────────────────────────────────┘
```

### Main chat

```
┌─ lobby ──────────────────────────────┬─ Online (3) ─┐
│  Alice#a1b2: hi everyone             │  Alice#a1b2  │
│  Bob#c3d4: yo                        │  Bob#c3d4    │
│  ── Carol#e5f6 joined ──             │  Carol#e5f6  │
│  Carol#e5f6: morning                 │              │
│  Bob#c3d4 → Bob_v2#c3d4              │              │
│  ▲ scroll up to load more            │              │
├──────────────────────────────────────┴──────────────┤
│  > ▮                                                │
└─────────────────────────────────────────────────────┘
  Connected · Ctrl+C to quit · /nick <name> to rename
```

### Error (room not found)

```
┌─ chat-room ──────────────────────────────────┐
│  Error: Room "foo" not found.                │
│  Ask the room admin to create it.            │
│  (Enter to try another room, Ctrl+C to quit) │
└──────────────────────────────────────────────┘
```

### Layout & rendering rules

- Main chat ≈75% width, online list ≈25% with a max of ~20 chars (names truncate as `Alice…#a1b2`).
- System messages bracketed with `──` and rendered dim.
- Own nickname rendered in a fixed accent color (e.g. cyan).
- Other users' nicknames colored by stable hash of `nickname#discriminator`.

### Keybindings

| Key | Action |
|---|---|
| Printable chars | Append to input |
| `Enter` | Send (ignore empty) |
| `↑` / `↓` | Scroll message history |
| `PgUp` / `PgDn` | Bulk scroll |
| Scroll to top | Auto-trigger `history.load` |
| `Ctrl+L` | Redraw |
| `Ctrl+C` | Quit |
| Input starting with `/` | Treat as command (MVP: only `/nick`) |

### Auto-reconnect

- WS close → status line: `Reconnecting in 2s…`
- Backoff: 2s → 4s → 8s → 16s → 30s (cap).
- On reconnect, re-send `auth.*`. OAuth token reused if still valid.

---

## 10. Error Handling

### Client

| Error | Behavior |
|---|---|
| Cannot reach backend | Status line "Cannot reach server, retrying…" + exponential backoff. |
| `auth.error: room_not_found` | Return to room input screen with red error message. |
| `auth.error: invalid_token` | Delete local credentials; return to identity selection. |
| WS dropped mid-session | Status line color shift; auto-reconnect; input stays editable, send queued or rejected. |
| Send failed | Mark the line `(failed, ↑ to retry)` in red. |
| Unhandled render exception | Fallback screen; log to `~/.chat-room/log`. |

### Backend

| Error | Behavior |
|---|---|
| Invalid JSON / zod parse fail | Reply `{type:'error', code:'bad_request'}`, close WS. |
| Non-auth message before auth | Close WS immediately. |
| Supabase insert failure | Broadcast already happened; retry insert up to 3x; on final failure send `error` to sender only. |
| OAuth callback state missing/expired | Render "Authorization expired, please try again." |
| Unhandled exception | Log full stack; send generic error code; never leak internals. |

### Logging

- Backend: structured JSON to stdout → Cloud Run → Cloud Logging.
- Client: text log at `~/.chat-room/log`, never auto-uploaded.

---

## 11. Testing

### Backend

| Type | Scope | Tool |
|---|---|---|
| Unit | discriminator generator, nickname validation, JWT sign/verify, message routing | Vitest |
| Integration | WS connect → auth → send → broadcast with a real Supabase test schema | Vitest + `ws` client |
| Contract | Shared zod schemas enforced via TypeScript types | tsc |

### Client

| Type | Scope | Tool |
|---|---|---|
| Unit | Message reducer, ordering, history merge | Vitest |
| Component | Ink component snapshots | `ink-testing-library` |

### Manual smoke test (pre-release)

1. Enter a non-existent room → error.
2. Anonymous join → snapshot + send + receive.
3. OAuth join (each of 3 providers) → token flow + messaging.
4. `/nick` → own UI, others' UI, online list all reflect change.
5. Disconnect mid-session → auto-reconnect with no message loss.
6. Scroll to top repeatedly → history loads through to oldest.

---

## 12. Deployment & Distribution

### Backend → GCP Cloud Run

- WebSocket support (GA since 2024).
- Auto HTTPS + managed domain.
- Pay per request; near-zero idle cost.
- `min-instances=1` to avoid cold start.
- CI: GitHub push to `main` → Cloud Build → Artifact Registry → Cloud Run deploy.

### Client → npm

- Package name: `chat-room` (or `@scope/chat-room` if collision).
- `bin` entry: `dist/cli.js` with `#!/usr/bin/env node`.
- `engines: { node: ">=20" }`.
- Backend URL compiled into client; override with `--server`.
- Usage:
  ```bash
  npx chat-room
  chat-room --room lobby
  chat-room --server wss://staging.example.com/ws
  ```
- Release: `pnpm release` script bumps semver, tags git, runs `npm publish`.

---

## 13. Repository Layout (monorepo, pnpm workspaces)

```
chat-room/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/
│   ├── shared/                     # zod schemas + types (used by both)
│   │   └── src/
│   │       ├── protocol.ts
│   │       └── models.ts
│   │
│   ├── backend/
│   │   ├── src/
│   │   │   ├── server.ts           # WS + HTTP entry
│   │   │   ├── auth/               # OAuth + JWT
│   │   │   ├── rooms/              # broadcast, presence
│   │   │   ├── persistence/        # supabase wrapper
│   │   │   └── admin/cli.ts        # admin commands
│   │   ├── Dockerfile
│   │   └── cloudbuild.yaml
│   │
│   └── client/                     # published to npm
│       └── src/
│           ├── cli.ts              # bin entry
│           ├── screens/            # Ink components
│           ├── transport/          # WS client + reconnect
│           ├── auth/               # OAuth local browser flow
│           └── state/              # message store
│
└── docs/superpowers/specs/
    └── 2026-05-11-chat-room-design.md
```

---

## 14. Open Questions for Iteration (Not in MVP)

- Per-room access control beyond room-name knowledge (e.g. invite codes, OAuth-whitelist).
- Message editing / deletion / search.
- File and image attachments.
- Emoji and Markdown formatting; syntax-highlighted code blocks.
- Rate limiting (per-user message throttle, rename throttle).
- Multi-instance backend with Redis pub/sub for fanout.
- Refresh tokens for OAuth.
- Audit log for admin actions.
- "Last seen" / "unread since" tracking.
