import type {
  AuthAdmin,
  AdminRoomCreate,
  AdminRoomClose,
  AdminRoomReopen,
  AdminRoomDelete,
  AdminRoomSummary,
  ServerMessage,
} from "@pantry/shared";

import type { Config } from "../../config.js";
import { logger } from "../../logger.js";
import { LATEST_CLIENT_VERSION } from "../../version.js";
import { verifySessionToken } from "../../utils/jwt.js";
import type { RoomsRepo } from "../../db/rooms.js";
import type { UsersRepo } from "../../db/users.js";
import type { ConnectionRegistry } from "../connection-registry.js";

export type AdminDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  registry: ConnectionRegistry;
};

export type AdminSession = {
  userId: string;
  nickname: string;
  discriminator: string;
};

export type AdminAuthResolution =
  | { ok: true; session: AdminSession }
  | { ok: false; reason: "invalid_token" | "not_admin" };

export async function handleAdminAuth(
  raw: AuthAdmin,
  deps: AdminDeps,
): Promise<AdminAuthResolution> {
  let payload: { userId: string; provider: string };
  try {
    payload = verifySessionToken(raw.token, deps.config.jwtSigningKey);
  } catch (err) {
    logger.warn({ err }, "admin jwt verify failed");
    return { ok: false, reason: "invalid_token" };
  }

  // Admin scene is Discord-only by design — the spec said "支援用 discord 登入".
  if (payload.provider !== "discord") {
    return { ok: false, reason: "not_admin" };
  }

  const user = await deps.users.findById(payload.userId);
  if (!user) return { ok: false, reason: "invalid_token" };
  if (!user.is_admin) return { ok: false, reason: "not_admin" };

  return {
    ok: true,
    session: {
      userId: user.id,
      nickname: user.nickname,
      discriminator: user.discriminator,
    },
  };
}

export function makeAdminAuthOk(session: AdminSession): ServerMessage {
  return {
    type: "admin.auth.ok",
    user: {
      id: session.userId,
      nickname: session.nickname,
      discriminator: session.discriminator,
    },
    latestClientVersion: LATEST_CLIENT_VERSION,
  };
}

export async function buildRoomsSnapshot(
  deps: Pick<AdminDeps, "rooms" | "registry">,
): Promise<AdminRoomSummary[]> {
  const rows = await deps.rooms.list();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    onlineCount: deps.registry.listByRoom(r.id).length,
  }));
}

export async function handleAdminRoomCreate(
  raw: AdminRoomCreate,
  deps: Pick<AdminDeps, "rooms">,
): Promise<ServerMessage> {
  const existing = await deps.rooms.findByName(raw.name);
  if (existing) {
    return {
      type: "admin.error",
      op: "create",
      code: "already_exists",
      message: `Room "${raw.name}" already exists.`,
    };
  }
  await deps.rooms.create(raw.name);
  return { type: "admin.ok", op: "create", roomName: raw.name };
}

export async function handleAdminRoomClose(
  raw: AdminRoomClose,
  deps: Pick<AdminDeps, "rooms">,
): Promise<ServerMessage> {
  const existing = await deps.rooms.findByName(raw.name);
  if (!existing) {
    return {
      type: "admin.error",
      op: "close",
      code: "not_found",
      message: `Room "${raw.name}" not found.`,
    };
  }
  if (existing.closed_at) {
    return { type: "admin.ok", op: "close", roomName: raw.name };
  }
  await deps.rooms.close(raw.name);
  return { type: "admin.ok", op: "close", roomName: raw.name };
}

export async function handleAdminRoomReopen(
  raw: AdminRoomReopen,
  deps: Pick<AdminDeps, "rooms">,
): Promise<ServerMessage> {
  const existing = await deps.rooms.findByName(raw.name);
  if (!existing) {
    return {
      type: "admin.error",
      op: "reopen",
      code: "not_found",
      message: `Room "${raw.name}" not found.`,
    };
  }
  if (!existing.closed_at) {
    return { type: "admin.ok", op: "reopen", roomName: raw.name };
  }
  await deps.rooms.reopen(raw.name);
  return { type: "admin.ok", op: "reopen", roomName: raw.name };
}

export async function handleAdminRoomDelete(
  raw: AdminRoomDelete,
  deps: Pick<AdminDeps, "rooms">,
): Promise<ServerMessage> {
  const existing = await deps.rooms.findByName(raw.name);
  if (!existing) {
    return {
      type: "admin.error",
      op: "delete",
      code: "not_found",
      message: `Room "${raw.name}" not found.`,
    };
  }
  await deps.rooms.deleteByName(raw.name);
  return { type: "admin.ok", op: "delete", roomName: raw.name };
}
