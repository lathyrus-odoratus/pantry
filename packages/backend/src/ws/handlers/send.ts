import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { ServerMessage, Message, MessageSend } from "@pantry/shared";
import type { MessagesRepo } from "../../db/messages.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, send } from "../broadcast.js";
import { logger } from "../../logger.js";
import { formatChat, notify } from "../../discord/webhook.js";
import { NPC_DEBOUNCE_MS } from "../../world/state.js";
import type { WorldStateStore } from "../../world/state.js";
import { runNpcTurn, type BrainDeps } from "../../world/brain.js";

export type SendDeps = {
  messages: MessagesRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  anthropic: Anthropic | null;
  worldCreditTotal: number;
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

  // If a world is active in this room and this is a real player (not the
  // virtual NPC), feed the message to the brain. The brain handles its own
  // errors and runs async so we never block the broadcast.
  const world = deps.worldState.get();
  if (world && world.roomId === conn.roomId && conn.kind === "real") {
    const playerEntry = {
      role: "player" as const,
      authorLabel: `${conn.nickname}#${conn.discriminator}`,
      body: raw.body,
      at: Date.now(),
    };
    // Always append immediately so transcript stays coherent regardless of
    // whether LLM is configured or the debounce fires.
    deps.worldState.appendTranscript(playerEntry);
    if (deps.anthropic) {
      const brainDeps: BrainDeps = {
        client: deps.anthropic,
        messages: deps.messages,
        registry: deps.registry,
        worldState: deps.worldState,
        creditTotal: deps.worldCreditTotal,
      };
      deps.worldState.scheduleNpcTurn(() => {
        // Guard: world may have ended between schedule and fire.
        if (deps.worldState.isActiveInRoom(conn.roomId)) {
          void runNpcTurn(brainDeps);
        }
      }, NPC_DEBOUNCE_MS);
    }
  }

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
