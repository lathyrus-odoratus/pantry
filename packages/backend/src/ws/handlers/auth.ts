import { randomUUID } from "node:crypto";
import type { ServerMessage, AuthAnon, AuthOAuth } from "@pantry/shared";

import type { Config } from "../../config.js";
import { logger } from "../../logger.js";
import { LATEST_CLIENT_VERSION } from "../../version.js";
import { validateNickname } from "../../utils/nickname.js";
import { verifySessionToken } from "../../utils/jwt.js";
import type { RoomsRepo } from "../../db/rooms.js";
import type { UsersRepo } from "../../db/users.js";
import type { MessagesRepo } from "../../db/messages.js";
import type { ConnectionRegistry, AuthedConnection } from "../connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "../broadcast.js";
import {
  formatSystem,
  notify,
  targetFromRoom,
  type WebhookTarget,
} from "../../discord/webhook.js";

export type AuthDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export type AuthResolution =
  | { ok: true; conn: AuthedConnection }
  | {
      ok: false;
      reason:
        | "room_not_found"
        | "room_closed"
        | "invalid_token"
        | "nickname_invalid";
    };

async function resolveRoomOrError(
  rooms: RoomsRepo,
  roomName: string,
): Promise<
  | { ok: true; roomId: string; webhook: WebhookTarget | null }
  | { ok: false; reason: "room_not_found" | "room_closed" }
> {
  const room = await rooms.findByName(roomName);
  if (!room) return { ok: false, reason: "room_not_found" };
  if (room.closed_at) return { ok: false, reason: "room_closed" };
  return {
    ok: true,
    roomId: room.id,
    webhook: targetFromRoom({
      url: room.webhook_url,
      threadId: room.webhook_thread_id,
    }),
  };
}

export async function handleAnonAuth(
  raw: AuthAnon,
  pending: { id: string; sendRaw: (s: string) => void; close: () => void },
  deps: AuthDeps,
): Promise<AuthResolution> {
  const room = await resolveRoomOrError(deps.rooms, raw.roomName);
  if (!room.ok) return { ok: false, reason: room.reason };

  logger.info(
    {
      clientVersion: raw.clientVersion ?? "unknown",
      flow: "anon",
      reused: !!raw.subject,
    },
    "client connected",
  );

  const nickResult = validateNickname(raw.nickname);
  if (!nickResult.ok) return { ok: false, reason: "nickname_invalid" };

  let user;
  if (raw.subject) {
    const existing = await deps.users.findByProviderSubject("anon", raw.subject);
    user =
      existing ??
      (await deps.users.createWithDiscriminator({
        provider: "anon",
        subject: raw.subject,
        nickname: nickResult.value,
      }));
  } else {
    user = await deps.users.createWithDiscriminator({
      provider: "anon",
      subject: `anon:${randomUUID()}`,
      nickname: nickResult.value,
    });
  }

  const conn: AuthedConnection = {
    id: pending.id,
    userId: user.id,
    roomId: room.roomId,
    nickname: user.nickname,
    discriminator: user.discriminator,
    color: user.color,
    webhook: room.webhook,
    sendRaw: pending.sendRaw,
    close: pending.close,
    kind: "real",
  };
  return { ok: true, conn };
}

export async function handleOAuthAuth(
  raw: AuthOAuth,
  pending: { id: string; sendRaw: (s: string) => void; close: () => void },
  deps: AuthDeps,
): Promise<AuthResolution> {
  const room = await resolveRoomOrError(deps.rooms, raw.roomName);
  if (!room.ok) return { ok: false, reason: room.reason };

  logger.info(
    { clientVersion: raw.clientVersion ?? "unknown", flow: "oauth" },
    "client connected",
  );

  let payload: { userId: string; provider: string };
  try {
    payload = verifySessionToken(raw.token, deps.config.jwtSigningKey);
  } catch (err) {
    logger.warn({ err }, "oauth jwt verify failed");
    return { ok: false, reason: "invalid_token" };
  }

  const user = await deps.users.findById(payload.userId);
  if (!user) return { ok: false, reason: "invalid_token" };

  const conn: AuthedConnection = {
    id: pending.id,
    userId: user.id,
    roomId: room.roomId,
    nickname: user.nickname,
    discriminator: user.discriminator,
    color: user.color,
    webhook: room.webhook,
    sendRaw: pending.sendRaw,
    close: pending.close,
    kind: "real",
  };
  return { ok: true, conn };
}

export async function admitConnection(
  conn: AuthedConnection,
  deps: AuthDeps,
  roomName: string,
): Promise<void> {
  deps.registry.add(conn);
  const okMsg: ServerMessage = {
    type: "auth.ok",
    user: {
      id: conn.userId,
      nickname: conn.nickname,
      discriminator: conn.discriminator,
    },
    latestClientVersion: LATEST_CLIENT_VERSION,
  };
  send(conn, okMsg);

  const recent = await deps.messages.listRecent(conn.roomId, 50);
  const snapshot: ServerMessage = {
    type: "room.snapshot",
    room: { id: conn.roomId, name: roomName },
    messages: recent,
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  send(conn, snapshot);

  const joinBody = `${conn.nickname}#${conn.discriminator} joined`;
  const joinNotice: ServerMessage = {
    type: "system",
    event: "join",
    body: joinBody,
  };
  broadcastToRoom(deps.registry, conn.roomId, joinNotice, conn);
  notify(conn.webhook, formatSystem("join", joinBody));

  const presence: ServerMessage = {
    type: "presence",
    onlineUsers: presenceFor(deps.registry, conn.roomId),
  };
  broadcastToRoom(deps.registry, conn.roomId, presence);
}
