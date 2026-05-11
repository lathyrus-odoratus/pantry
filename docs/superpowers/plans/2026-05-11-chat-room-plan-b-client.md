# Chat Room — Plan B: TUI Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Ink-based TUI client that connects to the Plan A backend, supports the full chat flow (room input, anonymous / OAuth identity, message exchange, rename, presence, history scroll-back), and is locally runnable via `pnpm dev`.

**Architecture:** Ink (React for terminals) + Zustand for state + a thin WebSocket transport wrapper. Single workspace package `@chat-room/client` published from `packages/client/`. CLI entry compiles to a single executable that boots an Ink render tree with a screen state machine.

**Tech Stack:** Node 20+, TypeScript 5.5+ (ESM), React 18, Ink 5, ink-text-input, ink-select-input, Zustand 4, open (browser launcher), Vitest, ink-testing-library.

**Reference spec:** `docs/superpowers/specs/2026-05-11-chat-room-design.md`
**Backend (Plan A merged):** `ws://localhost:8080/ws` (WebSocket chat), HTTP `POST /auth/oauth/start`, `GET /auth/oauth/poll`.

**Plan C scope:** Plan C handles Dockerfile / Cloud Run for the backend and npm publish for the client.

---

## File Structure (Plan B only)

```
packages/client/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── cli.tsx                       # bin entry, arg parsing, mounts <App/>
    ├── config.ts                     # backend URL config + CLI/env override
    ├── app.tsx                       # screen router
    ├── store.ts                      # Zustand store: screens + connection + chat
    ├── auth/
    │   ├── credentials.ts            # ~/.chat-room/credentials.json
    │   └── oauth.ts                  # client-side OAuth flow
    ├── transport/
    │   └── client.ts                 # WS wrapper with reconnect
    └── screens/
        ├── RoomInput.tsx
        ├── IdentitySelect.tsx
        ├── NicknameInput.tsx
        ├── OAuthWaiting.tsx
        ├── Chat.tsx
        ├── ErrorScreen.tsx
        └── components/
            ├── MessageList.tsx
            ├── OnlineList.tsx
            ├── InputBar.tsx
            └── StatusBar.tsx
```

Tests live next to source as `<name>.test.ts(x)`. Vitest config follows the backend pattern.

---

## Architecture Notes

### Screen state machine

`store.screen` is one of: `room_input | identity_select | nickname_input | oauth_waiting | chat | error`.

Transitions:
```
room_input → identity_select          (Enter on non-empty room name)
identity_select → nickname_input      (selected "Anonymous")
identity_select → oauth_waiting       (selected GitHub/Google/Discord)
nickname_input → chat                 (auth.ok received)
oauth_waiting → chat                  (auth.ok received)
* → error                             (any auth.error or unrecoverable connection loss)
error → room_input                    (Enter)
```

### Connection state

`store.status` is one of: `idle | connecting | connected | reconnecting | disconnected`.

The TransportClient owns the WebSocket and emits status changes + parsed messages to callbacks. The store consumes them.

### Reconnect logic

Exponential backoff: 2s → 4s → 8s → 16s → 30s (cap). Resets after a successful connection. On reconnect, re-send the original auth message (anon nickname / OAuth token). If the OAuth token is rejected (`auth.error: invalid_token`), clear credentials and transition to `identity_select`.

### Auth identity persistence

- Anonymous: nothing persisted. Each session is fresh.
- OAuth: token (backend-signed JWT) saved to `~/.chat-room/credentials.json` mode `0600` after successful OAuth flow.
- On startup, if credentials exist, the IdentitySelect screen offers "Continue as previous OAuth user" as an extra option.

### Why Zustand

State is shared across many screens (a screen reads connection status, current user, chat history). Prop-drilling across 6 screens is noisy. Zustand is 1KB, has zero boilerplate, and lets each component subscribe only to the slices it reads — render counts stay sane.

---

## Phase 1: Foundation

### Task 1: Initialize the client package

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vitest.config.ts`
- Create: `packages/client/src/cli.tsx`

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "chat-room",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "chat-room": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli.tsx",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@chat-room/shared": "workspace:*",
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
    "ink-testing-library": "^4.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Create `packages/client/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Create a minimal `packages/client/src/cli.tsx`** (replaced in Task 7):

```typescript
#!/usr/bin/env node
console.log("chat-room TUI booting…");
```

- [ ] **Step 5: Update the root `package.json` to add a client dev shortcut**

Edit `package.json` at repo root. The existing `scripts` block needs a new entry. After editing, the `scripts` object must be exactly:

```json
{
  "build": "pnpm -r build",
  "test": "pnpm -r test",
  "typecheck": "pnpm -r typecheck",
  "dev:backend": "pnpm --filter @chat-room/backend dev",
  "dev:client": "pnpm --filter chat-room dev",
  "admin": "pnpm --filter @chat-room/backend admin"
}
```

(Only the `dev:client` line is new.)

- [ ] **Step 6: Install & verify**

Run: `pnpm install`
Expected: completes; client deps installed.

Run: `pnpm --filter chat-room typecheck`
Expected: no errors.

Run: `pnpm dev:client`
Expected: prints `chat-room TUI booting…` and exits.

- [ ] **Step 7: Commit**

```bash
git add packages/client package.json pnpm-lock.yaml
git commit -m "chore(client): scaffold ink TUI package"
```

---

### Task 2: Backend URL config + CLI argument parsing

**Files:**
- Create: `packages/client/src/config.ts`
- Create: `packages/client/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("uses the compiled-in default when no override", () => {
    const cfg = resolveConfig({ argv: [], env: {} });
    expect(cfg.serverUrl).toBe("ws://localhost:8080/ws");
    expect(cfg.backendHttpUrl).toBe("http://localhost:8080");
  });

  it("--server overrides default", () => {
    const cfg = resolveConfig({
      argv: ["--server", "wss://example.com/ws"],
      env: {},
    });
    expect(cfg.serverUrl).toBe("wss://example.com/ws");
    expect(cfg.backendHttpUrl).toBe("https://example.com");
  });

  it("CHAT_ROOM_SERVER env overrides default but loses to CLI", () => {
    const fromEnv = resolveConfig({
      argv: [],
      env: { CHAT_ROOM_SERVER: "wss://env.example.com/ws" },
    });
    expect(fromEnv.serverUrl).toBe("wss://env.example.com/ws");

    const fromCli = resolveConfig({
      argv: ["--server", "wss://cli.example.com/ws"],
      env: { CHAT_ROOM_SERVER: "wss://env.example.com/ws" },
    });
    expect(fromCli.serverUrl).toBe("wss://cli.example.com/ws");
  });

  it("--room captures initial room name", () => {
    const cfg = resolveConfig({ argv: ["--room", "lobby"], env: {} });
    expect(cfg.initialRoom).toBe("lobby");
  });

  it("returns undefined initialRoom when not provided", () => {
    const cfg = resolveConfig({ argv: [], env: {} });
    expect(cfg.initialRoom).toBeUndefined();
  });

  it("derives http url from wss", () => {
    const cfg = resolveConfig({
      argv: ["--server", "wss://x.com/ws"],
      env: {},
    });
    expect(cfg.backendHttpUrl).toBe("https://x.com");
  });

  it("derives http url from ws", () => {
    const cfg = resolveConfig({
      argv: ["--server", "ws://1.2.3.4:9000/ws"],
      env: {},
    });
    expect(cfg.backendHttpUrl).toBe("http://1.2.3.4:9000");
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL — `Cannot find module './config.js'`.

- [ ] **Step 3: Implement `packages/client/src/config.ts`**

```typescript
const DEFAULT_SERVER_URL = "ws://localhost:8080/ws";

