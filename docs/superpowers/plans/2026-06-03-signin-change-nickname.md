# Signin Change Nickname Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let returning anonymous users choose to keep or change their nickname during sign-in, before entering the chat room.

**Architecture:** Add an `identity_confirm` screen between `IdentitySelect` and `chat`. When a returning anon user selects "Anonymous", they land on a new `IdentityConfirm` screen that asks "Continue as {name}" or "Change nickname". The existing `NicknameInput` screen handles the rename path unchanged.

**Tech Stack:** React, Ink, ink-select-input, Zustand, Vitest + ink-testing-library

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/client/src/store.ts` |
| Modify | `packages/client/src/app.tsx` |
| Modify | `packages/client/src/screens/IdentitySelect.tsx` |
| Modify | `packages/client/src/screens/IdentitySelect.test.tsx` |
| Create | `packages/client/src/screens/IdentityConfirm.tsx` |
| Create | `packages/client/src/screens/IdentityConfirm.test.tsx` |

---

## Task 1: Extend the `Screen` union

**Files:**
- Modify: `packages/client/src/store.ts:15-24`

- [ ] **Step 1: Add `"identity_confirm"` to the `Screen` union**

In `packages/client/src/store.ts`, change:

```ts
export type Screen =
  | "room_input"
  | "identity_select"
  | "nickname_input"
  | "oauth_waiting"
  | "chat"
  | "admin_oauth"
  | "admin_menu"
  | "map_view"
  | "error";
```

to:

```ts
export type Screen =
  | "room_input"
  | "identity_select"
  | "identity_confirm"
  | "nickname_input"
  | "oauth_waiting"
  | "chat"
  | "admin_oauth"
  | "admin_menu"
  | "map_view"
  | "error";
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter @lathyrus-odoratus/pantry typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add packages/client/src/store.ts
git commit -m "feat(client): add identity_confirm to Screen union"
```

---

## Task 2: Write failing tests for `IdentityConfirm`

**Files:**
- Create: `packages/client/src/screens/IdentityConfirm.test.tsx`
- Modify: `packages/client/src/screens/IdentitySelect.test.tsx:48-60`

- [ ] **Step 1: Create `IdentityConfirm.test.tsx`**

Create `packages/client/src/screens/IdentityConfirm.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { loadAnon } from "../auth/anon.js";
import { IdentityConfirm } from "./IdentityConfirm.js";

