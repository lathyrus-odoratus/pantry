import type { ColorChange, ServerMessage } from "@pantry/shared";
import { normalizeColor } from "../../utils/color.js";
import type { UsersRepo } from "../../db/users.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor } from "../broadcast.js";

export type ColorDeps = {
  users: UsersRepo;
  registry: ConnectionRegistry;
};

export async function handleColor(
  conn: AuthedConnection,
  raw: ColorChange,
  deps: ColorDeps,
): Promise<void> {
  const next = raw.color === null ? null : normalizeColor(raw.color);
  if (next === conn.color) return;

  await deps.users.setColor(conn.userId, next);
  deps.registry.setColor(conn.userId, next);

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);
}
