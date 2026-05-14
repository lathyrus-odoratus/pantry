import type { DiceRoll, ServerMessage } from "@pantry/shared";
import { logger } from "../../logger.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, send } from "../broadcast.js";
import { notify } from "../../discord/webhook.js";
import { parseDiceExpression, rollDice, formatRoll } from "../../world/dice.js";
import type { WorldStateStore } from "../../world/state.js";

export type DiceDeps = {
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
};

export async function handleDiceRoll(
  conn: AuthedConnection,
  raw: DiceRoll,
  deps: DiceDeps,
): Promise<void> {
  const dice = parseDiceExpression(raw.expression);
  if (!dice) {
    send(conn, {
      type: "error",
      code: "invalid_dice",
      message: `Bad dice expression. Try d20, 3d6, d8+2 (sides: 2/3/4/6/8/10/12/20/100, count ≤ 20).`,
    });
    return;
  }

  const result = rollDice(dice);
  const authorLabel = `${conn.nickname}#${conn.discriminator}`;
  const body = formatRoll(authorLabel, dice, result);

  const sysMsg: ServerMessage = { type: "system", event: "dice", body };
  broadcastToRoom(deps.registry, conn.roomId, sysMsg);
  notify(conn.webhook, `> ${body}`);

  // If a world is active in this room, feed the outcome into the transcript
  // so the NPC sees the roll on its next turn (treat dice as a player
  // utterance so it lands in the next merged `user` message).
  const world = deps.worldState.get();
  if (world && world.roomId === conn.roomId) {
    world.transcript.push({
      role: "player",
      authorLabel: "🎲 dice",
      body,
      at: Date.now(),
    });
  }

  logger.info(
    {
      userId: conn.userId,
      roomId: conn.roomId,
      expression: raw.expression,
      total: result.total,
    },
    "dice rolled",
  );
}
