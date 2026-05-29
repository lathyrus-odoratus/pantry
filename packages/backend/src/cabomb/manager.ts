import { CaBombGame } from "@pantry/shared";
import type { ServerMessage } from "@pantry/shared";
import { broadcastToRoom, send } from "../ws/broadcast.js";
import type { AuthedConnection, ConnectionRegistry } from "../ws/connection-registry.js";
import { notify } from "../discord/webhook.js";
import { logger } from "../logger.js";

// Server-authoritative CA-bomb: one game per room, a single driver, plus opt-in
// spectators. Engine advances from a tick loop; state goes only to the driver +
// registered spectators (not the whole room). Lifecycle (started/over) is
// broadcast room-wide to drive the status-bar hint.
const TICK_MS = 100;
// Auto-end a game whose driver has sent no input for this long. Only one game
// runs per room, so an AFK driver would otherwise block the slot forever.
const IDLE_MS = 120_000;

type ActiveGame = {
  game: CaBombGame;
  driver: AuthedConnection;
  driverName: string;
  roomId: string;
  viewers: Map<string, AuthedConnection>;
  tick: ReturnType<typeof setInterval>;
  startedAt: number;
  lastInputAt: number;
  // Last broadcast state, serialized — used to skip identical frames.
  lastStateRaw: string | null;
};

const games = new Map<string, ActiveGame>();

function nameOf(conn: AuthedConnection): string {
  return `${conn.nickname}#${conn.discriminator}`;
}

function stateMsg(g: ActiveGame): ServerMessage {
  return { type: "cabomb.state", by: g.driverName, state: g.game.snapshot() };
}

// Broadcast state to the driver + spectators, but only when the visible snapshot
// actually changed. The tick loop runs at 10Hz, yet most ticks produce no
// visible delta (enemies step every 800ms; bombs/blasts change only on events).
// Clients animate at 30fps locally from the last state, so coalescing here cuts
// room traffic (issue #24) without hurting smoothness.
function sendState(g: ActiveGame): void {
  const raw = JSON.stringify(stateMsg(g));
  if (raw === g.lastStateRaw) return;
  g.lastStateRaw = raw;
  g.driver.sendRaw(raw);
  for (const v of g.viewers.values()) {
    if (v.id !== g.driver.id) v.sendRaw(raw);
  }
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildSummary(g: ActiveGame, result: "win" | "loss"): string {
  const p = g.game.player;
  return [
    "🎮 CA BOMB 成績",
    `玩家：${g.driverName}`,
    `結果：${result === "win" ? "勝利 ✅" : "失敗 💀"}`,
    `用時：${formatClock(Date.now() - g.startedAt)}`,
    `水球 Lv${p.bombCap} ／ 水力 Lv${p.range} ／ ❤ ${p.hp}`,
    `敵人剩餘：${g.game.enemies.length}`,
  ].join("\n");
}

export function isCabombActive(roomId: string): boolean {
  return games.has(roomId);
}

export function cabombDriver(roomId: string): string | null {
  return games.get(roomId)?.driverName ?? null;
}

export function startCabomb(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): boolean {
  if (games.has(conn.roomId)) return false;

  const roomId = conn.roomId;
  const driverName = nameOf(conn);
  const game = new CaBombGame();
  const now = Date.now();
  const tick = setInterval(() => {
    const g = games.get(roomId);
    if (!g) return;
    if (Date.now() - g.lastInputAt >= IDLE_MS) {
      logger.info({ roomId, driver: g.driverName }, "cabomb idle timeout");
      endCabomb(roomId, "quit", registry);
      return;
    }
    g.game.tick(TICK_MS);
    sendState(g);
    if (g.game.status !== "playing") {
      endCabomb(roomId, g.game.status === "win" ? "win" : "loss", registry);
    }
  }, TICK_MS);

  const g: ActiveGame = {
    game,
    driver: conn,
    driverName,
    roomId,
    viewers: new Map(),
    tick,
    startedAt: now,
    lastInputAt: now,
    lastStateRaw: null,
  };
  games.set(roomId, g);

  broadcastToRoom(registry, roomId, { type: "cabomb.started", by: driverName });
  sendState(g);
  logger.info({ roomId, driver: driverName }, "cabomb started");
  return true;
}

export function inputCabomb(
  conn: AuthedConnection,
  key: "w" | "a" | "s" | "d" | "bomb" | "quit",
  registry: ConnectionRegistry,
): "ok" | "no_game" | "not_driver" {
  const g = games.get(conn.roomId);
  if (!g) return "no_game";
  if (g.driver.id !== conn.id) return "not_driver";

  if (key === "quit") {
    endCabomb(conn.roomId, "quit", registry);
    return "ok";
  }
  g.lastInputAt = Date.now();
  if (key === "bomb") g.game.placeBomb();
  else if (key === "w") g.game.move(0, -1);
  else if (key === "s") g.game.move(0, 1);
  else if (key === "a") g.game.move(-1, 0);
  else if (key === "d") g.game.move(1, 0);

  sendState(g);
  if (g.game.status !== "playing") {
    endCabomb(conn.roomId, g.game.status === "win" ? "win" : "loss", registry);
  }
  return "ok";
}

export function watchCabomb(conn: AuthedConnection): boolean {
  const g = games.get(conn.roomId);
  if (!g) return false;
  g.viewers.set(conn.id, conn);
  send(conn, stateMsg(g));
  return true;
}

export function unwatchCabomb(conn: AuthedConnection): void {
  games.get(conn.roomId)?.viewers.delete(conn.id);
}

function endCabomb(
  roomId: string,
  result: "win" | "loss" | "quit",
  registry: ConnectionRegistry,
): void {
  const g = games.get(roomId);
  if (!g) return;
  clearInterval(g.tick);
  games.delete(roomId);
  const summary =
    result === "win" || result === "loss" ? buildSummary(g, result) : undefined;
  broadcastToRoom(registry, roomId, {
    type: "cabomb.over",
    result,
    by: g.driverName,
    summary,
  });
  if (summary) notify(g.driver.webhook, summary);
  logger.info({ roomId, result, driver: g.driverName }, "cabomb ended");
}

// On disconnect: a driver leaving ends the game; a spectator just stops watching.
export function cabombOnDisconnect(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): void {
  const g = games.get(conn.roomId);
  if (!g) return;
  if (g.driver.id === conn.id) endCabomb(conn.roomId, "quit", registry);
  else g.viewers.delete(conn.id);
}