export type ClientConfig = {
  serverUrl: string;
  backendHttpUrl: string;
  initialRoom: string | undefined;
};

export type ResolveInput = {
  argv: string[];
  env: Record<string, string | undefined>;
};

function parseFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function toHttpUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  const httpProtocol = u.protocol === "wss:" ? "https:" : "http:";
  return `${httpProtocol}//${u.host}`;
}

export function resolveConfig(input: ResolveInput): ClientConfig {
  const cliServer = parseFlag(input.argv, "--server");
  const envServer = input.env.CHAT_ROOM_SERVER;
  const serverUrl = cliServer ?? envServer ?? DEFAULT_SERVER_URL;
  const initialRoom = parseFlag(input.argv, "--room");
  return {
    serverUrl,
    backendHttpUrl: toHttpUrl(serverUrl),
    initialRoom,
  };
}

export function loadConfig(): ClientConfig {
  return resolveConfig({ argv: process.argv.slice(2), env: process.env });
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter chat-room test`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/config.ts packages/client/src/config.test.ts
git commit -m "feat(client): config with --server / CHAT_ROOM_SERVER overrides"
```

---

## Phase 2: Core utilities

### Task 3: Credentials file utility

**Files:**
- Create: `packages/client/src/auth/credentials.ts`
- Create: `packages/client/src/auth/credentials.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/client/src/auth/credentials.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  type Credentials,
} from "./credentials.js";

describe("credentials", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cr-cred-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("save and load round trips", async () => {
    const path = join(dir, "credentials.json");
    const c: Credentials = {
      token: "jwt.payload.sig",
      provider: "github",
      savedAt: "2026-05-11T00:00:00.000Z",
    };
    await saveCredentials(c, path);
    const loaded = await loadCredentials(path);
    expect(loaded).toEqual(c);
  });

  it("save writes file with mode 0600", async () => {
    const path = join(dir, "credentials.json");
    await saveCredentials(
      { token: "t", provider: "github", savedAt: "x" },
      path,
    );
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("loadCredentials returns null when file missing", async () => {
    const loaded = await loadCredentials(join(dir, "nope.json"));
    expect(loaded).toBeNull();
  });

  it("loadCredentials returns null when file is invalid JSON", async () => {
    const { writeFileSync } = await import("node:fs");
    const path = join(dir, "credentials.json");
    writeFileSync(path, "not json");
    const loaded = await loadCredentials(path);
    expect(loaded).toBeNull();
  });

  it("loadCredentials returns null when JSON is valid but wrong shape", async () => {
    const { writeFileSync } = await import("node:fs");
    const path = join(dir, "credentials.json");
    writeFileSync(path, JSON.stringify({ foo: "bar" }));
    const loaded = await loadCredentials(path);
    expect(loaded).toBeNull();
  });

  it("clearCredentials removes the file", async () => {
    const path = join(dir, "credentials.json");
    await saveCredentials(
      { token: "t", provider: "github", savedAt: "x" },
      path,
    );
    expect(existsSync(path)).toBe(true);
    await clearCredentials(path);
    expect(existsSync(path)).toBe(false);
  });

  it("clearCredentials is a no-op when file missing", async () => {
    await clearCredentials(join(dir, "missing.json"));
    // no throw
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL — `Cannot find module './credentials.js'`.

- [ ] **Step 3: Implement `packages/client/src/auth/credentials.ts`**

```typescript
import { mkdir, readFile, writeFile, unlink, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

export type OAuthProvider = "github" | "google" | "discord";

export type Credentials = {
  token: string;
  provider: OAuthProvider;
  savedAt: string;
};

export function defaultCredentialsPath(): string {
  return join(homedir(), ".chat-room", "credentials.json");
}

export async function saveCredentials(
  c: Credentials,
  path = defaultCredentialsPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c, null, 2), { mode: 0o600 });
  // Ensure mode is set even if the file already existed.
  await chmod(path, 0o600);
}

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.token === "string" &&
    typeof c.savedAt === "string" &&
    (c.provider === "github" || c.provider === "google" || c.provider === "discord")
  );
}

export async function loadCredentials(
  path = defaultCredentialsPath(),
): Promise<Credentials | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isCredentials(parsed) ? parsed : null;
}

export async function clearCredentials(
  path = defaultCredentialsPath(),
): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter chat-room test`
Expected: 7 (config) + 7 (credentials) = 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/auth/credentials.ts packages/client/src/auth/credentials.test.ts
git commit -m "feat(client): credentials persistence with mode 0600"
```

---

### Task 4: Zustand store

**Files:**
- Create: `packages/client/src/store.ts`
- Create: `packages/client/src/store.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/client/src/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store.js";
import type { Message } from "@chat-room/shared";

function reset() {
  useStore.getState().reset();
}

describe("store", () => {
  beforeEach(reset);

  it("starts in room_input screen", () => {
    expect(useStore.getState().screen).toBe("room_input");
  });

  it("setRoomName advances to identity_select on commit", () => {
    useStore.getState().commitRoomName("lobby");
    expect(useStore.getState().roomName).toBe("lobby");
    expect(useStore.getState().screen).toBe("identity_select");
  });

  it("addMessage appends to messages", () => {
    const m: Message = {
      id: "11111111-1111-1111-1111-111111111111",
      body: "hi",
      createdAt: "2026-05-11T00:00:00Z",
      author: { nickname: "a", discriminator: "abcd" },
    };
    useStore.getState().addMessage(m);
    expect(useStore.getState().messages).toEqual([m]);
  });

  it("prependHistory deduplicates by id and preserves order", () => {
    const a: Message = {
      id: "11111111-1111-1111-1111-111111111111",
      body: "a",
      createdAt: "2026-05-11T00:00:00Z",
      author: { nickname: "u", discriminator: "abcd" },
    };
    const b: Message = {
      id: "22222222-2222-2222-2222-222222222222",
      body: "b",
      createdAt: "2026-05-11T00:00:01Z",
      author: { nickname: "u", discriminator: "abcd" },
    };
    useStore.getState().addMessage(b);
    useStore.getState().prependHistory([a]);
    expect(useStore.getState().messages.map((m) => m.id)).toEqual([a.id, b.id]);
    useStore.getState().prependHistory([a]); // duplicate
    expect(useStore.getState().messages.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("setPresence replaces onlineUsers", () => {
    useStore.getState().setPresence([{ nickname: "x", discriminator: "abcd" }]);
    expect(useStore.getState().onlineUsers).toEqual([
      { nickname: "x", discriminator: "abcd" },
    ]);
  });

  it("setError transitions to error screen", () => {
    useStore.getState().setError("oops");
    expect(useStore.getState().screen).toBe("error");
    expect(useStore.getState().errorMessage).toBe("oops");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/client/src/store.ts`**

