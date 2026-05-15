import type { ServerMessage } from "@pantry/shared";
import { logger } from "../../logger.js";
import type { UsersRepo } from "../../db/users.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "../broadcast.js";
import { ensureNpcUser, buildNpcConnection, NPC } from "../../world/npc.js";
import type { WorldStateStore } from "../../world/state.js";
import { notify, formatSystem } from "../../discord/webhook.js";

export type WorldDeps = {
  users: UsersRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  creditTotal: number;
};

export type EndReason = "credit_exhausted" | "admin_force" | "brain_broken";

export async function handleWorldOpen(
  conn: AuthedConnection,
  deps: WorldDeps,
): Promise<void> {
  if (deps.worldState.isActive()) {
    const active = deps.worldState.get();
    send(conn, {
      type: "error",
      code: "world_already_active",
      message:
        active && active.roomId === conn.roomId
          ? "World already running in this room."
          : "World already running in another room.",
    });
    return;
  }

  const npcUser = await ensureNpcUser(deps.users);
  const npcConn = buildNpcConnection(npcUser, conn.roomId);
  deps.registry.add(npcConn);

  deps.worldState.set({
    roomId: conn.roomId,
    npcUserId: npcUser.id,
    npcConnectionId: npcConn.id,
    startedAt: Date.now(),
    creditUsed: 0,
    creditTotal: deps.creditTotal,
    transcript: [],
    webhook: conn.webhook,
    brainBusy: false,
    pendingRoll: null,
    consecutiveInvalidRequests: 0,
  });

  const openerLabel = `${conn.nickname}#${conn.discriminator}`;
  const openBody = `🌍 World opened by ${openerLabel}. ${NPC.nickname} joined.`;
  const openNotice: ServerMessage = {
    type: "system",
    event: "world.open",
    body: openBody,
  };
  broadcastToRoom(deps.registry, conn.roomId, openNotice);
  notify(conn.webhook, formatSystem("world.open", openBody));

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);

  const state: ServerMessage = {
    type: "world.state",
    active: true,
    creditUsed: 0,
    creditTotal: deps.creditTotal,
  };
  broadcastToRoom(deps.registry, conn.roomId, state);

  logger.info(
    { openerUserId: conn.userId, roomId: conn.roomId, npcUserId: npcUser.id },
    "world opened",
  );
}

/**
 * Tear down the active world. Called by c3 auto-end (credit=0) and c4
 * admin-force. The `summary` arg is the LLM-generated closing text (with
 * fixed footer) produced in c5; if omitted a placeholder is used.
 */
export async function endWorld(
  deps: WorldDeps,
  reason: EndReason,
  summary?: string,
): Promise<void> {
  const active = deps.worldState.get();
  if (!active) return;

  const summaryBody =
    summary ??
    `World ended (${
      reason === "credit_exhausted"
        ? "credit exhausted"
        : reason === "admin_force"
          ? "admin force"
          : "brain broken"
    }).`;
  const body = `🌒 ── 世界結束 ──\n\n${summaryBody}`;

  broadcastToRoom(deps.registry, active.roomId, {
    type: "system",
    event: "world.end",
    body,
  });
  // Discord blockquotes work line-by-line; `>>>` makes the rest of the
  // message a single blockquote which keeps the multi-paragraph summary
  // visually grouped.
  notify(active.webhook, `>>> ${body}`);

  const npcConn = deps.registry.get(active.npcConnectionId);
  if (npcConn) deps.registry.remove(npcConn);

  deps.worldState.set(null);

  broadcastToRoom(deps.registry, active.roomId, {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, active.roomId),
  });
  broadcastToRoom(deps.registry, active.roomId, {
    type: "world.state",
    active: false,
    creditUsed: active.creditUsed,
    creditTotal: active.creditTotal,
  });

  logger.info({ roomId: active.roomId, reason }, "world ended");
}
