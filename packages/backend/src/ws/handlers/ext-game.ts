import type { ExtGameStart, ExtGameInput } from "@pantry/shared";
import type { AuthedConnection } from "../connection-registry.js";
import type { ConnectionRegistry } from "../connection-registry.js";
import { send } from "../broadcast.js";
import {
  listExtGames,
  startExtGame,
  inputExtGame,
  watchExtGame,
  unwatchExtGame,
} from "../../ext-game/manager.js";

export async function handleExtGameList(
  conn: AuthedConnection,
  baseUrl: string,
): Promise<void> {
  try {
    const games = await listExtGames(baseUrl);
    send(conn, { type: "ext.games", games });
  } catch {
    send(conn, { type: "ext.game.error", reason: "api_error" });
  }
}

export async function handleExtGameStart(
  conn: AuthedConnection,
  msg: ExtGameStart,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<void> {
  const result = await startExtGame(conn, msg.gameId, registry, baseUrl);
  if (result !== "ok") {
    send(conn, { type: "ext.game.error", reason: result });
  }
}

export async function handleExtGameInput(
  conn: AuthedConnection,
  msg: ExtGameInput,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<void> {
  const result = await inputExtGame(conn, msg.key, registry, baseUrl);
  if (result !== "ok") {
    send(conn, { type: "ext.game.error", reason: result });
  }
}

export function handleExtGameWatch(conn: AuthedConnection): void {
  const ok = watchExtGame(conn);
  if (!ok) send(conn, { type: "ext.game.error", reason: "no_game" });
}

export function handleExtGameLeave(conn: AuthedConnection): void {
  unwatchExtGame(conn);
}