```typescript
import { create } from "zustand";
import type { Message } from "@chat-room/shared";

export type Screen =
  | "room_input"
  | "identity_select"
  | "nickname_input"
  | "oauth_waiting"
  | "chat"
  | "error";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type Identity =
  | { kind: "anon"; nickname: string }
  | { kind: "oauth"; provider: "github" | "google" | "discord"; token: string };

export type PresenceUser = { nickname: string; discriminator: string };

export type AuthedUser = {
  id: string;
  nickname: string;
  discriminator: string;
};

export type Store = {
  // Screen state
  screen: Screen;
  errorMessage: string | null;

  // Form state
  roomName: string;
  pendingIdentity: Identity | null;

  // Connection state
  status: ConnStatus;
  reconnectAttempt: number;

  // Authed session state
  authedUser: AuthedUser | null;
  roomId: string | null;
  messages: Message[];
  onlineUsers: PresenceUser[];
  historyHasMore: boolean;

  // Actions
  setScreen: (s: Screen) => void;
  commitRoomName: (name: string) => void;
  setPendingIdentity: (i: Identity | null) => void;
  setStatus: (s: ConnStatus, attempt?: number) => void;
  onAuthOk: (user: AuthedUser, roomId: string) => void;
  setSnapshot: (
    roomId: string,
    messages: Message[],
    online: PresenceUser[],
  ) => void;
  addMessage: (m: Message) => void;
  prependHistory: (older: Message[], hasMore?: boolean) => void;
  setPresence: (users: PresenceUser[]) => void;
  renameSelf: (nickname: string, discriminator: string) => void;
  setError: (msg: string) => void;
  reset: () => void;
};

const initial: Omit<
  Store,
  | "setScreen"
  | "commitRoomName"
  | "setPendingIdentity"
  | "setStatus"
  | "onAuthOk"
  | "setSnapshot"
  | "addMessage"
  | "prependHistory"
  | "setPresence"
  | "renameSelf"
  | "setError"
  | "reset"
> = {
  screen: "room_input",
  errorMessage: null,
  roomName: "",
  pendingIdentity: null,
  status: "idle",
  reconnectAttempt: 0,
  authedUser: null,
  roomId: null,
  messages: [],
  onlineUsers: [],
  historyHasMore: true,
};

export const useStore = create<Store>((set) => ({
  ...initial,

  setScreen: (screen) => set({ screen }),

  commitRoomName: (roomName) => set({ roomName, screen: "identity_select" }),

  setPendingIdentity: (pendingIdentity) => set({ pendingIdentity }),

  setStatus: (status, attempt) =>
    set((s) => ({
      status,
      reconnectAttempt: attempt ?? (status === "connected" ? 0 : s.reconnectAttempt),
    })),

  onAuthOk: (authedUser, roomId) =>
    set({ authedUser, roomId, screen: "chat", status: "connected" }),

  setSnapshot: (roomId, messages, onlineUsers) =>
    set({ roomId, messages, onlineUsers, historyHasMore: messages.length >= 50 }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),

  prependHistory: (older, hasMore) =>
    set((s) => {
      const known = new Set(s.messages.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      return {
        messages: [...fresh, ...s.messages],
        historyHasMore: hasMore ?? s.historyHasMore,
      };
    }),

  setPresence: (onlineUsers) => set({ onlineUsers }),

  renameSelf: (nickname, discriminator) =>
    set((s) =>
      s.authedUser
        ? { authedUser: { ...s.authedUser, nickname, discriminator } }
        : s,
    ),

  setError: (errorMessage) => set({ errorMessage, screen: "error" }),

  reset: () => set(initial),
}));
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter chat-room test`
Expected: 14 + 6 = 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/store.ts packages/client/src/store.test.ts
git commit -m "feat(client): zustand store for screens + chat state"
```

---

### Task 5: WebSocket transport with reconnect

**Files:**
- Create: `packages/client/src/transport/client.ts`
- Create: `packages/client/src/transport/client.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/client/src/transport/client.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { WebSocketServer } from "ws";
import { TransportClient } from "./client.js";
import type { ServerMessage } from "@chat-room/shared";

let port: number;
let server: WebSocketServer;
const receivedFrames: string[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => {
      const addr = server.address();
      if (typeof addr !== "object" || !addr) throw new Error("no addr");
      port = addr.port;
      resolve();
    });
    server.on("connection", (ws) => {
      ws.on("message", (data) => {
        receivedFrames.push(data.toString());
      });
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function url() {
  return `ws://127.0.0.1:${port}`;
}

describe("TransportClient", () => {
  it("connects, sends, and reports status", async () => {
    receivedFrames.length = 0;
    const statuses: string[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: (s) => statuses.push(s),
      onMessage: () => {},
    });
    client.connect();
    await new Promise<void>((resolve) => {
      const i = setInterval(() => {
        if (statuses.includes("connected")) {
          clearInterval(i);
          resolve();
        }
      }, 20);
    });
    client.send({ type: "auth.anon", nickname: "x", roomName: "lobby" });
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedFrames[0]).toContain('"type":"auth.anon"');
    client.close();
  });

  it("parses inbound messages and forwards to onMessage", async () => {
    const received: ServerMessage[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: () => {},
      onMessage: (m) => received.push(m),
    });
    // Wire a server handler to push back a fake message once a client connects
    const handler = (ws: import("ws").WebSocket) => {
      ws.send(JSON.stringify({ type: "presence", onlineUsers: [] }));
    };
    server.on("connection", handler);
    client.connect();
    await new Promise((r) => setTimeout(r, 100));
    server.off("connection", handler);
    expect(received.some((m) => m.type === "presence")).toBe(true);
    client.close();
  });

  it("reconnects with backoff when the connection drops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const statuses: string[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: (s) => statuses.push(s),
      onMessage: () => {},
      backoffSchedule: [10, 20, 30],
    });
    client.connect();
    // Wait for first connection (real timers under shouldAdvanceTime keep advancing)
    await new Promise((r) => setTimeout(r, 80));
    expect(statuses).toContain("connected");
    // Close from server side by closing all clients
    for (const ws of server.clients) ws.close();
    // Allow backoff schedule to elapse + reconnect
    await new Promise((r) => setTimeout(r, 200));
    expect(statuses.filter((s) => s === "connected").length).toBeGreaterThanOrEqual(2);
    client.close();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/client/src/transport/client.ts`**

```typescript
import WebSocket from "ws";
import {
  ServerMessageSchema,
  type ServerMessage,
  type ClientMessage,
} from "@chat-room/shared";

export type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type TransportOptions = {
  url: string;
  onStatus: (s: Status, attempt?: number) => void;
  onMessage: (m: ServerMessage) => void;
  backoffSchedule?: number[]; // milliseconds, last value caps
  maxReconnects?: number; // default: Infinity
};

const DEFAULT_BACKOFF = [2000, 4000, 8000, 16000, 30000];

