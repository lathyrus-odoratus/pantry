import type { ServerMessage, User } from "@pantry/shared";
import type { ConnectionRegistry, AuthedConnection } from "./connection-registry.js";

function serialize(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function send(conn: AuthedConnection, msg: ServerMessage): void {
  conn.sendRaw(serialize(msg));
}

export function broadcastToRoom(
  registry: ConnectionRegistry,
  roomId: string,
  msg: ServerMessage,
  exclude?: AuthedConnection,
): void {
  const text = serialize(msg);
  for (const c of registry.listByRoom(roomId)) {
    if (exclude && c.id === exclude.id) continue;
    c.sendRaw(text);
  }
}

export function presenceFor(
  registry: ConnectionRegistry,
  roomId: string,
): User[] {
  const seen = new Set<string>();
  const out: User[] = [];
  for (const c of registry.listByRoom(roomId)) {
    if (seen.has(c.userId)) continue;
    seen.add(c.userId);
    out.push({
      nickname: c.nickname,
      discriminator: c.discriminator,
      color: c.color,
    });
  }
  return out;
}
