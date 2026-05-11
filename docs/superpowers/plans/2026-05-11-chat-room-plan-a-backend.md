# Chat Room — Plan A: Backend & Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, shared protocol package, and a fully-functional backend (HTTP + WebSocket) that can be exercised end-to-end from a CLI test client.

**Architecture:** pnpm monorepo with three packages (shared, backend, client). This plan covers shared + backend only. Backend uses Fastify for HTTP (OAuth endpoints), `ws` for WebSocket (chat), Supabase Postgres for persistence, and an in-memory `Map<roomId, Set<Connection>>` for live broadcast.

**Tech Stack:** Node.js 20+, TypeScript 5.5+ (ESM), pnpm 9+, Fastify 4, `ws`, Vitest, zod, jsonwebtoken, supabase-js, pino, cac.

**Reference spec:** `docs/superpowers/specs/2026-05-11-chat-room-design.md`

**Plan B/C scope:** Plan B builds the Ink TUI client. Plan C handles GCP Cloud Run + npm publishing.

---

## File Structure (Plan A only)

```
.
├── package.json                              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .npmrc
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                       # re-exports
│   │       ├── models.ts                      # User, Message, Room types
│   │       └── protocol.ts                    # WS message zod schemas
│   └── backend/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── .env.example
│       └── src/
│           ├── index.ts                       # process entry
│           ├── config.ts                      # env validation
│           ├── logger.ts                      # pino instance
│           ├── server.ts                      # HTTP + WS bootstrap
│           ├── utils/
│           │   ├── discriminator.ts
│           │   ├── nickname.ts
│           │   └── jwt.ts
│           ├── db/
│           │   ├── supabase.ts                # client wrapper
│           │   ├── rooms.ts                   # repository
│           │   ├── users.ts                   # repository
│           │   └── messages.ts                # repository
│           ├── auth/
│           │   ├── state-store.ts             # OAuth nonce store
│           │   ├── providers.ts               # provider configs
│           │   └── routes.ts                  # Fastify OAuth routes
│           ├── ws/
│           │   ├── server.ts                  # ws server attach
│           │   ├── connection-registry.ts     # room state Map
│           │   ├── broadcast.ts
│           │   └── handlers/
│           │       ├── auth.ts
│           │       ├── send.ts
│           │       ├── nick.ts
│           │       └── history.ts
│           ├── admin/
│           │   └── cli.ts                     # admin commands
│           └── __tests__/
│               ├── integration/
│               │   └── flow.test.ts           # full WS scenario
│               └── unit/                       # per-file unit tests live next to source
└── supabase/
    └── migrations/
        └── 20260511000000_init.sql
```

Unit test files live colocated as `<file>.test.ts` (Vitest convention).

---

## Phase 1: Foundation

### Task 1: Initialize pnpm monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.npmrc`

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "chat-room",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev:backend": "pnpm --filter @chat-room/backend dev",
    "admin": "pnpm --filter @chat-room/backend admin"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Create `.npmrc` to keep dependencies hoisted predictably**

```
auto-install-peers=true
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 5: Verify pnpm is available**

Run: `pnpm --version`
Expected: a version string `>=9.0.0` (if missing, `npm i -g pnpm`)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .npmrc
git commit -m "chore: initialize pnpm monorepo skeleton"
```

---

### Task 2: Create shared package with model types

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/models.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@chat-room/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/models.ts`**

```typescript
import { z } from "zod";

export const AuthorSchema = z.object({
  nickname: z.string(),
  discriminator: z.string().length(4),
});
export type Author = z.infer<typeof AuthorSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  author: AuthorSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
});
export type Room = z.infer<typeof RoomSchema>;

export const UserSchema = z.object({
  nickname: z.string(),
  discriminator: z.string().length(4),
});
export type User = z.infer<typeof UserSchema>;

export const AuthProvider = z.enum(["anon", "github", "google", "discord"]);
export type AuthProvider = z.infer<typeof AuthProvider>;
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```typescript
export * from "./models.js";
```

- [ ] **Step 5: Install dependencies and build**

Run: `pnpm install`
Expected: completes without errors and installs zod + typescript.

Run: `pnpm --filter @chat-room/shared build`
Expected: produces `packages/shared/dist/index.js` and `index.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add core model schemas (Message, Author, Room, User)"
```

---

### Task 3: Add WebSocket protocol schemas to shared package

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/protocol.ts`**

```typescript
import { z } from "zod";
import { MessageSchema, UserSchema } from "./models.js";

// ─── Client → Server ──────────────────────────────────────────────────────────

export const AuthAnonSchema = z.object({
  type: z.literal("auth.anon"),
  nickname: z.string().min(1).max(20),
  roomName: z.string().min(1).max(64),
});

export const AuthOAuthSchema = z.object({
  type: z.literal("auth.oauth"),
  token: z.string(),
  roomName: z.string().min(1).max(64),
});

export const MessageSendSchema = z.object({
  type: z.literal("message.send"),
  body: z.string().min(1).max(2000),
});

export const NickChangeSchema = z.object({
  type: z.literal("nick.change"),
  newNickname: z.string().min(1).max(20),
});