export class TransportClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private closedByUser = false;
  private backoff: number[];
  private maxReconnects: number;

  constructor(private opts: TransportOptions) {
    this.backoff = opts.backoffSchedule ?? DEFAULT_BACKOFF;
    this.maxReconnects = opts.maxReconnects ?? Infinity;
  }

  connect(): void {
    this.closedByUser = false;
    this.opts.onStatus(this.attempts === 0 ? "connecting" : "reconnecting", this.attempts);
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.on("open", () => {
      this.attempts = 0;
      this.opts.onStatus("connected", 0);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const result = ServerMessageSchema.safeParse(parsed);
      if (!result.success) return;
      this.opts.onMessage(result.data);
    });

    const handleDown = () => {
      if (this.closedByUser) {
        this.opts.onStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };

    ws.on("close", handleDown);
    ws.on("error", () => {
      // The close event will follow.
    });
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.opts.onStatus("disconnected");
  }

  private scheduleReconnect(): void {
    if (this.attempts >= this.maxReconnects) {
      this.opts.onStatus("disconnected");
      return;
    }
    const idx = Math.min(this.attempts, this.backoff.length - 1);
    const delay = this.backoff[idx] ?? this.backoff[this.backoff.length - 1] ?? 5000;
    this.attempts += 1;
    this.opts.onStatus("reconnecting", this.attempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter chat-room test`
Expected: 20 + 3 = 23 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/transport/client.ts packages/client/src/transport/client.test.ts
git commit -m "feat(client): ws transport with exponential-backoff reconnect"
```

---

## Phase 3: OAuth client flow

### Task 6: OAuth client flow (start + browser open + poll)

**Files:**
- Create: `packages/client/src/auth/oauth.ts`
- Create: `packages/client/src/auth/oauth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/client/src/auth/oauth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { runOAuthFlow } from "./oauth.js";

let calls: { url: string; init?: RequestInit }[] = [];

beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? undefined });
    if (url.endsWith("/auth/oauth/start")) {
      return new Response(
        JSON.stringify({
          authUrl: "https://example.test/auth?state=abc",
          pollUrl: "/auth/oauth/poll?state=abc",
          state: "abc",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/auth/oauth/poll")) {
      // First poll: pending; second poll: ready
      const pendingCount = calls.filter((c) =>
        c.url.includes("/auth/oauth/poll"),
      ).length;
      if (pendingCount < 2) {
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ status: "ready", token: "session.jwt.token" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("runOAuthFlow", () => {
  it("posts /start, opens authUrl, polls until ready", async () => {
    calls = [];
    let openedUrl = "";
    const result = await runOAuthFlow({
      provider: "github",
      backendHttpUrl: "http://localhost:8080",
      open: async (u) => {
        openedUrl = u;
      },
      pollIntervalMs: 5,
    });
    expect(result.token).toBe("session.jwt.token");
    expect(openedUrl).toBe("https://example.test/auth?state=abc");
    expect(calls.some((c) => c.url === "http://localhost:8080/auth/oauth/start"))
      .toBe(true);
    expect(
      calls.filter((c) => c.url.includes("/auth/oauth/poll")).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/client/src/auth/oauth.ts`**

```typescript
import openDefault from "open";

export type OAuthProvider = "github" | "google" | "discord";

export type RunOAuthInput = {
  provider: OAuthProvider;
  backendHttpUrl: string;
  /** Replace in tests with a stub that records the URL. */
  open?: (url: string) => Promise<void> | void;
  pollIntervalMs?: number;
  /** Aborts the polling loop. */
  signal?: AbortSignal;
};

export type OAuthResult = { token: string };

type StartResponse = {
  authUrl: string;
  pollUrl: string;
  state: string;
};

type PollResponse =
  | { status: "ready"; token: string }
  | { status: "pending" }
  | { status: "not_found" };

export async function runOAuthFlow(input: RunOAuthInput): Promise<OAuthResult> {
  const open = input.open ?? ((u: string) => openDefault(u));
  const interval = input.pollIntervalMs ?? 1000;

  const startRes = await fetch(`${input.backendHttpUrl}/auth/oauth/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: input.provider }),
  });
  if (!startRes.ok) {
    throw new Error(`oauth start failed (${startRes.status})`);
  }
  const start = (await startRes.json()) as StartResponse;

  await open(start.authUrl);

  const pollUrl = start.pollUrl.startsWith("http")
    ? start.pollUrl
    : `${input.backendHttpUrl}${start.pollUrl}`;

  while (true) {
    if (input.signal?.aborted) {
      throw new Error("oauth flow aborted");
    }
    await new Promise((r) => setTimeout(r, interval));
    const res = await fetch(pollUrl);
    if (res.status === 404) {
      throw new Error("oauth state expired or not found");
    }
    if (!res.ok) {
      // transient — keep trying
      continue;
    }
    const body = (await res.json()) as PollResponse;
    if (body.status === "ready") return { token: body.token };
    if (body.status === "pending") continue;
    throw new Error("oauth state not found");
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter chat-room test`
Expected: 23 + 1 = 24 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/auth/oauth.ts packages/client/src/auth/oauth.test.ts
git commit -m "feat(client): oauth flow with browser open + poll loop"
```

---

## Phase 4: Screens

### Task 7: App router + RoomInput screen

**Files:**
- Create: `packages/client/src/app.tsx`
- Create: `packages/client/src/screens/RoomInput.tsx`
- Create: `packages/client/src/screens/RoomInput.test.tsx`
- Modify: `packages/client/src/cli.tsx`

- [ ] **Step 1: Write failing test for RoomInput**

Create `packages/client/src/screens/RoomInput.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { RoomInput } from "./RoomInput.js";

describe("RoomInput", () => {
  beforeEach(() => useStore.getState().reset());

  it("renders the prompt", () => {
    const { lastFrame } = render(<RoomInput />);
    expect(lastFrame()).toContain("Room name");
  });

  it("commits the typed name on Enter and advances screen", () => {
    const { stdin } = render(<RoomInput />);
    stdin.write("lobby");
    stdin.write("\r"); // Enter
    expect(useStore.getState().roomName).toBe("lobby");
    expect(useStore.getState().screen).toBe("identity_select");
  });

  it("ignores empty submissions", () => {
    const { stdin } = render(<RoomInput />);
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("room_input");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `pnpm --filter chat-room test`
Expected: FAIL — `Cannot find module './RoomInput.js'`.

- [ ] **Step 3: Implement `packages/client/src/screens/RoomInput.tsx`**

```typescript
import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../store.js";

export function RoomInput(): React.JSX.Element {
  const [value, setValue] = useState("");
  const commit = useStore((s) => s.commitRoomName);
  const onSubmit = (v: string) => {
    if (!v.trim()) return;
    commit(v.trim());
  };
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Welcome to chat-room</Text>
      </Box>
      <Box>
        <Text>Room name: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>(Enter to continue, Ctrl+C to quit)</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Create `packages/client/src/app.tsx`** (router shell — will be expanded in later tasks):

```typescript
import React from "react";
import { Box, Text } from "ink";
import { useStore } from "./store.js";
import { RoomInput } from "./screens/RoomInput.js";

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    default:
      return (
        <Box padding={1}>
          <Text>Screen "{screen}" not implemented yet.</Text>
        </Box>
      );
  }
}
```

- [ ] **Step 5: Replace `packages/client/src/cli.tsx`** with the proper entry:

```typescript
#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { loadConfig } from "./config.js";
import { useStore } from "./store.js";

const config = loadConfig();
if (config.initialRoom) {
  useStore.getState().commitRoomName(config.initialRoom);
}

render(<App />);
```

(The `config` import is set up for future tasks; `--room` is honored immediately by skipping past the first screen.)

- [ ] **Step 6: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 24 + 3 = 27 tests pass.

- [ ] **Step 7: Sanity-render the CLI**

Run: `pnpm dev:client`
Expected: prints the Welcome / Room name prompt. Ctrl+C to exit.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/app.tsx packages/client/src/cli.tsx \
        packages/client/src/screens/RoomInput.tsx \
        packages/client/src/screens/RoomInput.test.tsx
git commit -m "feat(client): app router + room input screen"
```

---

### Task 8: IdentitySelect + NicknameInput screens

**Files:**
- Create: `packages/client/src/screens/IdentitySelect.tsx`
- Create: `packages/client/src/screens/IdentitySelect.test.tsx`
- Create: `packages/client/src/screens/NicknameInput.tsx`
- Create: `packages/client/src/screens/NicknameInput.test.tsx`
- Modify: `packages/client/src/app.tsx`

- [ ] **Step 1: Test for IdentitySelect**

Create `packages/client/src/screens/IdentitySelect.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { IdentitySelect } from "./IdentitySelect.js";

describe("IdentitySelect", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
  });

  it("renders four options", () => {
    const { lastFrame } = render(<IdentitySelect />);
    expect(lastFrame()).toContain("Anonymous");
    expect(lastFrame()).toContain("GitHub");
    expect(lastFrame()).toContain("Google");
    expect(lastFrame()).toContain("Discord");
  });

  it("selecting Anonymous advances to nickname_input", () => {
    const { stdin } = render(<IdentitySelect />);
    // first option is preselected; Enter chooses it
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("nickname_input");
  });

  it("selecting GitHub stages pending oauth identity and advances", () => {
    const { stdin } = render(<IdentitySelect />);
    stdin.write("[B"); // down arrow
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("oauth_waiting");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("oauth");
    if (id?.kind === "oauth") expect(id.provider).toBe("github");
  });
});
```

- [ ] **Step 2: Implement `packages/client/src/screens/IdentitySelect.tsx`**

```typescript
import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useStore } from "../store.js";

