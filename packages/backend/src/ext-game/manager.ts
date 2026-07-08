import type { ServerMessage } from "@pantry/shared";
import { startTuiSession, sendTuiInput, getTuiFrame, deleteTuiSession } from "./api.js";
import { broadcastToRoom, send } from "../ws/broadcast.js";
import type { AuthedConnection, ConnectionRegistry } from "../ws/connection-registry.js";
import { isCabombActive } from "../cabomb/manager.js";
import { logger } from "../logger.js";

const POLL_MS = 200;
const IDLE_MS = 120_000;

// Constant identifiers used in WS protocol messages for the TUI shell session.
const SHELL_GAME_ID = "shell";
const SHELL_TITLE = "遊戲";

type ActiveExtGame = {
  sessionId: string;
  driver: AuthedConnection;
  driverName: string;
  roomId: string;
  spectators: Map<string, AuthedConnection>;
  pollTimer: ReturnType<typeof setInterval>;
  lastTick: number;
  lastFrame: string;
  startedAt: number;
  lastInputAt: number;
};

const games = new Map<string, ActiveExtGame>();

function nameOf(conn: AuthedConnection): string {
  return `${conn.nickname}#${conn.discriminator}`;
}

function pushFrame(g: ActiveExtGame, frame: string, tick: number): void {
  g.lastFrame = frame;
  const raw = JSON.stringify({
    type: "ext.game.frame",
    frame,
    tick,
    by: g.driverName,
    gameId: SHELL_GAME_ID,
  } satisfies ServerMessage);
  g.driver.sendRaw(raw);
  for (const v of g.spectators.values()) {
    if (v.id !== g.driver.id) v.sendRaw(raw);
  }
}

export function isExtGameActive(roomId: string): boolean {
  return games.has(roomId);
}

export function extGameInfo(
  roomId: string,
): { gameId: string; title: string; by: string } | null {
  const g = games.get(roomId);
  if (!g) return null;
  return { gameId: SHELL_GAME_ID, title: SHELL_TITLE, by: g.driverName };
}

export async function startExtGame(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<"ok" | "already_active" | "api_error"> {
  if (games.has(conn.roomId) || isCabombActive(conn.roomId)) return "already_active";

  let session;
  try {
    session = await startTuiSession(baseUrl, nameOf(conn));
  } catch (err) {
    logger.error({ err }, "tui session start failed");
    return "api_error";
  }
  if (!session) return "api_error";

  const roomId = conn.roomId;
  const driverName = nameOf(conn);
  const now = Date.now();

  const g: ActiveExtGame = {
    sessionId: session.sessionId,
    driver: conn,
    driverName,
    roomId,
    spectators: new Map(),
    pollTimer: null!,
    lastTick: 0,
    lastFrame: session.frame,
    startedAt: now,
    lastInputAt: now,
  };
  games.set(roomId, g);

  g.pollTimer = setInterval(async () => {
    const game = games.get(roomId);
    if (!game) return;
    if (Date.now() - game.lastInputAt >= IDLE_MS) {
      logger.info({ roomId, driver: game.driverName }, "ext game idle timeout");
      endExtGame(roomId, "quit", registry, baseUrl);
      return;
    }
    try {
      const result = await getTuiFrame(baseUrl, game.sessionId);
      if (!result) {
        endExtGame(roomId, "quit", registry, baseUrl);
        return;
      }
      if (result.frame !== game.lastFrame) {
        game.lastTick++;
        game.lastInputAt = Date.now();
        pushFrame(game, result.frame, game.lastTick);
      }
    } catch (err) {
      logger.warn({ err, roomId }, "ext game poll error");
    }
  }, POLL_MS);

  broadcastToRoom(registry, roomId, {
    type: "ext.game.started",
    gameId: SHELL_GAME_ID,
    title: SHELL_TITLE,
    by: driverName,
  });
  pushFrame(g, session.frame, 0);
  logger.info({ roomId, driver: driverName }, "tui session started");
  return "ok";
}

export async function inputExtGame(
  conn: AuthedConnection,
  key: string,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<"ok" | "no_game" | "not_driver"> {
  const g = games.get(conn.roomId);
  if (!g) return "no_game";
  if (g.driver.id !== conn.id) return "not_driver";

  g.lastInputAt = Date.now();
  try {
    const result = await sendTuiInput(baseUrl, g.sessionId, key);
    if (!result) {
      endExtGame(conn.roomId, "quit", registry, baseUrl);
      return "ok";
    }
    if ("quit" in result) {
      endExtGame(conn.roomId, "quit", registry, baseUrl);
      return "ok";
    }
    g.lastTick++;
    pushFrame(g, result.frame, g.lastTick);
  } catch (err) {
    logger.error({ err, roomId: conn.roomId }, "ext game input error");
    endExtGame(conn.roomId, "quit", registry, baseUrl);
  }
  return "ok";
}

export function watchExtGame(conn: AuthedConnection): boolean {
  const g = games.get(conn.roomId);
  if (!g) return false;
  g.spectators.set(conn.id, conn);
  send(conn, {
    type: "ext.game.frame",
    frame: g.lastFrame,
    tick: g.lastTick,
    by: g.driverName,
    gameId: SHELL_GAME_ID,
  });
  return true;
}

export function unwatchExtGame(conn: AuthedConnection): void {
  games.get(conn.roomId)?.spectators.delete(conn.id);
}

function endExtGame(
  roomId: string,
  result: "win" | "loss" | "quit",
  registry: ConnectionRegistry,
  baseUrl: string,
): void {
  const g = games.get(roomId);
  if (!g) return;
  clearInterval(g.pollTimer);
  games.delete(roomId);
  void deleteTuiSession(baseUrl, g.sessionId);
  broadcastToRoom(registry, roomId, {
    type: "ext.game.over",
    result,
    by: g.driverName,
    gameId: SHELL_GAME_ID,
    title: SHELL_TITLE,
  });
  logger.info({ roomId, result, driver: g.driverName }, "tui session ended");
}

export function extGameOnDisconnect(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
  baseUrl: string,
): void {
  const g = games.get(conn.roomId);
  if (!g) return;
  if (g.driver.id === conn.id) endExtGame(conn.roomId, "quit", registry, baseUrl);
  else g.spectators.delete(conn.id);
}
