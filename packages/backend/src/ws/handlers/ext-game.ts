import type { ExtGameInput } from "@pantry/shared";
import type { AuthedConnection } from "../connection-registry.js";
import type { ConnectionRegistry } from "../connection-registry.js";
import { send } from "../broadcast.js";
import {
  startExtGame,
  inputExtGame,
  watchExtGame,
  unwatchExtGame,
} from "../../ext-game/manager.js";

export async function handleExtGameStart(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
  baseUrl: string,
): Promise<void> {
  const result = await startExtGame(conn, registry, baseUrl);
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