type ItemValue = "anon" | "github" | "google" | "discord";

const items: { label: string; value: ItemValue }[] = [
  { label: "Anonymous (just a nickname)", value: "anon" },
  { label: "Sign in with GitHub", value: "github" },
  { label: "Sign in with Google", value: "google" },
  { label: "Sign in with Discord", value: "discord" },
];

export function IdentitySelect(): React.JSX.Element {
  const roomName = useStore((s) => s.roomName);
  const setScreen = useStore((s) => s.setScreen);
  const setPending = useStore((s) => s.setPendingIdentity);

  const onSelect = (item: { value: ItemValue }) => {
    if (item.value === "anon") {
      setPending(null);
      setScreen("nickname_input");
      return;
    }
    setPending({ kind: "oauth", provider: item.value, token: "" });
    setScreen("oauth_waiting");
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Room: <Text bold>{roomName}</Text></Text>
      </Box>
      <Box marginBottom={1}>
        <Text>How do you want to join?</Text>
      </Box>
      <SelectInput items={items} onSelect={onSelect} />
    </Box>
  );
}
```

- [ ] **Step 3: Test for NicknameInput**

Create `packages/client/src/screens/NicknameInput.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { NicknameInput } from "./NicknameInput.js";

describe("NicknameInput", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    useStore.getState().setScreen("nickname_input");
  });

  it("renders prompt", () => {
    const { lastFrame } = render(<NicknameInput />);
    expect(lastFrame()).toMatch(/Nickname/i);
  });

  it("stores anon identity on submit and advances to chat", () => {
    const { stdin } = render(<NicknameInput />);
    stdin.write("Alice");
    stdin.write("\r");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("anon");
    if (id?.kind === "anon") expect(id.nickname).toBe("Alice");
    expect(useStore.getState().screen).toBe("chat");
  });

  it("ignores empty submission", () => {
    const { stdin } = render(<NicknameInput />);
    stdin.write("\r");
    expect(useStore.getState().pendingIdentity).toBeNull();
  });
});
```

- [ ] **Step 4: Implement `packages/client/src/screens/NicknameInput.tsx`**

```typescript
import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../store.js";

