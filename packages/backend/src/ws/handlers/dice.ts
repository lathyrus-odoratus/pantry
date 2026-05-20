import type Anthropic from "@anthropic-ai/sdk";
import type { ServerMessage } from "@pantry/shared";
import { logger } from "../../logger.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import type { MessagesRepo } from "../../db/messages.js";
import { broadcastToRoom, send } from "../broadcast.js";
import { notify } from "../../discord/webhook.js";
import { rollDice, formatRoll } from "../../world/dice.js";
import type { WorldStateStore } from "../../world/state.js";
import { runNpcTurn } from "../../world/brain.js";

export type DiceDeps = {
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  anthropic: Anthropic | null;
  messages: MessagesRepo;
  worldCreditTotal: number;
};

/**
 * /roll has no arguments. The dice spec comes from worldState.pendingRoll,
 * which the NPC set via a `[[roll:…]]` marker on its previous turn. Server
 * is authoritative for the roll; outcome is broadcast as a 'dice' system
 * event, mirrored to Discord, and fed into the transcript so the NPC sees
 * it on its next turn.
 */
export async function handleDiceRoll(
  conn: AuthedConnection,
  deps: DiceDeps,
): Promise<void> {
  const world = deps.worldState.get();
  if (!world || world.roomId !== conn.roomId) {
    send(conn, {
      type: "error",
      code: "no_active_world",
      message: "/roll only works while a world is active in this room.",
    });
    return;
  }
  const dice = world.pendingRoll;
  if (!dice) {
    send(conn, {
      type: "error",
      code: "no_pending_roll",
      message:
        "No pending roll — the NPC hasn't asked for one yet. Provoke the world first.",
    });
    return;
  }

  // Consume the slot before broadcasting so a double /roll doesn't reuse it.
  world.pendingRoll = null;

  const result = rollDice(dice);
  const authorLabel = `${conn.nickname}#${conn.discriminator}`;
  const body = formatRoll(authorLabel, dice, result);

  const sysMsg: ServerMessage = { type: "system", event: "dice", body };
  broadcastToRoom(deps.registry, conn.roomId, sysMsg);
  notify(conn.webhook, `> ${body}`);

  logger.info(
    {
      userId: conn.userId,
      roomId: conn.roomId,
      dice,
      total: result.total,
    },
    "dice rolled",
  );

  // Treat the dice outcome as a player turn: append to transcript then
  // immediately trigger the NPC (no debounce — the dice result is a direct
  // response to the NPC's roll request, so we want the reaction right away).
  world.transcript.push({ role: "player", authorLabel: "🎲 dice", body, at: Date.now() });
  if (deps.anthropic) {
    void runNpcTurn({
      client: deps.anthropic,
      messages: deps.messages,
      registry: deps.registry,
      worldState: deps.worldState,
      creditTotal: deps.worldCreditTotal,
    });
  }
}
