# Design: Bomberman Mini-Game (`/bomb`)

**Date**: 2026-05-29
**Branch**: feat/bomberman-game
**Status**: Draft

---

## Problem

Users want a lightweight mini-game they can play inside a pantry room. All room members should be able to see who is playing and follow the game live.

---

## Solution

A single-player Bomberman-style game triggered by `/bomb`. The game loop runs **server-side**; every state change is broadcast to all room members as a `game.state` WS message. The active player sends keystroke input over WS; spectators see a live read-only map in a compact panel above the input bar.

One game per room at a time. The game ends on win (all enemies cleared), loss (HP ≤ 0), or player quit (`q`).

---

## Game Rules

Based on the standalone prototype (`CLI Bomber Mini`).

| Symbol | Element | Behaviour |
|--------|---------|-----------|
| `#` | Wall | Indestructible. Border + pillars at even `(x, y)` positions. |
| `X` | Block | Destructible; cleared by explosion. |
| `E` | Enemy | Moves randomly every 1 s; deals 1 HP on contact with player. |
| `@` | Player | Starts at `(1,1)`; 3 HP. |
| `B` | Bomb | 3 s fuse; explodes in 4 cardinal directions (1 cell); clears `X`/`E`; damages player if in blast radius. |
| `*` | Explosion | Visible for 500 ms then cleared. |

Map: 15 × 9. ~20% blocks, ~5% enemies on random generation. Starting area `(1,1)`, `(2,1)`, `(1,2)` always clear.

---

## Architecture

### New files

| Path | Role |
|------|------|
| `packages/backend/src/game/engine.ts` | Pure game logic (no I/O). Direct port of the prototype's map, player, bomb, and enemy logic. |
| `packages/backend/src/game/manager.ts` | Per-room game instance. Owns `setInterval` / `setTimeout` handles, drives `engine.ts`, broadcasts via `ConnectionRegistry`. |
| `packages/backend/src/ws/handlers/game.ts` | Handles `game.start`, `game.input`, `game.quit` client frames. |
| `packages/client/src/components/GameView.tsx` | Full-screen Ink component for the active player. |
| `packages/client/src/components/GameSpectate.tsx` | Compact read-only panel shown to spectators when a game is active. |

### Changed files

| Path | Change |
|------|--------|
| `packages/shared/src/protocol.ts` | Add `game.*` discriminated union members to `ClientMessageSchema` and `ServerMessageSchema`. |
| `packages/backend/src/ws/server.ts` | Route `game.*` frames to `handlers/game.ts`. |
| `packages/client/src/store.ts` | Add `currentGame` state field + `"game"` value to the `screen` union. |
| `packages/client/src/app.tsx` | Add `case "game": return <GameView />`. |
| `packages/client/src/screens/Chat.tsx` | Render `<GameSpectate />` above the input bar when `store.currentGame` is set and user is spectating. |
| `packages/client/src/screens/InputBar.tsx` | Add `/bomb` to the slash-command if/else chain; sends `game.start`. |
| `packages/client/src/transport/client.ts` | Handle inbound `game.state` and `game.over` messages. |

---

## Protocol Additions

### Client → Server

```typescript
{ type: "game.start" }

{ type: "game.input", key: "w" | "a" | "s" | "d" | "bomb" | "quit" }
```

### Server → Client

```typescript
// Broadcast to all room members on every state change
{
  type: "game.state",
  map: string[][],                 // 15×9 grid, same symbols as above
  player: { x: number, y: number, hp: number },
  bomb: { x: number, y: number, exploded: boolean } | null,
  playerNickname: string,
  playerDiscriminator: string,
  tick: number,                    // monotonic counter; client discards out-of-order frames
}

// Broadcast when game ends
{
  type: "game.over",
  result: "win" | "loss" | "quit",
  playerNickname: string,
  playerDiscriminator: string,
}

// Sent only to the requesting client
{ type: "game.error", reason: "already_active" | "not_your_game" }
```

---

## Client UX

**Active player**: `screen` switches to `"game"`. `GameView.tsx` renders the full 15×9 map. WASD moves, Space places bomb, `q` sends `game.quit` and returns to `"chat"`.

**Spectators**: remain on `"chat"` screen. `<GameSpectate />` renders above the input bar, showing the live map and `Nickname#disc is playing — HP: N`. Updates on each `game.state` message.

**Game over**: `screen` reverts to `"chat"`; a system-style line appears in the chat area:
- Win: `🎮 Nickname#disc cleared all enemies!`
- Loss: `💀 Nickname#disc was defeated.`
- Quit: `Nickname#disc quit the game.`

These are client-side only (not persisted to Supabase).

---

## Backend — Game Loop

`manager.ts` owns all timers:

- `setInterval(updateEnemies, 1_000)` — random-walk all `E` cells, damage player on contact.
- `setTimeout(explodeBomb, 3_000)` + `setTimeout(clearExplosion, 500)` — same cadence as prototype.
- After every mutation: broadcast `game.state` to all connections in the room via `ConnectionRegistry.byRoom.get(roomName)`.

Game state is **in-memory only** — not persisted to Supabase. A backend restart mid-game drops the active game silently.

One `GameManager` per room, held in a module-level `Map<string, GameManager>` in `game/manager.ts`. Cleared on `game.over`.

---

## Trade-offs

- **No persistence** — game is ephemeral; acceptable for a fun side feature.
- **One game per room** — a second `/bomb` returns `game.error { reason: "already_active" }`, surfaced as a chat hint "a game is already in progress".
- **Controls conflict** — while in `GameView`, WASD is captured by the game. Player must press `q` to return to chat.
- **Bomb limit** — one bomb at a time (matches prototype behaviour). Not configurable in this iteration.
- **No multi-player** — explicitly out of scope.