export function NicknameInput(): React.JSX.Element {
  const [value, setValue] = useState("");
  const setPending = useStore((s) => s.setPendingIdentity);
  const setScreen = useStore((s) => s.setScreen);
  const onSubmit = (v: string) => {
    if (!v.trim()) return;
    setPending({ kind: "anon", nickname: v.trim() });
    setScreen("chat");
  };
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Nickname (1-20 chars):</Text>
      </Box>
      <Box>
        <Text>&gt; </Text>
        <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: Update `packages/client/src/app.tsx`** to wire both screens:

```typescript
import React from "react";
import { Box, Text } from "ink";
import { useStore } from "./store.js";
import { RoomInput } from "./screens/RoomInput.js";
import { IdentitySelect } from "./screens/IdentitySelect.js";
import { NicknameInput } from "./screens/NicknameInput.js";

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    case "identity_select":
      return <IdentitySelect />;
    case "nickname_input":
      return <NicknameInput />;
    default:
      return (
        <Box padding={1}>
          <Text>Screen "{screen}" not implemented yet.</Text>
        </Box>
      );
  }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 27 + 3 (IdentitySelect) + 3 (NicknameInput) = 33 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/screens/IdentitySelect.tsx \
        packages/client/src/screens/IdentitySelect.test.tsx \
        packages/client/src/screens/NicknameInput.tsx \
        packages/client/src/screens/NicknameInput.test.tsx \
        packages/client/src/app.tsx
git commit -m "feat(client): identity select + nickname input screens"
```

---

### Task 9: OAuthWaiting screen

**Files:**
- Create: `packages/client/src/screens/OAuthWaiting.tsx`
- Create: `packages/client/src/screens/OAuthWaiting.test.tsx`
- Modify: `packages/client/src/app.tsx`

The OAuthWaiting screen kicks off `runOAuthFlow`, displays the URL while waiting, and on success stores the token in the pending identity (so the next step — chat connect — can use it).

- [ ] **Step 1: Test**

Create `packages/client/src/screens/OAuthWaiting.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { OAuthWaiting } from "./OAuthWaiting.js";
import * as oauth from "../auth/oauth.js";

describe("OAuthWaiting", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    useStore.getState().setPendingIdentity({
      kind: "oauth",
      provider: "github",
      token: "",
    });
    useStore.getState().setScreen("oauth_waiting");
  });

  it("invokes runOAuthFlow and updates pendingIdentity on success", async () => {
    const spy = vi
      .spyOn(oauth, "runOAuthFlow")
      .mockResolvedValue({ token: "tok-xyz" });
    const { lastFrame, rerender } = render(
      <OAuthWaiting backendHttpUrl="http://localhost:8080" />,
    );
    expect(lastFrame()).toMatch(/Sign in/i);
    // Wait for the promise microtask + a tick to flush state updates
    await new Promise((r) => setTimeout(r, 30));
    rerender(<OAuthWaiting backendHttpUrl="http://localhost:8080" />);
    expect(spy).toHaveBeenCalled();
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("oauth");
    if (id?.kind === "oauth") expect(id.token).toBe("tok-xyz");
    expect(useStore.getState().screen).toBe("chat");
    spy.mockRestore();
  });

  it("sets error state on flow failure", async () => {
    const spy = vi
      .spyOn(oauth, "runOAuthFlow")
      .mockRejectedValue(new Error("boom"));
    render(<OAuthWaiting backendHttpUrl="http://localhost:8080" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(useStore.getState().screen).toBe("error");
    expect(useStore.getState().errorMessage).toMatch(/boom/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement `packages/client/src/screens/OAuthWaiting.tsx`**

```typescript
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { runOAuthFlow } from "../auth/oauth.js";

type Props = { backendHttpUrl: string };

export function OAuthWaiting({ backendHttpUrl }: Props): React.JSX.Element {
  const pending = useStore((s) => s.pendingIdentity);
  const setPending = useStore((s) => s.setPendingIdentity);
  const setError = useStore((s) => s.setError);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || pending.kind !== "oauth") return;
    let cancelled = false;
    const provider = pending.provider;
    (async () => {
      try {
        const result = await runOAuthFlow({
          provider,
          backendHttpUrl,
          open: async (u) => {
            if (!cancelled) setAuthUrl(u);
            // Best-effort: still spawn the real browser via the default `open`.
            const open = (await import("open")).default;
            await open(u);
          },
        });
        if (cancelled) return;
        setPending({ kind: "oauth", provider, token: result.token });
        useStore.getState().setScreen("chat");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, backendHttpUrl, setPending, setError]);

  const providerName =
    pending && pending.kind === "oauth" ? pending.provider : "?";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Sign in with {providerName}</Text>
      </Box>
      {authUrl ? (
        <Box flexDirection="column">
          <Box>
            <Text>Open this URL in your browser:</Text>
          </Box>
          <Box marginTop={1} marginBottom={1}>
            <Text color="cyan">{authUrl}</Text>
          </Box>
          <Box>
            <Text dimColor>Waiting for authorization... (Ctrl+C to cancel)</Text>
          </Box>
        </Box>
      ) : (
        <Text dimColor>Preparing authorization request…</Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Update `packages/client/src/app.tsx`** to wire OAuthWaiting:

```typescript
import React from "react";
import { Box, Text } from "ink";
import { useStore } from "./store.js";
import { loadConfig } from "./config.js";
import { RoomInput } from "./screens/RoomInput.js";
import { IdentitySelect } from "./screens/IdentitySelect.js";
import { NicknameInput } from "./screens/NicknameInput.js";
import { OAuthWaiting } from "./screens/OAuthWaiting.js";

const config = loadConfig();

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    case "identity_select":
      return <IdentitySelect />;
    case "nickname_input":
      return <NicknameInput />;
    case "oauth_waiting":
      return <OAuthWaiting backendHttpUrl={config.backendHttpUrl} />;
    default:
      return (
        <Box padding={1}>
          <Text>Screen "{screen}" not implemented yet.</Text>
        </Box>
      );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 33 + 2 = 35 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/screens/OAuthWaiting.tsx \
        packages/client/src/screens/OAuthWaiting.test.tsx \
        packages/client/src/app.tsx
git commit -m "feat(client): oauth waiting screen runs auth flow"
```

---

### Task 10: Chat screen layout + MessageList component

**Files:**
- Create: `packages/client/src/screens/components/MessageList.tsx`
- Create: `packages/client/src/screens/components/MessageList.test.tsx`
- Create: `packages/client/src/screens/Chat.tsx`

The Chat screen owns the WebSocket lifecycle: when entered, it instantiates a TransportClient, sends the appropriate auth message, and wires inbound server messages back into the store. MessageList is a pure renderer.

- [ ] **Step 1: Test for MessageList**

Create `packages/client/src/screens/components/MessageList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { MessageList } from "./MessageList.js";
import type { Message } from "@chat-room/shared";

function msg(id: string, body: string, nick = "Alice"): Message {
  return {
    id,
    body,
    createdAt: "2026-05-11T00:00:00Z",
    author: { nickname: nick, discriminator: "abcd" },
  };
}

describe("MessageList", () => {
  it("renders each message with author label", () => {
    const items = [
      msg("11111111-1111-1111-1111-111111111111", "hi", "Alice"),
      msg("22222222-2222-2222-2222-222222222222", "yo", "Bob"),
    ];
    const { lastFrame } = render(<MessageList messages={items} />);
    expect(lastFrame()).toContain("Alice#abcd");
    expect(lastFrame()).toContain("hi");
    expect(lastFrame()).toContain("Bob#abcd");
    expect(lastFrame()).toContain("yo");
  });

  it("renders empty when no messages", () => {
    const { lastFrame } = render(<MessageList messages={[]} />);
    expect(lastFrame()).toMatch(/no messages/i);
  });
});
```

- [ ] **Step 2: Implement `packages/client/src/screens/components/MessageList.tsx`**

```typescript
import React from "react";
import { Box, Text } from "ink";
import type { Message } from "@chat-room/shared";

type Props = { messages: Message[] };

function hashColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const palette = ["cyan", "green", "yellow", "magenta", "blueBright", "redBright"];
  return palette[Math.abs(h) % palette.length] ?? "white";
}

export function MessageList({ messages }: Props): React.JSX.Element {
  if (messages.length === 0) {
    return (
      <Box>
        <Text dimColor>(no messages yet)</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {messages.map((m) => {
        const label = `${m.author.nickname}#${m.author.discriminator}`;
        return (
          <Box key={m.id}>
            <Text color={hashColor(label)} bold>
              {label}
            </Text>
            <Text dimColor>: </Text>
            <Text>{m.body}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 3: Implement `packages/client/src/screens/Chat.tsx`**

```typescript
import React, { useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { MessageList } from "./components/MessageList.js";

type Props = { serverUrl: string };

export function Chat({ serverUrl }: Props): React.JSX.Element {
  const messages = useStore((s) => s.messages);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const authedUser = useStore((s) => s.authedUser);
  const status = useStore((s) => s.status);
  const pending = useStore((s) => s.pendingIdentity);
  const roomName = useStore((s) => s.roomName);
  const setStatus = useStore((s) => s.setStatus);
  const onAuthOk = useStore((s) => s.onAuthOk);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const addMessage = useStore((s) => s.addMessage);
  const setPresence = useStore((s) => s.setPresence);
  const renameSelf = useStore((s) => s.renameSelf);
  const setError = useStore((s) => s.setError);

  const transportRef = useRef<TransportClient | null>(null);

  useEffect(() => {
    if (!pending) return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt) => setStatus(s, attempt),
      onMessage: (m) => {
        switch (m.type) {
          case "auth.ok":
            onAuthOk(m.user, /* roomId filled by snapshot */ "");
            break;
          case "auth.error":
            setError(`Auth failed: ${m.reason}`);
            client.close();
            break;
          case "room.snapshot":
            setSnapshot(m.room.id, m.messages, m.onlineUsers);
            break;
          case "message":
            addMessage(m.data);
            break;
          case "system":
            addMessage({
              id: `sys-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              body: `── ${m.body} ──`,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "system" as unknown as string },
            } as unknown as Parameters<typeof addMessage>[0]);
            break;
          case "presence":
            setPresence(m.onlineUsers);
            break;
          case "history":
            useStore.getState().prependHistory(m.messages, m.hasMore);
            break;
          case "error":
            // surface non-fatal errors as a system row
            break;
        }
      },
    });
    transportRef.current = client;
    client.connect();
    // Send auth as soon as the socket opens; we know it's open when status === "connected"
    const unsub = useStore.subscribe((state, prev) => {
      if (state.status === "connected" && prev.status !== "connected") {
        if (pending.kind === "anon") {
          client.send({
            type: "auth.anon",
            nickname: pending.nickname,
            roomName,
          });
        } else {
          client.send({
            type: "auth.oauth",
            token: pending.token,
            roomName,
          });
        }
      }
    });
    return () => {
      unsub();
      client.close();
      transportRef.current = null;
    };
  }, [pending, roomName, serverUrl, setStatus, onAuthOk, setSnapshot, addMessage, setPresence, setError]);

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>Room: {roomName}</Text>
            {authedUser ? (
              <Text dimColor> (you are {authedUser.nickname}#{authedUser.discriminator})</Text>
            ) : null}
          </Box>
          <MessageList messages={messages} />
        </Box>
        <Box flexDirection="column" width={20} paddingX={1} borderStyle="single">
          <Text bold>Online ({onlineUsers.length})</Text>
          {onlineUsers.map((u) => (
            <Text key={`${u.nickname}#${u.discriminator}`}>{u.nickname}#{u.discriminator}</Text>
          ))}
        </Box>
      </Box>
      <Box>
        <Text dimColor>Status: {status}</Text>
      </Box>
    </Box>
  );
}
```

(The InputBar component lands in Task 11; for now Chat renders without an input.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 35 + 2 (MessageList) = 37 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/screens/Chat.tsx \
        packages/client/src/screens/components/MessageList.tsx \
        packages/client/src/screens/components/MessageList.test.tsx
git commit -m "feat(client): chat screen layout + message list component"
```