export const HistoryLoadSchema = z.object({
  type: z.literal("history.load"),
  beforeId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  AuthAnonSchema,
  AuthOAuthSchema,
  MessageSendSchema,
  NickChangeSchema,
  HistoryLoadSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type AuthAnon = z.infer<typeof AuthAnonSchema>;
export type AuthOAuth = z.infer<typeof AuthOAuthSchema>;
export type MessageSend = z.infer<typeof MessageSendSchema>;
export type NickChange = z.infer<typeof NickChangeSchema>;
export type HistoryLoad = z.infer<typeof HistoryLoadSchema>;

// ─── Server → Client ──────────────────────────────────────────────────────────

export const AuthOkSchema = z.object({
  type: z.literal("auth.ok"),
  user: z.object({
    id: z.string().uuid(),
    nickname: z.string(),
    discriminator: z.string().length(4),
  }),
});

export const AuthErrorReason = z.enum([
  "room_not_found",
  "invalid_token",
  "nickname_invalid",
]);

export const AuthErrorSchema = z.object({
  type: z.literal("auth.error"),
  reason: AuthErrorReason,
});

export const RoomSnapshotSchema = z.object({
  type: z.literal("room.snapshot"),
  room: z.object({ id: z.string().uuid(), name: z.string() }),
  messages: z.array(MessageSchema),
  onlineUsers: z.array(UserSchema),
});

export const NewMessageSchema = z.object({
  type: z.literal("message"),
  data: MessageSchema,
});

export const SystemMessageSchema = z.object({
  type: z.literal("system"),
  event: z.enum(["join", "leave", "rename"]),
  body: z.string(),
});

export const PresenceSchema = z.object({
  type: z.literal("presence"),
  onlineUsers: z.array(UserSchema),
});

export const HistoryResponseSchema = z.object({
  type: z.literal("history"),
  messages: z.array(MessageSchema),
  hasMore: z.boolean(),
});

export const ErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string().optional(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  AuthOkSchema,
  AuthErrorSchema,
  RoomSnapshotSchema,
  NewMessageSchema,
  SystemMessageSchema,
  PresenceSchema,
  HistoryResponseSchema,
  ErrorSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
```

- [ ] **Step 2: Update `packages/shared/src/index.ts` to re-export the protocol**

```typescript
export * from "./models.js";
export * from "./protocol.js";
```

- [ ] **Step 3: Build to verify schemas compile**

Run: `pnpm --filter @chat-room/shared build`
Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add WebSocket protocol schemas"
```

---

## Phase 2: Backend Skeleton

### Task 4: Create backend package skeleton

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/vitest.config.ts`
- Create: `packages/backend/.env.example`
- Create: `packages/backend/src/index.ts`

- [ ] **Step 1: Create `packages/backend/package.json`**

```json
{
  "name": "@chat-room/backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "admin": "tsx src/admin/cli.ts"
  },
  "dependencies": {
    "@chat-room/shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "cac": "^6.7.14",
    "fastify": "^4.28.0",
    "jsonwebtoken": "^9.0.2",
    "nanoid": "^5.0.7",
    "pino": "^9.0.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Create `packages/backend/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `packages/backend/.env.example`**

```env
# Server
PORT=8080
NODE_ENV=development
PUBLIC_BACKEND_URL=http://localhost:8080

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# JWT
JWT_SIGNING_KEY=replace-with-long-random-string

# OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

- [ ] **Step 5: Create `packages/backend/src/index.ts` (temporary hello)**

```typescript
console.log("chat-room backend booting…");
```

- [ ] **Step 6: Install + verify**

Run: `pnpm install`
Expected: completes; all backend deps installed.

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

Run: `pnpm --filter @chat-room/backend dev`
Expected: prints `chat-room backend booting…` then exits (Ctrl+C if it stays alive).

- [ ] **Step 7: Commit**

```bash
git add packages/backend
git commit -m "chore(backend): scaffold package with deps and tsconfig"
```

---

### Task 5: Add config module with env validation

**Files:**
- Create: `packages/backend/src/config.ts`
- Create: `packages/backend/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  const valid = {
    PORT: "8080",
    NODE_ENV: "development",
    PUBLIC_BACKEND_URL: "http://localhost:8080",
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    JWT_SIGNING_KEY: "0123456789abcdef0123456789abcdef",
    GITHUB_CLIENT_ID: "g",
    GITHUB_CLIENT_SECRET: "g",
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    DISCORD_CLIENT_ID: "d",
    DISCORD_CLIENT_SECRET: "d",
  };

  it("parses a valid env", () => {
    const cfg = parseConfig(valid);
    expect(cfg.port).toBe(8080);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.supabase.url).toBe("https://x.supabase.co");
  });

  it("rejects missing SUPABASE_URL", () => {
    const { SUPABASE_URL, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow();
  });

  it("rejects short JWT_SIGNING_KEY", () => {
    expect(() => parseConfig({ ...valid, JWT_SIGNING_KEY: "short" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL — `Cannot find module './config.js'`.

- [ ] **Step 3: Implement `packages/backend/src/config.ts`**

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8080"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_BACKEND_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SIGNING_KEY: z.string().min(32),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
});

export type Config = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  publicBackendUrl: string;
  supabase: { url: string; serviceRoleKey: string };
  jwtSigningKey: string;
  oauth: {
    github: { clientId: string; clientSecret: string };
    google: { clientId: string; clientSecret: string };
    discord: { clientId: string; clientSecret: string };
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
      github: {
        clientId: parsed.GITHUB_CLIENT_ID,
        clientSecret: parsed.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: parsed.GOOGLE_CLIENT_ID,
        clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      },
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

Run: `pnpm --filter @chat-room/backend test`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/config.ts packages/backend/src/config.test.ts
git commit -m "feat(backend): add env config parsing with zod"
```

---

### Task 6: Add pino logger module

**Files:**
- Create: `packages/backend/src/logger.ts`

- [ ] **Step 1: Implement `packages/backend/src/logger.ts`**

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "chat-room-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = typeof logger;
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/logger.ts
git commit -m "feat(backend): add pino logger"
```

---

## Phase 3: Utilities

### Task 7: Discriminator generator

**Files:**
- Create: `packages/backend/src/utils/discriminator.ts`
- Create: `packages/backend/src/utils/discriminator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/utils/discriminator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateDiscriminator, isValidDiscriminator } from "./discriminator.js";

describe("generateDiscriminator", () => {
  it("returns 4 lowercase-alphanumeric chars", () => {
    for (let i = 0; i < 100; i++) {
      const d = generateDiscriminator();
      expect(d).toMatch(/^[a-z0-9]{4}$/);
    }
  });

  it("produces varied outputs", () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateDiscriminator());
    // ~3.36M space — 200 draws should never collide enough to drop below 150 unique
    expect(set.size).toBeGreaterThan(150);
  });
});

describe("isValidDiscriminator", () => {
  it("accepts 4-char alphanumeric", () => {
    expect(isValidDiscriminator("a1b2")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isValidDiscriminator("a1b")).toBe(false);
    expect(isValidDiscriminator("a1b23")).toBe(false);
  });
  it("rejects uppercase", () => {
    expect(isValidDiscriminator("A1B2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement `packages/backend/src/utils/discriminator.ts`**

```typescript
import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateDiscriminator(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function isValidDiscriminator(s: string): boolean {
  return /^[a-z0-9]{4}$/.test(s);
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @chat-room/backend test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/discriminator.ts packages/backend/src/utils/discriminator.test.ts
git commit -m "feat(backend): add discriminator generator + validator"
```

---

### Task 8: Nickname validator

**Files:**
- Create: `packages/backend/src/utils/nickname.ts`
- Create: `packages/backend/src/utils/nickname.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/utils/nickname.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateNickname } from "./nickname.js";

describe("validateNickname", () => {
  it("accepts simple ASCII", () => {
    expect(validateNickname("Alice")).toEqual({ ok: true, value: "Alice" });
  });

  it("accepts CJK characters", () => {
    expect(validateNickname("阿莉斯")).toEqual({ ok: true, value: "阿莉斯" });
  });

  it("rejects empty", () => {
    expect(validateNickname("")).toEqual({ ok: false, error: "empty" });
  });

  it("rejects leading whitespace", () => {
    expect(validateNickname(" Alice")).toEqual({ ok: false, error: "whitespace_edges" });
  });

  it("rejects trailing whitespace", () => {
    expect(validateNickname("Alice ")).toEqual({ ok: false, error: "whitespace_edges" });
  });

  it("rejects over 20 chars", () => {
    expect(validateNickname("a".repeat(21))).toEqual({ ok: false, error: "too_long" });
  });

  it("rejects control characters", () => {
    expect(validateNickname("Al\nice")).toEqual({ ok: false, error: "control_chars" });
    expect(validateNickname("Al\u0000ice")).toEqual({ ok: false, error: "control_chars" });
  });

  it("allows internal spaces", () => {
    expect(validateNickname("Alice B")).toEqual({ ok: true, value: "Alice B" });
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/backend/src/utils/nickname.ts`**

```typescript
export type NicknameValidationError =
  | "empty"
  | "too_long"
  | "whitespace_edges"
  | "control_chars";

export type NicknameResult =
  | { ok: true; value: string }
  | { ok: false; error: NicknameValidationError };

export function validateNickname(input: string): NicknameResult {
  if (input.length === 0) return { ok: false, error: "empty" };
  if (input.length > 20) return { ok: false, error: "too_long" };
  if (input !== input.trim()) return { ok: false, error: "whitespace_edges" };
  // disallow control chars including newline / null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(input)) {
    return { ok: false, error: "control_chars" };
  }
  return { ok: true, value: input };
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @chat-room/backend test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/nickname.ts packages/backend/src/utils/nickname.test.ts
git commit -m "feat(backend): add nickname validator"
```

---

### Task 9: JWT module

**Files:**
- Create: `packages/backend/src/utils/jwt.ts`
- Create: `packages/backend/src/utils/jwt.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/utils/jwt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt.js";

const KEY = "0123456789abcdef0123456789abcdef";

describe("session token", () => {
  it("signs and verifies a token", () => {
    const token = signSessionToken({ userId: "u1", provider: "github" }, KEY);
    const decoded = verifySessionToken(token, KEY);
    expect(decoded.userId).toBe("u1");
    expect(decoded.provider).toBe("github");
  });

  it("rejects a token signed with a different key", () => {
    const token = signSessionToken({ userId: "u1", provider: "github" }, KEY);
    expect(() => verifySessionToken(token, "x".repeat(32))).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signSessionToken({ userId: "u1", provider: "github" }, KEY);
    const bad = token.slice(0, -2) + "aa";
    expect(() => verifySessionToken(bad, KEY)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/backend/src/utils/jwt.ts`**

```typescript
import jwt from "jsonwebtoken";
import { z } from "zod";

const PayloadSchema = z.object({
  userId: z.string().uuid(),
  provider: z.enum(["github", "google", "discord"]),
});
export type SessionPayload = z.infer<typeof PayloadSchema>;

const EXPIRES_IN = "7d";

export function signSessionToken(payload: SessionPayload, key: string): string {
  return jwt.sign(payload, key, { algorithm: "HS256", expiresIn: EXPIRES_IN });
}

export function verifySessionToken(token: string, key: string): SessionPayload {
  const decoded = jwt.verify(token, key, { algorithms: ["HS256"] });
  return PayloadSchema.parse(decoded);
}
```

Note: the tests above use `"u1"` which isn't a valid uuid — update them to use a real uuid before running, OR loosen the test fixture to be a uuid. Use this corrected test fixture:

```typescript
const USER_ID = "11111111-1111-1111-1111-111111111111";
// then in tests: signSessionToken({ userId: USER_ID, provider: "github" }, KEY);
// and: expect(decoded.userId).toBe(USER_ID);
```

Edit `jwt.test.ts` accordingly before running.

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @chat-room/backend test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/jwt.ts packages/backend/src/utils/jwt.test.ts
git commit -m "feat(backend): add session JWT sign/verify"
```

---

## Phase 4: Database

### Task 10: Supabase migration and client wrapper

**Files:**
- Create: `supabase/migrations/20260511000000_init.sql`
- Create: `packages/backend/src/db/supabase.ts`

**Background:** This task assumes you have created a Supabase project and copied its URL + service role key to a local `.env`. You can install the Supabase CLI (`brew install supabase/tap/supabase`) to run migrations, or paste the SQL into the Supabase Dashboard SQL editor. The migration file is the source of truth either way.

- [ ] **Step 1: Create the migration file `supabase/migrations/20260511000000_init.sql`**

```sql
-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider  text NOT NULL CHECK (auth_provider IN ('anon','github','google','discord')),
  auth_subject   text NOT NULL,
  nickname       text NOT NULL,
  discriminator  text NOT NULL CHECK (discriminator ~ '^[a-z0-9]{4}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_provider_subject_unique UNIQUE (auth_provider, auth_subject),
  CONSTRAINT users_nick_disc_unique        UNIQUE (nickname, discriminator)
);

-- Messages (author identity snapshotted at insert time)
CREATE TABLE IF NOT EXISTS messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  author_nickname       text NOT NULL,
  author_discriminator  text NOT NULL,
  body                  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON messages (room_id, created_at DESC);
```

- [ ] **Step 2: Apply the migration**

Choose one of:
- (Recommended) Supabase Dashboard → SQL Editor → paste contents → run.
- Or: `supabase db push` if you've initialized the Supabase CLI in this repo.

- [ ] **Step 3: Verify in Supabase**

In Dashboard → Table Editor, confirm tables `rooms`, `users`, `messages` exist.

- [ ] **Step 4: Create `packages/backend/src/db/supabase.ts`**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "chat-room-backend" } },
  });
}

export type DB = SupabaseClient;
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations packages/backend/src/db/supabase.ts
git commit -m "feat(db): initial schema migration + supabase client wrapper"
```

---

### Task 11: Room repository

**Files:**
- Create: `packages/backend/src/db/rooms.ts`

**Note on testing:** Repository tests need a live Supabase project. We defer them to the integration test in Task 23. This task is implementation-only with a typecheck gate.

- [ ] **Step 1: Implement `packages/backend/src/db/rooms.ts`**

```typescript
import type { DB } from "./supabase.js";

export type RoomRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

export class RoomsRepo {
  constructor(private db: DB) {}

  async findByName(name: string): Promise<RoomRow | null> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(name: string, createdBy?: string): Promise<RoomRow> {
    const { data, error } = await this.db
      .from("rooms")
      .insert({ name, created_by: createdBy ?? null })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async list(): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async deleteByName(name: string): Promise<void> {
    const { error } = await this.db.from("rooms").delete().eq("name", name);
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/rooms.ts
git commit -m "feat(db): rooms repository"
```

---

### Task 12: User repository with discriminator retry

**Files:**
- Create: `packages/backend/src/db/users.ts`

- [ ] **Step 1: Implement `packages/backend/src/db/users.ts`**

```typescript
import type { DB } from "./supabase.js";
import type { AuthProvider } from "@chat-room/shared";
import { generateDiscriminator } from "../utils/discriminator.js";

export type UserRow = {
  id: string;
  auth_provider: AuthProvider;
  auth_subject: string;
  nickname: string;
  discriminator: string;
  created_at: string;
  updated_at: string;
};

const MAX_DISCRIMINATOR_RETRIES = 8;

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export class UsersRepo {
  constructor(private db: DB) {}

  async findByProviderSubject(
    provider: AuthProvider,
    subject: string,
  ): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from("users")
      .select("*")
      .eq("auth_provider", provider)
      .eq("auth_subject", subject)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findById(id: string): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Insert a user with a fresh discriminator. Retries on (nickname, discriminator)
   * uniqueness collisions up to MAX_DISCRIMINATOR_RETRIES times.
   */
  async createWithDiscriminator(input: {
    provider: AuthProvider;
    subject: string;
    nickname: string;
  }): Promise<UserRow> {
    let lastError: unknown;
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      const { data, error } = await this.db
        .from("users")
        .insert({
          auth_provider: input.provider,
          auth_subject: input.subject,
          nickname: input.nickname,
          discriminator,
        })
        .select("*")
        .single();
      if (!error && data) return data;
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
    throw new Error(
      `Failed to allocate discriminator after ${MAX_DISCRIMINATOR_RETRIES} attempts: ${String(lastError)}`,
    );
  }

  /**
   * Update nickname, retrying with new discriminator on (nickname, discriminator) collision.
   * Returns the updated row.
   */
  async renameWithDiscriminatorRetry(
    userId: string,
    newNickname: string,
  ): Promise<UserRow> {
    let lastError: unknown;
    // First try keeping the existing discriminator
    const current = await this.findById(userId);
    if (!current) throw new Error(`User ${userId} not found`);
    {
      const { data, error } = await this.db
        .from("users")
        .update({ nickname: newNickname, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select("*")
        .single();
      if (!error && data) return data;
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
    // Collision: retry with new discriminators
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      const { data, error } = await this.db
        .from("users")
        .update({
          nickname: newNickname,
          discriminator,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select("*")
        .single();
      if (!error && data) return data;
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
    throw new Error(
      `Failed to rename user after ${MAX_DISCRIMINATOR_RETRIES} attempts: ${String(lastError)}`,
    );
  }

  async listByRoomActivity(roomId: string, limit = 200): Promise<UserRow[]> {
    // Simplified: most-recently-active users in a room (by their latest message).
    // For MVP admin tooling only. Falls back to all users if room empty.
    const { data: msgUsers, error } = await this.db
      .from("messages")
      .select("user_id, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const ids = Array.from(new Set((msgUsers ?? []).map((m) => m.user_id)));
    if (ids.length === 0) return [];
    const { data: users, error: usersErr } = await this.db
      .from("users")
      .select("*")
      .in("id", ids);
    if (usersErr) throw usersErr;
    return users ?? [];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/users.ts
git commit -m "feat(db): users repository with discriminator-collision retry"
```

---

### Task 13: Message repository

**Files:**
- Create: `packages/backend/src/db/messages.ts`

- [ ] **Step 1: Implement `packages/backend/src/db/messages.ts`**

```typescript
import type { DB } from "./supabase.js";
import type { Message } from "@chat-room/shared";

export type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  author_nickname: string;
  author_discriminator: string;
  body: string;
  created_at: string;
};

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: {
      nickname: r.author_nickname,
      discriminator: r.author_discriminator,
    },
  };
}

export class MessagesRepo {
  constructor(private db: DB) {}

  async insert(input: {
    id: string;
    roomId: string;
    userId: string;
    authorNickname: string;
    authorDiscriminator: string;
    body: string;
    createdAt: string;
  }): Promise<void> {
    const { error } = await this.db.from("messages").insert({
      id: input.id,
      room_id: input.roomId,
      user_id: input.userId,
      author_nickname: input.authorNickname,
      author_discriminator: input.authorDiscriminator,
      body: input.body,
      created_at: input.createdAt,
    });
    if (error) throw error;
  }

  /**
   * Most recent `limit` messages in a room, returned in ascending time order.
   */
  async listRecent(roomId: string, limit = 50): Promise<Message[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data ?? []).reverse() as MessageRow[];
    return rows.map(rowToMessage);
  }

  /**
   * Messages strictly older than `beforeMessageId`, returned ascending. Used for
   * scroll-back pagination.
   */
  async listBefore(
    roomId: string,
    beforeMessageId: string,
    limit = 50,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const { data: pivot, error: pivotErr } = await this.db
      .from("messages")
      .select("created_at")
      .eq("id", beforeMessageId)
      .maybeSingle();
    if (pivotErr) throw pivotErr;
    if (!pivot) return { messages: [], hasMore: false };
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .lt("created_at", pivot.created_at)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;
    const rows = (data ?? []) as MessageRow[];
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    return {
      messages: sliced.reverse().map(rowToMessage),
      hasMore,
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/messages.ts
git commit -m "feat(db): messages repository with cursor pagination"
```

---

## Phase 5: Admin CLI

### Task 14: Admin CLI with room commands

**Files:**
- Create: `packages/backend/src/admin/cli.ts`

- [ ] **Step 1: Implement `packages/backend/src/admin/cli.ts`**

```typescript
#!/usr/bin/env node
import { cac } from "cac";
import readline from "node:readline";
import { loadConfig } from "../config.js";
import { createSupabaseClient } from "../db/supabase.js";
import { RoomsRepo } from "../db/rooms.js";
import { UsersRepo } from "../db/users.js";

const cli = cac("chat-room-admin");

function makeRepos() {
  const config = loadConfig();
  const db = createSupabaseClient(config);
  return {
    rooms: new RoomsRepo(db),
    users: new UsersRepo(db),
  };
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

cli
  .command("room create <name>", "Create a new room")
  .action(async (name: string) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (existing) {
      console.error(`Room "${name}" already exists.`);
      process.exit(1);
    }
    const room = await rooms.create(name);
    console.log(`✓ Created room "${room.name}" (id: ${room.id})`);
  });

cli
  .command("room list", "List all rooms")
  .action(async () => {
    const { rooms } = makeRepos();
    const list = await rooms.list();
    if (list.length === 0) {
      console.log("(no rooms)");
      return;
    }
    console.log("NAME".padEnd(24) + "ID".padEnd(40) + "CREATED");
    for (const r of list) {
      console.log(
        r.name.padEnd(24) +
          r.id.padEnd(40) +
          new Date(r.created_at).toISOString(),
      );
    }
  });

cli
  .command("room delete <name>", "Delete a room and all its messages")
  .option("-y, --yes", "Skip confirmation")
  .action(async (name: string, opts: { yes?: boolean }) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    if (!opts.yes) {
      const ok = await confirm(
        `This will delete room "${name}" and all its messages.`,
      );
      if (!ok) {
        console.log("Cancelled.");
        return;
      }
    }
    await rooms.deleteByName(name);
    console.log(`✓ Deleted room "${name}"`);
  });

cli
  .command("user list", "List users (by recent activity in a room)")
  .option("--room <name>", "Limit to users active in this room")
  .action(async (opts: { room?: string }) => {
    const { rooms, users } = makeRepos();
    if (!opts.room) {
      console.error("--room <name> is required for now.");
      process.exit(1);
    }
    const room = await rooms.findByName(opts.room);
    if (!room) {
      console.error(`Room "${opts.room}" not found.`);
      process.exit(1);
    }
    const list = await users.listByRoomActivity(room.id);
    if (list.length === 0) {
      console.log("(no users have messaged in this room)");
      return;
    }
    console.log(
      "NICKNAME".padEnd(20) +
        "DISC".padEnd(8) +
        "PROVIDER".padEnd(10) +
        "ID",
    );
    for (const u of list) {
      console.log(
        u.nickname.padEnd(20) +
          u.discriminator.padEnd(8) +
          u.auth_provider.padEnd(10) +
          u.id,
      );
    }
  });

cli.help();
cli.parse();

if (!cli.matchedCommand) {
  cli.outputHelp();
  process.exit(0);
}
```

- [ ] **Step 2: Manual verification**

Set up a `.env` in `packages/backend/` based on `.env.example`, filled with your Supabase project URL + service role key (other OAuth values can be empty strings — they're required by config, so put dummy values).

Run: `pnpm --filter @chat-room/backend admin room list`
Expected: `(no rooms)` on a fresh DB.

Run: `pnpm --filter @chat-room/backend admin room create lobby`
Expected: `✓ Created room "lobby" (id: ...)`

Run: `pnpm --filter @chat-room/backend admin room list`
Expected: shows the new row.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/admin/cli.ts
git commit -m "feat(admin): cli for room create/list/delete and user list"
```

---

## Phase 6: HTTP Server + OAuth

### Task 15: OAuth state store

**Files:**
- Create: `packages/backend/src/auth/state-store.ts`
- Create: `packages/backend/src/auth/state-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/auth/state-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OAuthStateStore } from "./state-store.js";

describe("OAuthStateStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("creates pending state and resolves it later", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    expect(typeof state).toBe("string");
    s.resolve(state, "tok-1");
    const result = s.consume(state);
    expect(result).toEqual({ status: "ready", token: "tok-1" });
  });

  it("consume returns pending until resolved", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    expect(s.consume(state)).toEqual({ status: "pending" });
  });

  it("expires after TTL", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(s.consume(state)).toEqual({ status: "not_found" });
  });

  it("clears after a successful consume", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    s.resolve(state, "tok-1");
    expect(s.consume(state)).toEqual({ status: "ready", token: "tok-1" });
    expect(s.consume(state)).toEqual({ status: "not_found" });
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/backend/src/auth/state-store.ts`**

```typescript
import { nanoid } from "nanoid";
import type { AuthProvider } from "@chat-room/shared";

const TTL_MS = 10 * 60 * 1000;

type Entry =
  | { status: "pending"; provider: AuthProvider; expiresAt: number }
  | { status: "ready"; token: string; expiresAt: number };

export type ConsumeResult =
  | { status: "ready"; token: string }
  | { status: "pending" }
  | { status: "not_found" };

export class OAuthStateStore {
  private entries = new Map<string, Entry>();

  createPending(provider: AuthProvider): string {
    const state = nanoid(32);
    this.entries.set(state, {
      status: "pending",
      provider,
      expiresAt: Date.now() + TTL_MS,
    });
    return state;
  }

  resolve(state: string, token: string): boolean {
    const entry = this.entries.get(state);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(state);
      return false;
    }
    this.entries.set(state, {
      status: "ready",
      token,
      expiresAt: Date.now() + TTL_MS,
    });
    return true;
  }

  consume(state: string): ConsumeResult {
    const entry = this.entries.get(state);
    if (!entry) return { status: "not_found" };
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(state);
      return { status: "not_found" };
    }
    if (entry.status === "pending") return { status: "pending" };
    this.entries.delete(state);
    return { status: "ready", token: entry.token };
  }

  getProvider(state: string): AuthProvider | null {
    const entry = this.entries.get(state);
    if (!entry || entry.status !== "pending") return null;
    return entry.provider;
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @chat-room/backend test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/auth/state-store.ts packages/backend/src/auth/state-store.test.ts
git commit -m "feat(auth): oauth state nonce store with TTL"
```

---

### Task 16: OAuth provider definitions

**Files:**
- Create: `packages/backend/src/auth/providers.ts`

- [ ] **Step 1: Implement `packages/backend/src/auth/providers.ts`**

```typescript
import type { AuthProvider } from "@chat-room/shared";
import type { Config } from "../config.js";

export type ProviderConfig = {
  name: Exclude<AuthProvider, "anon">;
  authorizeUrl: (params: { clientId: string; redirectUri: string; state: string; scope: string }) => string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  /**
   * Extract a stable subject and a display name from the provider's user-info response.
   */
  parseProfile: (raw: unknown) => { subject: string; nickname: string };
};

function qs(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

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
        scope: "read:user",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://github.com/login/oauth/authorize?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
          })}`,
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        parseProfile: (raw) => {
          const r = raw as { id: number; login: string; name?: string };
          return {
            subject: `github:${r.id}`,
            nickname: (r.name ?? r.login).slice(0, 20),
          };
        },
      };

    case "google":
      return {
        name: "google",
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        scope: "openid email profile",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://accounts.google.com/o/oauth2/v2/auth?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
            response_type: "code",
            access_type: "offline",
            prompt: "consent",
          })}`,
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        parseProfile: (raw) => {
          const r = raw as { sub: string; name?: string; email?: string };
          return {
            subject: `google:${r.sub}`,
            nickname: (r.name ?? r.email ?? "user").slice(0, 20),
          };
        },
      };

    case "discord":
      return {
        name: "discord",
        clientId: config.oauth.discord.clientId,
        clientSecret: config.oauth.discord.clientSecret,
        scope: "identify",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://discord.com/oauth2/authorize?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
            response_type: "code",
          })}`,
        tokenUrl: "https://discord.com/api/oauth2/token",
        userInfoUrl: "https://discord.com/api/users/@me",
        parseProfile: (raw) => {
          const r = raw as {
            id: string;
            username: string;
            global_name?: string;
          };
          return {
            subject: `discord:${r.id}`,
            nickname: (r.global_name ?? r.username).slice(0, 20),
          };
        },
      };
  }
}

export async function exchangeCodeForToken(
  cfg: ProviderConfig,
  redirectUri: string,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`Token exchange returned no access_token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

export async function fetchUserProfile(
  cfg: ProviderConfig,
  accessToken: string,
): Promise<{ subject: string; nickname: string }> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "chat-room-backend",
    },
  });
  if (!res.ok) {
    throw new Error(`Userinfo fetch failed (${res.status}): ${await res.text()}`);
  }
  const raw = (await res.json()) as unknown;
  return cfg.parseProfile(raw);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/auth/providers.ts
git commit -m "feat(auth): provider configs for github/google/discord"
```

---

### Task 17: OAuth Fastify routes

**Files:**
- Create: `packages/backend/src/auth/routes.ts`

- [ ] **Step 1: Implement `packages/backend/src/auth/routes.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { OAuthStateStore } from "./state-store.js";
import {
  getProviderConfig,
  exchangeCodeForToken,
  fetchUserProfile,
} from "./providers.js";
import { UsersRepo } from "../db/users.js";
import { signSessionToken } from "../utils/jwt.js";
import type { AuthProvider } from "@chat-room/shared";

export type AuthRoutesDeps = {
  config: Config;
  stateStore: OAuthStateStore;
  usersRepo: UsersRepo;
};

const ProviderParam = z.enum(["github", "google", "discord"]);

export async function registerAuthRoutes(
  app: FastifyInstance,
  { config, stateStore, usersRepo }: AuthRoutesDeps,
): Promise<void> {
  app.post<{ Body: { provider: AuthProvider } }>(
    "/auth/oauth/start",
    async (req, reply) => {
      const provider = ProviderParam.safeParse(
        (req.body as { provider?: string } | undefined)?.provider,
      );
      if (!provider.success) {
        return reply.code(400).send({ error: "invalid_provider" });
      }
      const state = stateStore.createPending(provider.data);
      const cfg = getProviderConfig(provider.data, config);
      const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
      const authUrl = cfg.authorizeUrl({
        clientId: cfg.clientId,
        redirectUri,
        state,
        scope: cfg.scope,
      });
      return reply.send({
        authUrl,
        pollUrl: `/auth/oauth/poll?state=${state}`,
        state,
      });
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/oauth/callback",
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.type("text/html").send(
          `<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`,
        );
      }
      if (!code || !state) {
        return reply
          .code(400)
          .type("text/html")
          .send("<h1>Missing code or state.</h1>");
      }
      const provider = stateStore.getProvider(state);
      if (!provider) {
        return reply
          .code(400)
          .type("text/html")
          .send("<h1>Authorization expired. Please try again.</h1>");
      }
      try {
        const cfg = getProviderConfig(provider, config);
        const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
        const accessToken = await exchangeCodeForToken(cfg, redirectUri, code);
        const profile = await fetchUserProfile(cfg, accessToken);
        let user = await usersRepo.findByProviderSubject(provider, profile.subject);
        if (!user) {
          user = await usersRepo.createWithDiscriminator({
            provider,
            subject: profile.subject,
            nickname: profile.nickname,
          });
        }
        const token = signSessionToken(
          { userId: user.id, provider },
          config.jwtSigningKey,
        );
        stateStore.resolve(state, token);
        return reply
          .type("text/html")
          .send("<h1>Signed in!</h1><p>You can close this tab.</p>");
      } catch (err) {
        logger.error({ err }, "oauth callback failed");
        return reply
          .code(500)
          .type("text/html")
          .send("<h1>Sign-in failed</h1><p>Please try again.</p>");
      }
    },
  );

  app.get<{ Querystring: { state?: string } }>(
    "/auth/oauth/poll",
    async (req, reply) => {
      const { state } = req.query;
      if (!state) return reply.code(400).send({ error: "missing_state" });
      const result = stateStore.consume(state);
      if (result.status === "ready") {
        return reply.send({ status: "ready", token: result.token });
      }
      if (result.status === "pending") {
        return reply.send({ status: "pending" });
      }
      return reply.code(404).send({ status: "not_found" });
    },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default:  return "&#39;";
    }
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/auth/routes.ts
git commit -m "feat(auth): fastify routes for oauth start/callback/poll"
```

---

## Phase 7: WebSocket Server

### Task 18: WebSocket connection registry

**Files:**
- Create: `packages/backend/src/ws/connection-registry.ts`
- Create: `packages/backend/src/ws/connection-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/ws/connection-registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";

function fakeConn(id: string, userId: string, roomId: string): AuthedConnection {
  return {
    id,
    userId,
    roomId,
    nickname: "n",
    discriminator: "abcd",
    sendRaw: () => {},
    close: () => {},
  };
}

describe("ConnectionRegistry", () => {
  it("adds and lists by room", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    const b = fakeConn("c2", "u2", "r1");
    r.add(a);
    r.add(b);
    expect(new Set(r.listByRoom("r1").map((c) => c.id))).toEqual(new Set(["c1", "c2"]));
  });

  it("removes a connection", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    r.add(a);
    r.remove(a);
    expect(r.listByRoom("r1")).toEqual([]);
  });

  it("renaming reflects in listByRoom", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    r.add(a);
    r.rename("c1", "newnick", "wxyz");
    const got = r.listByRoom("r1");
    expect(got[0]?.nickname).toBe("newnick");
    expect(got[0]?.discriminator).toBe("wxyz");
  });

  it("listByRoom returns empty for unknown room", () => {
    const r = new ConnectionRegistry();
    expect(r.listByRoom("nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chat-room/backend test`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/backend/src/ws/connection-registry.ts`**

```typescript
export type AuthedConnection = {
  id: string;
  userId: string;
  roomId: string;
  nickname: string;
  discriminator: string;
  sendRaw: (text: string) => void;
  close: (code?: number, reason?: string) => void;
};

export class ConnectionRegistry {
  private byId = new Map<string, AuthedConnection>();
  private byRoom = new Map<string, Set<string>>();

  add(conn: AuthedConnection): void {
    this.byId.set(conn.id, conn);
    let set = this.byRoom.get(conn.roomId);
    if (!set) {
      set = new Set();
      this.byRoom.set(conn.roomId, set);
    }
    set.add(conn.id);
  }

  remove(conn: AuthedConnection): void {
    this.byId.delete(conn.id);
    const set = this.byRoom.get(conn.roomId);
    if (!set) return;
    set.delete(conn.id);
    if (set.size === 0) this.byRoom.delete(conn.roomId);
  }

  get(id: string): AuthedConnection | undefined {
    return this.byId.get(id);
  }

  listByRoom(roomId: string): AuthedConnection[] {
    const set = this.byRoom.get(roomId);
    if (!set) return [];
    const out: AuthedConnection[] = [];
    for (const id of set) {
      const c = this.byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  rename(connectionId: string, nickname: string, discriminator: string): void {
    const c = this.byId.get(connectionId);
    if (!c) return;
    c.nickname = nickname;
    c.discriminator = discriminator;
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @chat-room/backend test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ws/connection-registry.ts packages/backend/src/ws/connection-registry.test.ts
git commit -m "feat(ws): connection registry with room indexing"
```

---

### Task 19: Broadcast helper

**Files:**
- Create: `packages/backend/src/ws/broadcast.ts`

- [ ] **Step 1: Implement `packages/backend/src/ws/broadcast.ts`**

```typescript
import type { ServerMessage } from "@chat-room/shared";
import type { ConnectionRegistry, AuthedConnection } from "./connection-registry.js";

function serialize(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function send(conn: AuthedConnection, msg: ServerMessage): void {
  conn.sendRaw(serialize(msg));
}

export function broadcastToRoom(
  registry: ConnectionRegistry,
  roomId: string,
  msg: ServerMessage,
  exclude?: AuthedConnection,
): void {
  const text = serialize(msg);
  for (const c of registry.listByRoom(roomId)) {
    if (exclude && c.id === exclude.id) continue;
    c.sendRaw(text);
  }
}

export function presenceFor(
  registry: ConnectionRegistry,
  roomId: string,
): { nickname: string; discriminator: string }[] {
  const seen = new Set<string>();
  const out: { nickname: string; discriminator: string }[] = [];
  for (const c of registry.listByRoom(roomId)) {
    const key = `${c.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nickname: c.nickname, discriminator: c.discriminator });
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/ws/broadcast.ts
git commit -m "feat(ws): broadcast + presence helpers"
```

---

### Task 20: Auth handler (anonymous + oauth)

**Files:**
- Create: `packages/backend/src/ws/handlers/auth.ts`

- [ ] **Step 1: Implement `packages/backend/src/ws/handlers/auth.ts`**

```typescript
import { randomUUID } from "node:crypto";
import type { ServerMessage, AuthAnon, AuthOAuth } from "@chat-room/shared";

import type { Config } from "../../config.js";
import { logger } from "../../logger.js";
import { validateNickname } from "../../utils/nickname.js";
import { verifySessionToken } from "../../utils/jwt.js";
import type { RoomsRepo } from "../../db/rooms.js";
import type { UsersRepo } from "../../db/users.js";
import type { MessagesRepo } from "../../db/messages.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "../broadcast.js";

export type AuthDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export type AuthResolution =
  | { ok: true; conn: AuthedConnection }
  | { ok: false; reason: "room_not_found" | "invalid_token" | "nickname_invalid" };

async function resolveRoomOrError(
  rooms: RoomsRepo,
  roomName: string,
): Promise<{ ok: true; roomId: string } | { ok: false }> {
  const room = await rooms.findByName(roomName);
  if (!room) return { ok: false };
  return { ok: true, roomId: room.id };
}

export async function handleAnonAuth(
  raw: AuthAnon,
  pending: { id: string; sendRaw: (s: string) => void; close: () => void },
  deps: AuthDeps,
): Promise<AuthResolution> {
  const room = await resolveRoomOrError(deps.rooms, raw.roomName);
  if (!room.ok) return { ok: false, reason: "room_not_found" };

  const nickResult = validateNickname(raw.nickname);
  if (!nickResult.ok) return { ok: false, reason: "nickname_invalid" };

  const user = await deps.users.createWithDiscriminator({
    provider: "anon",
    subject: `anon:${randomUUID()}`,
    nickname: nickResult.value,
  });
  const conn: AuthedConnection = {
    id: pending.id,
    userId: user.id,
    roomId: room.roomId,
    nickname: user.nickname,
    discriminator: user.discriminator,
    sendRaw: pending.sendRaw,
    close: pending.close,
  };
  return { ok: true, conn };
}

export async function handleOAuthAuth(
  raw: AuthOAuth,
  pending: { id: string; sendRaw: (s: string) => void; close: () => void },
  deps: AuthDeps,
): Promise<AuthResolution> {
  const room = await resolveRoomOrError(deps.rooms, raw.roomName);
  if (!room.ok) return { ok: false, reason: "room_not_found" };

  let payload: { userId: string; provider: string };
  try {
    payload = verifySessionToken(raw.token, deps.config.jwtSigningKey);
  } catch (err) {
    logger.warn({ err }, "oauth jwt verify failed");
    return { ok: false, reason: "invalid_token" };
  }

  const user = await deps.users.findById(payload.userId);
  if (!user) return { ok: false, reason: "invalid_token" };

  const conn: AuthedConnection = {
    id: pending.id,
    userId: user.id,
    roomId: room.roomId,
    nickname: user.nickname,
    discriminator: user.discriminator,
    sendRaw: pending.sendRaw,
    close: pending.close,
  };
  return { ok: true, conn };
}

export async function admitConnection(
  conn: AuthedConnection,
  deps: AuthDeps,
  roomName: string,
): Promise<void> {
  deps.registry.add(conn);
  const okMsg: ServerMessage = {
    type: "auth.ok",
    user: {
      id: conn.userId,
      nickname: conn.nickname,
      discriminator: conn.discriminator,
    },
  };
  send(conn, okMsg);

  const recent = await deps.messages.listRecent(conn.roomId, 50);
  const snapshot: ServerMessage = {
    type: "room.snapshot",
    room: { id: conn.roomId, name: roomName },
    messages: recent,
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  send(conn, snapshot);

  const joinNotice: ServerMessage = {
    type: "system",
    event: "join",
    body: `${conn.nickname}#${conn.discriminator} joined`,
  };
  broadcastToRoom(deps.registry, conn.roomId, joinNotice, conn);

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/ws/handlers/auth.ts
git commit -m "feat(ws): auth handlers (anon + oauth) and admit flow"
```

---

### Task 21: Send / Nick / History handlers

**Files:**
- Create: `packages/backend/src/ws/handlers/send.ts`
- Create: `packages/backend/src/ws/handlers/nick.ts`
- Create: `packages/backend/src/ws/handlers/history.ts`

- [ ] **Step 1: Create `packages/backend/src/ws/handlers/send.ts`**

```typescript
import { randomUUID } from "node:crypto";
import type { ServerMessage, Message, MessageSend } from "@chat-room/shared";
import type { MessagesRepo } from "../../db/messages.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, send } from "../broadcast.js";
import { logger } from "../../logger.js";

export type SendDeps = {
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export async function handleSend(
  conn: AuthedConnection,
  raw: MessageSend,
  deps: SendDeps,
): Promise<void> {
  const message: Message = {
    id: randomUUID(),
    body: raw.body,
    createdAt: new Date().toISOString(),
    author: { nickname: conn.nickname, discriminator: conn.discriminator },
  };
  const out: ServerMessage = { type: "message", data: message };
  broadcastToRoom(deps.registry, conn.roomId, out);

  // Persist with retry; failure only reported to sender
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await deps.messages.insert({
        id: message.id,
        roomId: conn.roomId,
        userId: conn.userId,
        authorNickname: conn.nickname,
        authorDiscriminator: conn.discriminator,
        body: message.body,
        createdAt: message.createdAt,
      });
      return;
    } catch (err) {
      lastErr = err;
      logger.warn({ err, attempt }, "message insert failed; retrying");
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  logger.error({ err: lastErr, messageId: message.id }, "message insert gave up");
  const errMsg: ServerMessage = {
    type: "error",
    code: "persist_failed",
    message: "Message could not be saved (broadcast succeeded).",
  };
  send(conn, errMsg);
}
```

- [ ] **Step 2: Create `packages/backend/src/ws/handlers/nick.ts`**

```typescript
import type { ServerMessage, NickChange } from "@chat-room/shared";
import { validateNickname } from "../../utils/nickname.js";
import type { UsersRepo } from "../../db/users.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "../broadcast.js";

export type NickDeps = {
  users: UsersRepo;
  registry: ConnectionRegistry;
};

export async function handleNick(
  conn: AuthedConnection,
  raw: NickChange,
  deps: NickDeps,
): Promise<void> {
  const result = validateNickname(raw.newNickname);
  if (!result.ok) {
    const err: ServerMessage = {
      type: "error",
      code: "nickname_invalid",
      message: result.error,
    };
    send(conn, err);
    return;
  }
  if (result.value === conn.nickname) return;

  const oldLabel = `${conn.nickname}#${conn.discriminator}`;
  const updated = await deps.users.renameWithDiscriminatorRetry(conn.userId, result.value);
  deps.registry.rename(conn.id, updated.nickname, updated.discriminator);

  const newLabel = `${updated.nickname}#${updated.discriminator}`;
  const sys: ServerMessage = {
    type: "system",
    event: "rename",
    body: `${oldLabel} → ${newLabel}`,
  };
  broadcastToRoom(deps.registry, conn.roomId, sys);

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);
}
```

- [ ] **Step 3: Create `packages/backend/src/ws/handlers/history.ts`**

```typescript
import type { ServerMessage, HistoryLoad } from "@chat-room/shared";
import type { MessagesRepo } from "../../db/messages.js";
import type { AuthedConnection } from "../connection-registry.js";
import { send } from "../broadcast.js";

export type HistoryDeps = {
  messages: MessagesRepo;
};

export async function handleHistory(
  conn: AuthedConnection,
  raw: HistoryLoad,
  deps: HistoryDeps,
): Promise<void> {
  const { messages, hasMore } = await deps.messages.listBefore(
    conn.roomId,
    raw.beforeId,
    raw.limit,
  );
  const out: ServerMessage = { type: "history", messages, hasMore };
  send(conn, out);
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ws/handlers
git commit -m "feat(ws): handlers for message.send, nick.change, history.load"
```

---

### Task 22: WebSocket server wiring + HTTP boot

**Files:**
- Create: `packages/backend/src/ws/server.ts`
- Create: `packages/backend/src/server.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create `packages/backend/src/ws/server.ts`**

```typescript
import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HTTPServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ClientMessageSchema, type ServerMessage } from "@chat-room/shared";

import type { Config } from "../config.js";
import { logger } from "../logger.js";
import type { RoomsRepo } from "../db/rooms.js";
import type { UsersRepo } from "../db/users.js";
import type { MessagesRepo } from "../db/messages.js";

import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "./broadcast.js";
import {
  handleAnonAuth,
  handleOAuthAuth,
  admitConnection,
} from "./handlers/auth.js";
import { handleSend } from "./handlers/send.js";
import { handleNick } from "./handlers/nick.js";
import { handleHistory } from "./handlers/history.js";

const AUTH_TIMEOUT_MS = 5000;

export type WsServerDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export function attachWebSocketServer(
  httpServer: HTTPServer,
  deps: WsServerDeps,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const connId = randomUUID();
    const sendRaw = (text: string) => {
      if (ws.readyState === ws.OPEN) ws.send(text);
    };
    const sendMsg = (m: ServerMessage) => sendRaw(JSON.stringify(m));
    const close = (code = 1000, reason = "") => ws.close(code, reason);

    let authed: AuthedConnection | null = null;
    let authedRoomName: string | null = null;

    const authTimer = setTimeout(() => {
      if (!authed) {
        logger.info({ connId }, "auth timeout; closing");
        try {
          sendMsg({ type: "auth.error", reason: "invalid_token" });
        } catch {}
        close(4001, "auth_timeout");
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("message", async (data) => {
      let parsed;
      try {
        parsed = ClientMessageSchema.parse(JSON.parse(data.toString()));
      } catch (err) {
        logger.warn({ err, connId }, "bad client message");
        sendMsg({ type: "error", code: "bad_request" });
        close(4000, "bad_request");
        return;
      }

      try {
        if (!authed) {
          if (parsed.type !== "auth.anon" && parsed.type !== "auth.oauth") {
            sendMsg({ type: "error", code: "not_authenticated" });
            close(4001, "not_authenticated");
            return;
          }
          const pending = { id: connId, sendRaw, close };
          const result =
            parsed.type === "auth.anon"
              ? await handleAnonAuth(parsed, pending, deps)
              : await handleOAuthAuth(parsed, pending, deps);
          if (!result.ok) {
            sendMsg({ type: "auth.error", reason: result.reason });
            close(4002, result.reason);
            return;
          }
          authed = result.conn;
          authedRoomName = parsed.roomName;
          clearTimeout(authTimer);
          await admitConnection(authed, deps, authedRoomName);
          return;
        }

        switch (parsed.type) {
          case "message.send":
            await handleSend(authed, parsed, deps);
            break;
          case "nick.change":
            await handleNick(authed, parsed, deps);
            break;
          case "history.load":
            await handleHistory(authed, parsed, deps);
            break;
          case "auth.anon":
          case "auth.oauth":
            sendMsg({ type: "error", code: "already_authenticated" });
            break;
        }
      } catch (err) {
        logger.error({ err, connId }, "handler crashed");
        sendMsg({ type: "error", code: "internal" });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!authed) return;
      deps.registry.remove(authed);
      const leaveLabel = `${authed.nickname}#${authed.discriminator} left`;
      broadcastToRoom(deps.registry, authed.roomId, {
        type: "system",
        event: "leave",
        body: leaveLabel,
      });
      broadcastToRoom(deps.registry, authed.roomId, {
        type: "presence",
        onlineUsers: presenceFor(deps.registry, authed.roomId),
      });
    });

    ws.on("error", (err) => {
      logger.warn({ err, connId }, "ws error");
    });
  });

  return wss;
}
```

- [ ] **Step 2: Create `packages/backend/src/server.ts`**

```typescript
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createSupabaseClient } from "./db/supabase.js";
import { RoomsRepo } from "./db/rooms.js";
import { UsersRepo } from "./db/users.js";
import { MessagesRepo } from "./db/messages.js";
import { OAuthStateStore } from "./auth/state-store.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { ConnectionRegistry } from "./ws/connection-registry.js";
import { attachWebSocketServer } from "./ws/server.js";

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const db = createSupabaseClient(config);

  const rooms = new RoomsRepo(db);
  const users = new UsersRepo(db);
  const messages = new MessagesRepo(db);
  const stateStore = new OAuthStateStore();
  const registry = new ConnectionRegistry();

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app, { config, stateStore, usersRepo: users });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  attachWebSocketServer(app.server, { config, rooms, users, messages, registry });

  logger.info({ port: config.port }, "backend listening");
}
```

- [ ] **Step 3: Replace `packages/backend/src/index.ts`**

```typescript
import { startServer } from "./server.js";
import { logger } from "./logger.js";

startServer().catch((err) => {
  logger.fatal({ err }, "failed to start server");
  process.exit(1);
});
```

- [ ] **Step 4: Build + boot smoke**

Run: `pnpm --filter @chat-room/backend typecheck`
Expected: no errors.

Make sure `.env` is populated (at minimum: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_BACKEND_URL=http://localhost:8080`, a 32+ char `JWT_SIGNING_KEY`, and dummy OAuth secrets).

Run: `pnpm --filter @chat-room/backend dev`
Expected: log line `backend listening { port: 8080 }`. `curl http://localhost:8080/health` returns `{"ok":true}`.

Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ws/server.ts packages/backend/src/server.ts packages/backend/src/index.ts
git commit -m "feat(backend): wire HTTP + WebSocket server"
```

---

## Phase 8: Integration Test

### Task 23: End-to-end WebSocket flow test

**Files:**
- Create: `packages/backend/src/__tests__/integration/flow.test.ts`

**Note:** This test boots the real server against a real Supabase project, creates a uniquely-named room, runs two WS clients through the full join/send/rename/leave flow, then cleans up. It is the most valuable test in the codebase — when it passes, the whole backend is correct.

- [ ] **Step 1: Add a `ws` client helper inside the test file**

Create `packages/backend/src/__tests__/integration/flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { loadConfig } from "../../config.js";
import { createSupabaseClient } from "../../db/supabase.js";
import { RoomsRepo } from "../../db/rooms.js";
import { UsersRepo } from "../../db/users.js";
import { MessagesRepo } from "../../db/messages.js";
import { ConnectionRegistry } from "../../ws/connection-registry.js";
import { attachWebSocketServer } from "../../ws/server.js";
import { OAuthStateStore } from "../../auth/state-store.js";
import { registerAuthRoutes } from "../../auth/routes.js";
import type { ServerMessage } from "@chat-room/shared";

function next<T extends ServerMessage["type"]>(
  ws: WebSocket,
  type: T,
  timeoutMs = 4000,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === type) {
          ws.off("message", onMsg);
          clearTimeout(t);
          resolve(msg as Extract<ServerMessage, { type: T }>);
        }
      } catch {
        // ignore
      }
    };
    ws.on("message", onMsg);
  });
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("backend integration flow", () => {
  const roomName = `it-${randomUUID().slice(0, 8)}`;
  let baseUrl = "";
  let wsUrl = "";
  let app: ReturnType<typeof Fastify>;
  let rooms: RoomsRepo;

  beforeAll(async () => {
    const config = loadConfig();
    const db = createSupabaseClient(config);
    rooms = new RoomsRepo(db);
    const users = new UsersRepo(db);
    const messages = new MessagesRepo(db);
    const stateStore = new OAuthStateStore();
    const registry = new ConnectionRegistry();

    app = Fastify({ logger: false });
    app.get("/health", async () => ({ ok: true }));
    await registerAuthRoutes(app, { config, stateStore, usersRepo: users });
    // bind to ephemeral port
    await app.listen({ port: 0, host: "127.0.0.1" });
    attachWebSocketServer(app.server, { config, rooms, users, messages, registry });
    const addr = app.server.address();
    if (typeof addr !== "object" || !addr) throw new Error("no addr");
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
    await rooms.create(roomName);
  });

  afterAll(async () => {
    if (rooms) await rooms.deleteByName(roomName).catch(() => {});
    if (app) await app.close();
  });

  it("two anonymous users can join, exchange messages, and rename", async () => {
    const alice = await connect(wsUrl);
    alice.send(JSON.stringify({ type: "auth.anon", nickname: "Alice", roomName }));
    const aliceOk = await next(alice, "auth.ok");
    expect(aliceOk.user.nickname).toBe("Alice");
    await next(alice, "room.snapshot");

    const bob = await connect(wsUrl);
    bob.send(JSON.stringify({ type: "auth.anon", nickname: "Bob", roomName }));
    await next(bob, "auth.ok");
    await next(bob, "room.snapshot");

    // Alice should have seen a join from Bob
    await next(alice, "system");

    // Alice sends a message; Bob should receive it
    alice.send(JSON.stringify({ type: "message.send", body: "hello" }));
    const received = await next(bob, "message");
    expect(received.data.body).toBe("hello");
    expect(received.data.author.nickname).toBe("Alice");

    // Alice renames; Bob should see a system message and a presence update
    alice.send(JSON.stringify({ type: "nick.change", newNickname: "Alicia" }));
    const sys = await next(bob, "system");
    expect(sys.body).toMatch(/Alice/);
    expect(sys.body).toMatch(/Alicia/);
    await next(bob, "presence");

    alice.close();
    bob.close();
  });

  it("rejects join to non-existent room", async () => {
    const ws = await connect(wsUrl);
    ws.send(
      JSON.stringify({ type: "auth.anon", nickname: "Ghost", roomName: "does-not-exist" }),
    );
    const err = await next(ws, "auth.error");
    expect(err.reason).toBe("room_not_found");
  });
});
```

- [ ] **Step 2: Ensure `.env` is loaded for tests**

Add to `packages/backend/vitest.config.ts` an env loader. Replace its content with:

```typescript
import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
```

Add `dotenv` to dev deps in `packages/backend/package.json`:

```json
"devDependencies": {
  "@types/jsonwebtoken": "^9.0.6",
  "@types/node": "^20.14.0",
  "@types/ws": "^8.5.10",
  "dotenv": "^16.4.5",
  "tsx": "^4.16.0",
  "typescript": "^5.5.0",
  "vitest": "^2.0.0"
}
```

Run: `pnpm install`
Expected: dotenv installed.

- [ ] **Step 3: Run the integration test**

Run: `pnpm --filter @chat-room/backend test`
Expected: all tests pass (unit + integration).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/__tests__ packages/backend/vitest.config.ts packages/backend/package.json
git commit -m "test(backend): end-to-end ws flow integration test"
```

---

## Done — Plan A Exit Criteria

After Task 23, you should have:

- A pnpm monorepo with `shared` and `backend` packages.
- A backend that starts on `pnpm dev:backend` and:
  - Serves `GET /health` returning `{ok:true}`.
  - Serves `POST /auth/oauth/start`, `GET /auth/oauth/callback`, `GET /auth/oauth/poll`.
  - Accepts WebSocket connections at `/ws` and runs the full chat flow.
- An admin CLI (`pnpm admin room create/list/delete`, `pnpm admin user list --room`) that operates on the live Supabase DB.
- Unit tests covering: config, discriminator, nickname, JWT, oauth state store, connection registry.
- One integration test exercising the full WebSocket flow against the real database.

**What's NOT in Plan A:**
- TUI client (Plan B).
- Dockerfile / GCP / npm publish (Plan C).
- OAuth has working endpoints but is not yet exercised end-to-end with a real provider (it needs the client to test the local-callback flow; you can manually hit `/auth/oauth/start` with curl to see the redirect URL).

Once this plan is green, hand off to Plan B.
