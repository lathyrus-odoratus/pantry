import type { ExtGameInfo, ServerMessage } from "@pantry/shared";
import { listGames, startSession, sendInput, getFrame } from "./api.js";
import { broadcastToRoom, send } from "../ws/broadcast.js";
import type { AuthedConnection, ConnectionRegistry } from "../ws/connection-registry.js";
import { isCabombActive } from "../cabomb/manager.js";
import { logger } from "../logger.js";

// Poll the game service for frame updates. Most games only change on input, but
// AI-ticking games (e.g. bomber) advance automatically — polling at 200ms catches
// both cases. Frames with unchanged content are skipped to avoid noise.
const POLL_MS = 200;
// End a game if the driver sends no input for this long.
const IDLE_MS = 120_000;

type ActiveExtGame = {
  sessionId: string;
  gameId: string;
  title: string;
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

// Simple in-process cache so we don't hit /games on every startExtGame call.
let cachedGames: ExtGameInfo[] | null = null;
async function resolveTitle(baseUrl: string, gameId: string): Promise<string> {
  if (!cachedGames) {
    try {
      cachedGames = await listGames(baseUrl);
    } catch {
      return gameId;
    }
  }
  return cachedGames.find((g) => g.id === gameId)?.title ?? gameId;
}

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
    gameId: g.gameId,
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
  return { gameId: g.gameId, title: g.title, by: g.driverName };
}

export async function listExtGames(baseUrl: string): Promise<ExtGameInfo[]> {
  cachedGames = null; // force fresh fetch on /game
  return listGames(baseUrl);
}

export async function startExtGame(
  conn: AuthedConnection,
  gameId: string,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<"ok" | "already_active" | "game_not_found" | "api_error"> {
  if (games.has(conn.roomId) || isCabombActive(conn.roomId)) return "already_active";

  let session;
  try {
    session = await startSession(baseUrl, gameId);
  } catch (err) {
    logger.error({ err, gameId }, "ext game start failed");
    return "api_error";
  }
  if (!session) return "game_not_found";

  const title = await resolveTitle(baseUrl, gameId);
  const roomId = conn.roomId;
  const driverName = nameOf(conn);
  const now = Date.now();

  const g: ActiveExtGame = {
    sessionId: session.sessionId,
    gameId,
    title,
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
      endExtGame(roomId, "quit", registry);
      return;
    }
    try {
      const result = await getFrame(baseUrl, game.sessionId);
      if (!result) {
        endExtGame(roomId, "quit", registry);
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
    gameId,
    title,
    by: driverName,
  });
  pushFrame(g, session.frame, 0);
  logger.info({ roomId, gameId, driver: driverName }, "ext game started");
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
    const result = await sendInput(baseUrl, g.sessionId, key);
    if (!result) {
      endExtGame(conn.roomId, "quit", registry);
      return "ok";
    }
    if ("quit" in result) {
      endExtGame(conn.roomId, "quit", registry);
      return "ok";
    }
    g.lastTick++;
    pushFrame(g, result.frame, g.lastTick);
    if (result.over) {
      const res = result.result === "win" ? "win" : result.result === "loss" ? "loss" : "quit";
      endExtGame(conn.roomId, res, registry);
    }
  } catch (err) {
    logger.error({ err, roomId: conn.roomId }, "ext game input error");
    endExtGame(conn.roomId, "quit", registry);
  }
  return "ok";
}

export function watchExtGame(conn: AuthedConnection): boolean {
  const g = games.get(conn.roomId);
  if (!g) return false;
  g.spectators.set(conn.id, conn);
  // Send the most recent frame immediately so the spectator isn't blank.
  send(conn, {
    type: "ext.game.frame",
    frame: g.lastFrame,
    tick: g.lastTick,
    by: g.driverName,
    gameId: g.gameId,
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
): void {
  const g = games.get(roomId);
  if (!g) return;
  clearInterval(g.pollTimer);
  games.delete(roomId);
  broadcastToRoom(registry, roomId, {
    type: "ext.game.over",
    result,
    by: g.driverName,
    gameId: g.gameId,
    title: g.title,
  });
  logger.info({ roomId, result, driver: g.driverName, gameId: g.gameId }, "ext game ended");
}

export function extGameOnDisconnect(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): void {
  const g = games.get(conn.roomId);
  if (!g) return;
  if (g.driver.id === conn.id) endExtGame(conn.roomId, "quit", registry);
  else g.spectators.delete(conn.id);
}
