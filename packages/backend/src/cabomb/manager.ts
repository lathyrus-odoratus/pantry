import { CaBombGame } from "@pantry/shared";
import type { ServerMessage } from "@pantry/shared";
import { broadcastToRoom, send } from "../ws/broadcast.js";
import type { AuthedConnection, ConnectionRegistry } from "../ws/connection-registry.js";
import { logger } from "../logger.js";

// Server-authoritative CA-bomb: one game per room, a single driver, plus opt-in
// spectators. Engine advances from a tick loop; state goes only to the driver +
// registered spectators (not the whole room). Lifecycle (started/over) is
// broadcast room-wide to drive the status-bar hint.
const TICK_MS = 100;

type ActiveGame = {
  game: CaBombGame;
  driver: AuthedConnection;
  driverName: string;
  roomId: string;
  viewers: Map<string, AuthedConnection>;
  tick: ReturnType<typeof setInterval>;
};

const games = new Map<string, ActiveGame>();

function nameOf(conn: AuthedConnection): string {
  return `${conn.nickname}#${conn.discriminator}`;
}

function stateMsg(g: ActiveGame): ServerMessage {
  return { type: "cabomb.state", by: g.driverName, state: g.game.snapshot() };
}

function sendState(g: ActiveGame): void {
  const msg = stateMsg(g);
  send(g.driver, msg);
  for (const v of g.viewers.values()) {
    if (v.id !== g.driver.id) send(v, msg);
  }
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
  const tick = setInterval(() => {
    const g = games.get(roomId);
    if (!g) return;
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
  broadcastToRoom(registry, roomId, {
    type: "cabomb.over",
    result,
    by: g.driverName,
  });
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