vi.mock("../auth/anon.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/anon.js")>()),
  loadAnon: vi.fn(),
}));
const mockLoadAnon = vi.mocked(loadAnon);

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("IdentityConfirm", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    useStore.getState().setScreen("identity_confirm");
    mockLoadAnon.mockReset();
  });

  it("renders room name and saved nickname", async () => {
    mockLoadAnon.mockResolvedValue({ subject: "anon:test", nickname: "JessM" });
    const { lastFrame } = render(<IdentityConfirm />);
    await flush();
    expect(lastFrame()).toContain("lobby");
    expect(lastFrame()).toContain("JessM");
  });

  it("selecting Continue sets pending identity and advances to chat", async () => {
    mockLoadAnon.mockResolvedValue({ subject: "anon:uuid-123", nickname: "JessM" });
    const { stdin } = render(<IdentityConfirm />);
    await flush();
    stdin.write("\r"); // first option (Continue) is preselected
    await flush();
    expect(useStore.getState().screen).toBe("chat");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("anon");
    if (id?.kind === "anon") {
      expect(id.nickname).toBe("JessM");
      expect(id.subject).toBe("anon:uuid-123");
    }
  });

  it("selecting Change nickname advances to nickname_input without setting pending", async () => {
    mockLoadAnon.mockResolvedValue({ subject: "anon:uuid-123", nickname: "JessM" });
    const { stdin } = render(<IdentityConfirm />);
    await flush();
    stdin.write("\x1b[B"); // down arrow
    await flush();
    stdin.write("\r");
    await flush();
    expect(useStore.getState().screen).toBe("nickname_input");
    expect(useStore.getState().pendingIdentity).toBeNull();
  });

  it("falls back to nickname_input when loadAnon returns null", async () => {
    mockLoadAnon.mockResolvedValue(null);
    render(<IdentityConfirm />);
    await flush();
    expect(useStore.getState().screen).toBe("nickname_input");
  });
});
```

- [ ] **Step 2: Update the stale test in `IdentitySelect.test.tsx`**

The test `"selecting Anonymous with a saved identity continues straight to chat"` (line 48) describes the old behaviour. Update it to match the new routing — saved anon now routes to `identity_confirm`, not straight to `chat`:

```ts
it("selecting Anonymous with a saved identity advances to identity_confirm", async () => {
  mockLoadAnon.mockResolvedValue({ subject: "anon:test-uuid", nickname: "Saved" });
  const { stdin } = render(<IdentitySelect />);
  await flush();
  stdin.write("\r");
  await flush();
  expect(useStore.getState().screen).toBe("identity_confirm");
  expect(useStore.getState().pendingIdentity).toBeNull();
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```
pnpm --filter @lathyrus-odoratus/pantry test
```

Expected: `IdentityConfirm.test.tsx` fails (module not found), and the updated `IdentitySelect` test may also fail until Task 3 is complete.

---

## Task 3: Implement `IdentityConfirm.tsx`

**Files:**
- Create: `packages/client/src/screens/IdentityConfirm.tsx`

- [ ] **Step 1: Create the component**

Create `packages/client/src/screens/IdentityConfirm.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useStore } from "../store.js";
import { loadAnon, type AnonIdentity } from "../auth/anon.js";

export function IdentityConfirm(): React.JSX.Element {
  const roomName = useStore((s) => s.roomName);
  const setScreen = useStore((s) => s.setScreen);
  const setPending = useStore((s) => s.setPendingIdentity);
  const [saved, setSaved] = useState<AnonIdentity | null>(null);

  useEffect(() => {
    void loadAnon().then((identity) => {
      if (!identity) {
        setScreen("nickname_input");
        return;
      }
      setSaved(identity);
    });
  }, []);

  if (!saved) return <Box />;

  const items = [
    { label: `Continue as ${saved.nickname}`, value: "continue" as const },
    { label: "Change nickname", value: "change" as const },
  ];

  const onSelect = (item: { value: "continue" | "change" }) => {
    if (item.value === "continue") {
      setPending({ kind: "anon", nickname: saved.nickname, subject: saved.subject });
      setScreen("chat");
    } else {
      setScreen("nickname_input");
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Room: <Text bold>{roomName}</Text></Text>
      </Box>
      <Box marginBottom={1}>
        <Text>Continue as {saved.nickname}, or change nickname?</Text>
      </Box>
      <SelectInput items={items} onSelect={onSelect} />
    </Box>
  );
}
```

- [ ] **Step 2: Run `IdentityConfirm` tests**

```
pnpm --filter @lathyrus-odoratus/pantry test -- src/screens/IdentityConfirm.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```
git add packages/client/src/screens/IdentityConfirm.tsx packages/client/src/screens/IdentityConfirm.test.tsx
git commit -m "feat(client): add IdentityConfirm screen"
```

---

## Task 4: Update `IdentitySelect` routing + wire `app.tsx`

**Files:**
- Modify: `packages/client/src/screens/IdentitySelect.tsx:31-45`
- Modify: `packages/client/src/app.tsx`

- [ ] **Step 1: Update `IdentitySelect.tsx` — saved anon branch**

In `packages/client/src/screens/IdentitySelect.tsx`, change the `onSelect` function's anon branch from:

```ts
const onSelect = (item: { value: ItemValue }) => {
  if (item.value === "anon") {
    if (saved) {
      setPending({
        kind: "anon",
        nickname: saved.nickname,
        subject: saved.subject,
      });
      setScreen("chat");
      return;
    }
    setPending(null);
    setScreen("nickname_input");
    return;
  }
```

to:

```ts
const onSelect = (item: { value: ItemValue }) => {
  if (item.value === "anon") {
    if (saved) {
      setScreen("identity_confirm");
      return;
    }
    setPending(null);
    setScreen("nickname_input");
    return;
  }
```

Also remove the now-unused `setPending` import line if TypeScript flags it, but `setPending` is still referenced for the OAuth path so it stays.

- [ ] **Step 2: Add `identity_confirm` case to `app.tsx`**

In `packages/client/src/app.tsx`, add the import and case:

```ts
import { IdentityConfirm } from "./screens/IdentityConfirm.js";
```

Add to the switch (after the `identity_select` case):

```ts
case "identity_confirm":
  return <IdentityConfirm />;
```

The full switch block after the change:

```ts
switch (screen) {
  case "room_input":
    return <RoomInput />;
  case "identity_select":
    return <IdentitySelect />;
  case "identity_confirm":
    return <IdentityConfirm />;
  case "nickname_input":
    return <NicknameInput />;
  case "oauth_waiting":
    return <OAuthWaiting backendHttpUrl={config.backendHttpUrl} />;
  case "chat":
    return (
      <>
        <Chat serverUrl={config.serverUrl} />
        {cabombView ? <CabombOverlay /> : null}
      </>
    );
  case "admin_oauth":
    return <AdminOAuthWaiting backendHttpUrl={config.backendHttpUrl} />;
  case "admin_menu":
    return <AdminMenu serverUrl={config.serverUrl} />;
  case "map_view":
    return <MapView />;
  case "error":
    return <ErrorScreen />;
}
```

- [ ] **Step 3: Run full test suite**

```
pnpm --filter @lathyrus-odoratus/pantry test
```

Expected: all tests pass, including the updated `IdentitySelect` test.

- [ ] **Step 4: Typecheck**

```
pnpm --filter @lathyrus-odoratus/pantry typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add packages/client/src/screens/IdentitySelect.tsx packages/client/src/screens/IdentitySelect.test.tsx packages/client/src/app.tsx
git commit -m "feat(client): route returning anon users through identity_confirm screen"
```
