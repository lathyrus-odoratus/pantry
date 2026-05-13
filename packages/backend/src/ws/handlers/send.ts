import { randomUUID } from "node:crypto";
import type { ServerMessage, Message, MessageSend } from "@pantry/shared";
import type { MessagesRepo } from "../../db/messages.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, send } from "../broadcast.js";
import { logger } from "../../logger.js";
import { formatChat, notify } from "../../discord/webhook.js";

export type SendDeps = {
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export async function handleSend(
  conn: AuthedConnection,
  raw: MessageSend,
  deps: SendDeps,
): Promise<void> {
  const message: Message = {
    id: randomUUID(),
    body: raw.body,
    createdAt: new Date().toISOString(),
    author: { nickname: conn.nickname, discriminator: conn.discriminator },
  };
  const out: ServerMessage = { type: "message", data: message };
  broadcastToRoom(deps.registry, conn.roomId, out);
  notify(conn.webhook, formatChat(message.author, message.body));

  // Persist with retry; failure only reported to sender
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await deps.messages.insert({
        id: message.id,
        roomId: conn.roomId,
        userId: conn.userId,
        authorNickname: conn.nickname,
        authorDiscriminator: conn.discriminator,
        body: message.body,
        createdAt: message.createdAt,
      });
      return;
    } catch (err) {
      lastErr = err;
      logger.warn({ err, attempt }, "message insert failed; retrying");
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  logger.error({ err: lastErr, messageId: message.id }, "message insert gave up");
  const errMsg: ServerMessage = {
    type: "error",
    code: "persist_failed",
    message: "Message could not be saved (broadcast succeeded).",
  };
  send(conn, errMsg);
}