---

### Task 11: OnlineList + InputBar + StatusBar components

**Files:**
- Create: `packages/client/src/screens/components/OnlineList.tsx`
- Create: `packages/client/src/screens/components/InputBar.tsx`
- Create: `packages/client/src/screens/components/InputBar.test.tsx`
- Create: `packages/client/src/screens/components/StatusBar.tsx`
- Modify: `packages/client/src/screens/Chat.tsx`

- [ ] **Step 1: Implement `packages/client/src/screens/components/OnlineList.tsx`**

```typescript
import React from "react";
import { Box, Text } from "ink";

type Props = {
  users: { nickname: string; discriminator: string }[];
};

export function OnlineList({ users }: Props): React.JSX.Element {
  return (
    <Box flexDirection="column" width={22} paddingX={1} borderStyle="single">
      <Text bold>Online ({users.length})</Text>
      {users.map((u) => (
        <Text key={`${u.nickname}#${u.discriminator}`}>
          {u.nickname}#{u.discriminator}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Implement `packages/client/src/screens/components/StatusBar.tsx`**

```typescript
import React from "react";
import { Box, Text } from "ink";
import type { ConnStatus } from "../../store.js";

type Props = {
  status: ConnStatus;
  reconnectAttempt: number;
};

const LABELS: Record<ConnStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

const COLORS: Record<ConnStatus, string | undefined> = {
  idle: undefined,
  connecting: "yellow",
  connected: "green",
  reconnecting: "yellow",
  disconnected: "red",
};

export function StatusBar({ status, reconnectAttempt }: Props): React.JSX.Element {
  const extra =
    status === "reconnecting" && reconnectAttempt > 0
      ? ` (attempt ${reconnectAttempt})`
      : "";
  return (
    <Box>
      <Text color={COLORS[status]} bold>
        {LABELS[status]}
        {extra}
      </Text>
      <Text dimColor> · Ctrl+C to quit · /nick &lt;name&gt; to rename</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Test for InputBar**

Create `packages/client/src/screens/components/InputBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { InputBar } from "./InputBar.js";

