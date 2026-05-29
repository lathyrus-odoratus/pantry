import { GameEngine } from "./engine.js";
import { broadcastToRoom } from "../ws/broadcast.js";
import type { ConnectionRegistry } from "../ws/connection-registry.js";
import type { ServerMessage } from "@pantry/shared";
import { logger } from "../logger.js";

type ActiveGame = {
  engine: GameEngine;
  playerId: string;
  playerNickname: string;
  playerDiscriminator: string;
  roomId: string;
  enemyTimer: ReturnType<typeof setInterval>;
  bombTimer: ReturnType<typeof setTimeout> | null;
  clearTimer: ReturnType<typeof setTimeout> | null;
};

const games = new Map<string, ActiveGame>();

function makeState(game: ActiveGame): ServerMessage {
  const snap = game.engine.snapshot();
  return {
    type: "game.state",
    map: snap.map,
    player: snap.player,
    bomb: snap.bomb,
    playerNickname: game.playerNickname,
    playerDiscriminator: game.playerDiscriminator,
    tick: snap.tick,
  };
}

function endGame(
  roomId: string,
  result: "win" | "loss" | "quit",
  registry: ConnectionRegistry,
): void {
  const game = games.get(roomId);
  if (!game) return;
  clearInterval(game.enemyTimer);
  if (game.bombTimer) clearTimeout(game.bombTimer);
  if (game.clearTimer) clearTimeout(game.clearTimer);
  games.delete(roomId);
  logger.info({ roomId, result }, "game ended");
  broadcastToRoom(registry, roomId, {
    type: "game.over",
    result,
    playerNickname: game.playerNickname,
    playerDiscriminator: game.playerDiscriminator,
  });
}

export function hasActiveGame(roomId: string): boolean {
  return games.has(roomId);
}

export function startGame(
  roomId: string,
  playerId: string,
  playerNickname: string,
  playerDiscriminator: string,
  registry: ConnectionRegistry,
): boolean {
  if (games.has(roomId)) return false;

  const engine = new GameEngine();
  const enemyTimer = setInterval(() => {
    const game = games.get(roomId);
    if (!game) return;
    game.engine.stepEnemies();
    broadcastToRoom(registry, roomId, makeState(game));
    if (game.engine.isPlayerDead()) endGame(roomId, "loss", registry);
  }, 1000);

  games.set(roomId, {
    engine,
    playerId,
    playerNickname,
    playerDiscriminator,
    roomId,
    enemyTimer,
    bombTimer: null,
    clearTimer: null,
  });

  broadcastToRoom(registry, roomId, makeState(games.get(roomId)!));
  logger.info({ roomId, playerId, playerNickname }, "game started");
  return true;
}

export function handleGameInput(
  roomId: string,
  playerId: string,
  key: "w" | "a" | "s" | "d" | "bomb" | "quit",
  registry: ConnectionRegistry,
): "ok" | "not_your_game" | "no_game" {
  const game = games.get(roomId);
  if (!game) return "no_game";
  if (game.playerId !== playerId) return "not_your_game";

  if (key === "quit") {
    endGame(roomId, "quit", registry);
    return "ok";
  }

  if (key === "bomb") {
    if (!game.engine.placeBomb()) return "ok";
    broadcastToRoom(registry, roomId, makeState(game));
    game.bombTimer = setTimeout(() => {
      const g = games.get(roomId);
      if (!g) return;
      g.engine.explodeBomb();
      broadcastToRoom(registry, roomId, makeState(g));
      if (g.engine.isPlayerDead()) { endGame(roomId, "loss", registry); return; }
      if (!g.engine.hasEnemies()) { endGame(roomId, "win", registry); return; }
      g.clearTimer = setTimeout(() => {
        const g2 = games.get(roomId);
        if (!g2) return;
        g2.engine.clearExplosion();
        broadcastToRoom(registry, roomId, makeState(g2));
      }, 500);
    }, 3000);
    return "ok";
  }

  const dx = key === "a" ? -1 : key === "d" ? 1 : 0;
  const dy = key === "w" ? -1 : key === "s" ? 1 : 0;
  game.engine.movePlayer(dx, dy);
  broadcastToRoom(registry, roomId, makeState(game));
  return "ok";
}

export function endGameForPlayer(
  playerId: string,
  registry: ConnectionRegistry,
): void {
  for (const [roomId, game] of games) {
    if (game.playerId === playerId) {
      endGame(roomId, "quit", registry);
      return;
    }
  }
}
