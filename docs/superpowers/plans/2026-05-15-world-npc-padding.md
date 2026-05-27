# World NPC Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one blank line before and after every NPC message in the chat UI so narration visually breathes.

**Architecture:** Single-file change in the Ink TUI client. `MessageRow` already detects NPC messages via `isNpc`; we add `marginTop={1} marginBottom={1}` to its `<Box>` when that flag is true. No backend, protocol, or store changes needed.

**Tech Stack:** React (Ink), TypeScript, pnpm workspace

---

### Task 1: Add margin to NPC MessageRow

**Files:**
- Modify: `packages/client/src/screens/Chat.tsx:64-73`

- [ ] **Step 1: Open the file and locate MessageRow's return for non-sys messages**

  In `Chat.tsx`, around line 64, the non-sys branch returns:

  ```tsx
  return (
    <Box>
      {prefixEmoji ? <Text>{prefixEmoji} </Text> : null}
      <Text color={color} bold>
        {label}
      </Text>
      <Text dimColor>: </Text>
      <Text>{m.body}</Text>
    </Box>
  );
  ```

- [ ] **Step 2: Add `marginTop` and `marginBottom` to the Box**

  Replace the return above with:

  ```tsx
  return (
    <Box marginTop={isNpc ? 1 : 0} marginBottom={isNpc ? 1 : 0}>
      {prefixEmoji ? <Text>{prefixEmoji} </Text> : null}
      <Text color={color} bold>
        {label}
      </Text>
      <Text dimColor>: </Text>
      <Text>{m.body}</Text>
    </Box>
  );
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  pnpm --filter @lathyrus-odoratus/pantry typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Run client tests**

  ```bash
  pnpm --filter @lathyrus-odoratus/pantry test
  ```

  Expected: all pass (no test touches NPC margin).

- [ ] **Step 5: Visual smoke test**

  ```bash
  pnpm --filter @lathyrus-odoratus/pantry dev -- --server ws://localhost:8080/ws --room <your-room>
  ```

  Open a world session (`/world-open`), send a message, confirm NPC reply has one blank line above and below it.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/client/src/screens/Chat.tsx
  git commit -m "feat(client): add margin around NPC messages in world chat"
  ```
