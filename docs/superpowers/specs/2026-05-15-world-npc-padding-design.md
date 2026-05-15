# Design: NPC Message Padding in World Chat

**Date**: 2026-05-15
**Branch**: feat/world-padding
**Status**: Approved

## Problem

When the `/the-world` TRPG feature is active, NPC messages appear flush against surrounding player messages with no visual separation. This makes the NPC's narration hard to distinguish at a glance.

## Solution

Add one blank line before and one blank line after every NPC message row in the terminal UI. No backend, protocol, or store changes required.

## Change

**File**: `packages/client/src/screens/Chat.tsx`
**Function**: `MessageRow` (line 64)

Add `marginTop` and `marginBottom` to the NPC message's `<Box>`:

```tsx
<Box marginTop={isNpc ? 1 : 0} marginBottom={isNpc ? 1 : 0}>
```

NPC detection already exists via `isNpc = m.author.nickname === NPC_NICKNAME`.

## Trade-offs

- Two consecutive NPC messages (unlikely in normal TRPG flow) would produce 2 blank lines between them — acceptable.
- Player messages are unaffected.
- No test changes needed (purely visual).
