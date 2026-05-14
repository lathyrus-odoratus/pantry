import { randomUUID } from "node:crypto";
import type { UserRow, UsersRepo } from "../db/users.js";
import type { AuthedConnection } from "../ws/connection-registry.js";

// Single hardcoded NPC persona for MVP. Move to YAML/JSON config when
// we want hot-swappable personas without redeploying.
export const NPC = {
  subject: "npc:gray-traveler-v1",
  nickname: "灰袍旅人",
} as const;

export async function ensureNpcUser(users: UsersRepo): Promise<UserRow> {
  const existing = await users.findByProviderSubject("npc", NPC.subject);
  if (existing) return existing;
  return users.createWithDiscriminator({
    provider: "npc",
    subject: NPC.subject,
    nickname: NPC.nickname,
  });
}

export function buildNpcConnection(
  user: UserRow,
  roomId: string,
): AuthedConnection {
  return {
    id: randomUUID(),
    userId: user.id,
    roomId,
    nickname: user.nickname,
    discriminator: user.discriminator,
    color: user.color,
    webhook: null,
    sendRaw: () => {},
    close: () => {},
    kind: "virtual",
  };
}
