import type { ServerMessage } from "@pantry/shared";
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
): { nickname: string; discriminator: string }[] {
  const seen = new Set<string>();
  const out: { nickname: string; discriminator: string }[] = [];
  for (const c of registry.listByRoom(roomId)) {
    const key = `${c.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nickname: c.nickname, discriminator: c.discriminator });
  }
  return out;
}
