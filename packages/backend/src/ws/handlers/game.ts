import type { GameInput } from "@pantry/shared";
import type { AuthedConnection } from "../connection-registry.js";
import type { ConnectionRegistry } from "../connection-registry.js";
import { send } from "../broadcast.js";
import { startGame, handleGameInput } from "../../game/manager.js";

export function handleGameStart(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): void {
  const ok = startGame(
    conn.roomId,
    conn.userId,
    conn.nickname,
    conn.discriminator,
    registry,
  );
  if (!ok) {
    send(conn, { type: "game.error", reason: "already_active" });
  }
}

export function handleGameInputMsg(
  conn: AuthedConnection,
  msg: GameInput,
  registry: ConnectionRegistry,
): void {
  const result = handleGameInput(conn.roomId, conn.userId, msg.key, registry);
  if (result === "not_your_game") {
    send(conn, { type: "game.error", reason: "not_your_game" });
  }
}
