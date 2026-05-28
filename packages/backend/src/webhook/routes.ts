import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Message, ServerMessage } from "@pantry/shared";
import type { RoomsRepo } from "../db/rooms.js";
import type { UsersRepo } from "../db/users.js";
import type { MessagesRepo } from "../db/messages.js";
import type { ConnectionRegistry } from "../ws/connection-registry.js";
import { broadcastToRoom } from "../ws/broadcast.js";
import { logger } from "../logger.js";
import { validateNickname } from "../utils/nickname.js";
import { discriminatorFromSourceId } from "../utils/discriminator.js";
// 用來存在 DB 的 userId，代表所有來自 Discord Webhook 的訊息都會被標記為這個 userId
const DISCORD_INGRESS_BRIDGE_USER_ID = "2c0b8d96-b3dc-4ca8-a43d-b89dfb3d4a25";

const DiscordIngressBodySchema = z.object({
  roomName: z.string().min(1).max(64),
  displayName: z.string().min(1).max(200),
  sourceUserId: z.string().min(1).max(64).regex(/^\d+$/),
  message: z.string().min(1).max(2000),
});

function normalizeDcNickname(input: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const truncated = input.trim().slice(0, 20);
  const valid = validateNickname(truncated);
  if (!valid.ok) return { ok: false, error: valid.error };
  return { ok: true, value: `${valid.value}[DC]` };
}

export type WebhookRoutesDeps = {
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export async function registerWebhookRoutes(
  app: FastifyInstance,
  deps: WebhookRoutesDeps,
): Promise<void> {
  app.post("/webhook/discord/messages", async (req, reply) => {
    const parsed = DiscordIngressBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    }

    const { roomName, displayName, sourceUserId, message } = parsed.data;
    const nick = normalizeDcNickname(displayName);
    if (!nick.ok) {
      return reply.code(400).send({ error: "nickname_invalid", reason: nick.error });
    }

    const room = await deps.rooms.findByName(roomName);
    if (!room) return reply.code(404).send({ error: "room_not_found" });
    if (room.closed_at) return reply.code(409).send({ error: "room_closed" });

    const bridgeUser = await deps.users.findById(DISCORD_INGRESS_BRIDGE_USER_ID);
    if (!bridgeUser) {
      return reply.code(503).send({ error: "bridge_user_not_configured" });
    }

    const outMessage: Message = {
      id: randomUUID(),
      body: message,
      createdAt: new Date().toISOString(),
      author: {
        nickname: nick.value,
        discriminator: discriminatorFromSourceId(sourceUserId),
      },
    };
    const out: ServerMessage = { type: "message", data: outMessage };
    broadcastToRoom(deps.registry, room.id, out);

    try {
      await deps.messages.insert({
        id: outMessage.id,
        roomId: room.id,
        userId: bridgeUser.id,
        authorNickname: outMessage.author.nickname,
        authorDiscriminator: outMessage.author.discriminator,
        body: outMessage.body,
        createdAt: outMessage.createdAt,
      });
    } catch (err) {
      logger.error({ err, roomName }, "discord ingress insert failed");
      return reply.code(500).send({ error: "internal" });
    }

    logger.info({ roomName, sourceUserId, len: message.length }, "discord ingress message");
    return reply.code(202).send({
      ok: true,
      roomId: room.id,
      messageId: outMessage.id,
      author: outMessage.author,
    });
  });
}