describe("InputBar", () => {
  it("calls onSend on Enter with the typed value", () => {
    const onSend = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={() => {}} />);
    stdin.write("hello");
    stdin.write("\r");
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("calls onNick when input starts with /nick", () => {
    const onNick = vi.fn();
    const { stdin } = render(<InputBar onSend={() => {}} onNick={onNick} />);
    stdin.write("/nick Alicia");
    stdin.write("\r");
    expect(onNick).toHaveBeenCalledWith("Alicia");
  });

  it("ignores empty submissions", () => {
    const onSend = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={() => {}} />);
    stdin.write("\r");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("ignores unknown slash commands", () => {
    const onSend = vi.fn();
    const onNick = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={onNick} />);
    stdin.write("/foo bar");
    stdin.write("\r");
    expect(onSend).not.toHaveBeenCalled();
    expect(onNick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Implement `packages/client/src/screens/components/InputBar.tsx`**

```typescript
import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  onSend: (body: string) => void;
  onNick: (newNickname: string) => void;
};

export function InputBar({ onSend, onNick }: Props): React.JSX.Element {
  const [value, setValue] = useState("");

  const onSubmit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
      const arg = rest.join(" ").trim();
      if (cmd === "nick" && arg) {
        onNick(arg);
        setValue("");
        return;
      }
      // unknown slash command — drop it (Plan B keeps simple)
      setValue("");
      return;
    }
    onSend(trimmed);
    setValue("");
  };

  return (
    <Box>
      <Text>&gt; </Text>
      <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
    </Box>
  );
}
```

- [ ] **Step 5: Update `packages/client/src/screens/Chat.tsx`** to use the new components and to wire send/nick to the transport:

Replace the file's contents with:

```typescript
import React, { useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { MessageList } from "./components/MessageList.js";
import { OnlineList } from "./components/OnlineList.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";

type Props = { serverUrl: string };

export function Chat({ serverUrl }: Props): React.JSX.Element {
  const messages = useStore((s) => s.messages);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const authedUser = useStore((s) => s.authedUser);
  const status = useStore((s) => s.status);
  const reconnectAttempt = useStore((s) => s.reconnectAttempt);
  const pending = useStore((s) => s.pendingIdentity);
  const roomName = useStore((s) => s.roomName);
  const setStatus = useStore((s) => s.setStatus);
  const onAuthOk = useStore((s) => s.onAuthOk);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const addMessage = useStore((s) => s.addMessage);
  const setPresence = useStore((s) => s.setPresence);
  const setError = useStore((s) => s.setError);

  const transportRef = useRef<TransportClient | null>(null);

  useEffect(() => {
    if (!pending) return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt) => setStatus(s, attempt),
      onMessage: (m) => {
        switch (m.type) {
          case "auth.ok":
            onAuthOk(m.user, "");
            break;
          case "auth.error":
            setError(`Auth failed: ${m.reason}`);
            client.close();
            break;
          case "room.snapshot":
            setSnapshot(m.room.id, m.messages, m.onlineUsers);
            break;
          case "message":
            addMessage(m.data);
            break;
          case "system":
            // System notices are rendered inline as italic dim "── body ──"
            addMessage({
              id: `sys-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              body: `── ${m.body} ──`,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "sys" },
            });
            break;
          case "presence":
            setPresence(m.onlineUsers);
            break;
          case "history":
            useStore.getState().prependHistory(m.messages, m.hasMore);
            break;
          case "error":
            // non-fatal; ignore for MVP
            break;
        }
      },
    });
    transportRef.current = client;
    client.connect();
    const unsub = useStore.subscribe((state, prev) => {
      if (state.status === "connected" && prev.status !== "connected") {
        if (pending.kind === "anon") {
          client.send({
            type: "auth.anon",
            nickname: pending.nickname,
            roomName,
          });
        } else {
          client.send({
            type: "auth.oauth",
            token: pending.token,
            roomName,
          });
        }
      }
    });
    return () => {
      unsub();
      client.close();
      transportRef.current = null;
    };
  }, [pending, roomName, serverUrl, setStatus, onAuthOk, setSnapshot, addMessage, setPresence, setError]);

  const onSend = (body: string) => {
    transportRef.current?.send({ type: "message.send", body });
  };
  const onNick = (newNickname: string) => {
    transportRef.current?.send({ type: "nick.change", newNickname });
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>Room: {roomName}</Text>
            {authedUser ? (
              <Text dimColor>
                {" "}
                (you are {authedUser.nickname}#{authedUser.discriminator})
              </Text>
            ) : null}
          </Box>
          <MessageList messages={messages} />
        </Box>
        <OnlineList users={onlineUsers} />
      </Box>
      <Box flexDirection="column">
        <InputBar onSend={onSend} onNick={onNick} />
        <StatusBar status={status} reconnectAttempt={reconnectAttempt} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 37 + 4 (InputBar) = 41 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/screens/components/OnlineList.tsx \
        packages/client/src/screens/components/InputBar.tsx \
        packages/client/src/screens/components/InputBar.test.tsx \
        packages/client/src/screens/components/StatusBar.tsx \
        packages/client/src/screens/Chat.tsx
git commit -m "feat(client): online list + input bar + status bar wired to chat"
```

---

## Phase 5: Error path and history scroll

### Task 12: Error screen + history.load on PgUp

**Files:**
- Create: `packages/client/src/screens/ErrorScreen.tsx`
- Modify: `packages/client/src/app.tsx`
- Modify: `packages/client/src/screens/Chat.tsx`

- [ ] **Step 1: Implement `packages/client/src/screens/ErrorScreen.tsx`**

```typescript
import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../store.js";

export function ErrorScreen(): React.JSX.Element {
  const message = useStore((s) => s.errorMessage);
  const reset = useStore((s) => s.reset);
  useInput((_input, key) => {
    if (key.return) {
      reset();
    }
  });
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="red" bold>
          Error
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{message ?? "Unknown error"}</Text>
      </Box>
      <Text dimColor>(Press Enter to start over, Ctrl+C to quit)</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Wire ErrorScreen into the router** — update `packages/client/src/app.tsx`:

```typescript
import React from "react";
import { useStore } from "./store.js";
import { loadConfig } from "./config.js";
import { RoomInput } from "./screens/RoomInput.js";
import { IdentitySelect } from "./screens/IdentitySelect.js";
import { NicknameInput } from "./screens/NicknameInput.js";
import { OAuthWaiting } from "./screens/OAuthWaiting.js";
import { Chat } from "./screens/Chat.js";
import { ErrorScreen } from "./screens/ErrorScreen.js";

const config = loadConfig();

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    case "identity_select":
      return <IdentitySelect />;
    case "nickname_input":
      return <NicknameInput />;
    case "oauth_waiting":
      return <OAuthWaiting backendHttpUrl={config.backendHttpUrl} />;
    case "chat":
      return <Chat serverUrl={config.serverUrl} />;
    case "error":
      return <ErrorScreen />;
  }
}
```

- [ ] **Step 3: Add a PgUp handler in Chat for history.load** — append the following hook block to `packages/client/src/screens/Chat.tsx` inside the `Chat` component, right before the `return (` statement. Locate the existing `onNick = (newNickname: string) => { ... };` line; add this block right after it:

```typescript
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useInput((_input, key) => {
    if (!(key.pageUp ?? false)) return;
    const list = messagesRef.current;
    const oldest = list[0];
    if (!oldest) return;
    if (!useStore.getState().historyHasMore) return;
    transportRef.current?.send({
      type: "history.load",
      beforeId: oldest.id,
      limit: 50,
    });
  });
```

Also update imports at the top of `packages/client/src/screens/Chat.tsx` — replace:

```typescript
import React, { useEffect, useRef } from "react";
import { Box, Text } from "ink";
```

with:

```typescript
import React, { useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
```

(If the `useInput` import is already present from a previous task, leave it.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter chat-room test`
Expected: 41 tests pass (no new tests — Error screen UX + PgUp are exercised in smoke test).

Also run: `pnpm --filter chat-room typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/screens/ErrorScreen.tsx \
        packages/client/src/app.tsx \
        packages/client/src/screens/Chat.tsx
git commit -m "feat(client): error screen + PgUp triggers history load"
```

---

## Phase 6: End-to-end smoke test

### Task 13: Manual smoke test against running backend

This task does NOT produce code — it validates the whole stack. Skip if the backend's `.env` is not populated.

- [ ] **Step 1: Ensure backend is running**

In one terminal:

```bash
pnpm dev:backend
```

Expected: log line `backend listening { port: 8080 }`.

- [ ] **Step 2: Create a test room via admin CLI** (in another terminal):

```bash
pnpm admin room create smoke-test
```

Expected: `✓ Created room "smoke-test" (id: ...)`.

- [ ] **Step 3: Start TWO client instances** in separate terminals:

Terminal A:

```bash
pnpm dev:client
```

Terminal B:

```bash
pnpm dev:client
```

In each:
1. Type `smoke-test` at the Room name prompt → Enter.
2. Select `Anonymous`.
3. Enter a nickname (`Alice` in A, `Bob` in B) → Enter.

Expected in each:
- A "Connected" status appears in green at the bottom.
- The chat screen shows a header with the room name and your `Nick#abcd` label.
- Terminal A shows a `── Bob#... joined ──` system line after B connects.

- [ ] **Step 4: Exchange messages**

In Terminal A, type `hello` + Enter.
Expected in BOTH terminals: a row `Alice#xxxx: hello`.

In Terminal B, type `yo` + Enter.
Expected in BOTH terminals: a row `Bob#xxxx: yo`.

- [ ] **Step 5: Rename**

In Terminal A, type `/nick Alicia` + Enter.
Expected in BOTH terminals: a `── Alice#xxxx → Alicia#xxxx ──` system line.

- [ ] **Step 6: Reconnect smoke test**

Stop the backend (`Ctrl+C` in the backend terminal).
Expected in clients: status flips to `Reconnecting (attempt N)` (yellow).

Restart the backend.
Expected in clients: status flips back to `Connected` (green). Users may need to re-join (the server has lost in-memory presence).

- [ ] **Step 7: Clean up**

In any terminal:

```bash
pnpm admin room delete smoke-test -y
```

- [ ] **Step 8: Document outcome**

If everything above worked end-to-end, Plan B is complete. If any step failed, debug before declaring done.

No commit for this task — it is verification only.

---

## Done — Plan B Exit Criteria

- `pnpm dev:client` boots and accepts input.
- Anonymous identity round-trips: type room name → Anonymous → nickname → land in chat → exchange messages with another client → rename via `/nick`.
- OAuth code path is in place (auth flow code + screen wired), to be exercised end-to-end with a real Discord client_id/secret in Plan C smoke testing.
- 41 unit + component tests passing in the client package.
- Reconnect logic works when the backend bounces.
- Error screen handles auth failures and unrecoverable connection losses.

**What's NOT in Plan B:**
- Dockerfile / GCP Cloud Run deployment (Plan C).
- npm publishing (Plan C).
- Real Discord/GitHub/Google OAuth round-trip against the deployed backend (Plan C smoke test).
- "Continue as previous OAuth user" shortcut on the identity screen (deferred; not in spec scope for Plan B).

Once this plan is green, hand off to Plan C.
