import type { ServerMessage, NickChange } from "@chat-room/shared";
import { validateNickname } from "../../utils/nickname.js";
import type { UsersRepo } from "../../db/users.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "../broadcast.js";

export type NickDeps = {
  users: UsersRepo;
  registry: ConnectionRegistry;
};

export async function handleNick(
  conn: AuthedConnection,
  raw: NickChange,
  deps: NickDeps,
): Promise<void> {
  const result = validateNickname(raw.newNickname);
  if (!result.ok) {
    const err: ServerMessage = {
      type: "error",
      code: "nickname_invalid",
      message: result.error,
    };
    send(conn, err);
    return;
  }
  if (result.value === conn.nickname) return;

  const oldLabel = `${conn.nickname}#${conn.discriminator}`;
  const updated = await deps.users.renameWithDiscriminatorRetry(conn.userId, result.value);
  deps.registry.rename(conn.id, updated.nickname, updated.discriminator);

  const newLabel = `${updated.nickname}#${updated.discriminator}`;
  const sys: ServerMessage = {
    type: "system",
    event: "rename",
    body: `${oldLabel} → ${newLabel}`,
  };
  broadcastToRoom(deps.registry, conn.roomId, sys);
  // Small delay so the system and presence frames arrive in separate TCP reads;
  // without this, the client may receive both in one read and miss presence if
  // its listener is re-installed between the two synchronous message emissions.
  await new Promise<void>((r) => setTimeout(r, 20));

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);
}
