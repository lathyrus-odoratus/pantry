import { z } from "zod";
import { HexColorSchema, MessageSchema, UserSchema } from "./models.js";
import { mapV1Schema } from "./map.js";

// ─── Client → Server ──────────────────────────────────────────────────────────

export const AuthAnonSchema = z.object({
  type: z.literal("auth.anon"),
  nickname: z.string().min(1).max(20),
  roomName: z.string().min(1).max(64),
  clientVersion: z.string().optional(),
  // Client-generated stable identity. When provided, the server reuses or
  // creates a users row keyed on (provider=anon, subject) so re-launches keep
  // the same nickname/discriminator instead of minting a fresh "joined" user.
  subject: z
    .string()
    .min(1)
    .max(128)
    .regex(/^anon:[A-Za-z0-9._-]+$/)
    .optional(),
});

export const AuthOAuthSchema = z.object({
  type: z.literal("auth.oauth"),
  token: z.string(),
  roomName: z.string().min(1).max(64),
  clientVersion: z.string().optional(),
});

export const MessageSendSchema = z.object({
  type: z.literal("message.send"),
  body: z.string().min(1).max(2000),
});

export const NickChangeSchema = z.object({
  type: z.literal("nick.change"),
  newNickname: z.string().min(1).max(20),
});

export const HistoryLoadSchema = z.object({
  type: z.literal("history.load"),
  beforeId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const ColorChangeSchema = z.object({
  type: z.literal("color.change"),
  color: HexColorSchema.nullable(),
});

export const WorldOpenSchema = z.object({
  type: z.literal("world.open"),
});

// Bare command. The dice spec is whatever the NPC last requested via a
// [[roll:…]] marker in its response; the server keeps the pending spec in
// the active world's state and consumes it on /roll.
export const DiceRollSchema = z.object({
  type: z.literal("dice.roll"),
});

// ── Admin mode ──
// `--admin` on the client enters a pure-admin connection: no roomName, no
// chat. The server requires a Discord JWT whose user.is_admin = true.

export const AuthAdminSchema = z.object({
  type: z.literal("auth.admin"),
  token: z.string(),
  clientVersion: z.string().optional(),
});

export const AdminRoomsListSchema = z.object({
  type: z.literal("admin.rooms.list"),
});

export const AdminRoomCreateSchema = z.object({
  type: z.literal("admin.room.create"),
  name: z.string().min(1).max(64),
});

export const AdminRoomCloseSchema = z.object({
  type: z.literal("admin.room.close"),
  name: z.string().min(1).max(64),
});

export const AdminRoomReopenSchema = z.object({
  type: z.literal("admin.room.reopen"),
  name: z.string().min(1).max(64),
});

export const AdminRoomDeleteSchema = z.object({
  type: z.literal("admin.room.delete"),
  name: z.string().min(1).max(64),
});

export const GameStartSchema = z.object({
  type: z.literal("game.start"),
});

export const GameInputSchema = z.object({
  type: z.literal("game.input"),
  key: z.enum(["w", "a", "s", "d", "bomb", "quit"]),
});

// ── CA-bomb (room-wide spectatable game; see specs/2026-05-29-ca-bomb-room) ──
export const CabombStartSchema = z.object({
  type: z.literal("cabomb.start"),
});
export const CabombInputSchema = z.object({
  type: z.literal("cabomb.input"),
  key: z.enum(["w", "a", "s", "d", "bomb", "quit"]),
});
export const CabombWatchSchema = z.object({
  type: z.literal("cabomb.watch"),
});
export const CabombLeaveSchema = z.object({
  type: z.literal("cabomb.leave"),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  AuthAnonSchema,
  AuthOAuthSchema,
  AuthAdminSchema,
  MessageSendSchema,
  NickChangeSchema,
  HistoryLoadSchema,
  ColorChangeSchema,
  WorldOpenSchema,
  DiceRollSchema,
  AdminRoomsListSchema,
  AdminRoomCreateSchema,
  AdminRoomCloseSchema,
  AdminRoomReopenSchema,
  AdminRoomDeleteSchema,
  GameStartSchema,
  GameInputSchema,
  CabombStartSchema,
  CabombInputSchema,
  CabombWatchSchema,
  CabombLeaveSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type AuthAnon = z.infer<typeof AuthAnonSchema>;
export type AuthOAuth = z.infer<typeof AuthOAuthSchema>;
export type AuthAdmin = z.infer<typeof AuthAdminSchema>;
export type MessageSend = z.infer<typeof MessageSendSchema>;
export type NickChange = z.infer<typeof NickChangeSchema>;
export type HistoryLoad = z.infer<typeof HistoryLoadSchema>;
export type ColorChange = z.infer<typeof ColorChangeSchema>;
export type WorldOpen = z.infer<typeof WorldOpenSchema>;
export type DiceRoll = z.infer<typeof DiceRollSchema>;
export type AdminRoomsList = z.infer<typeof AdminRoomsListSchema>;
export type AdminRoomCreate = z.infer<typeof AdminRoomCreateSchema>;
export type AdminRoomClose = z.infer<typeof AdminRoomCloseSchema>;
export type AdminRoomReopen = z.infer<typeof AdminRoomReopenSchema>;
export type AdminRoomDelete = z.infer<typeof AdminRoomDeleteSchema>;
export type GameStart = z.infer<typeof GameStartSchema>;
export type GameInput = z.infer<typeof GameInputSchema>;
export type CabombStart = z.infer<typeof CabombStartSchema>;
export type CabombInput = z.infer<typeof CabombInputSchema>;
export type CabombWatch = z.infer<typeof CabombWatchSchema>;
export type CabombLeave = z.infer<typeof CabombLeaveSchema>;

// ─── Server → Client ──────────────────────────────────────────────────────────

export const AuthOkSchema = z.object({
  type: z.literal("auth.ok"),
  user: z.object({
    id: z.string().uuid(),
    nickname: z.string(),
    discriminator: z.string().length(4),
  }),
  latestClientVersion: z.string().optional(),
});

export const AuthErrorReason = z.enum([
  "room_not_found",
  "room_closed",
  "invalid_token",
  "nickname_invalid",
  "not_admin",
]);

export const AuthErrorSchema = z.object({
  type: z.literal("auth.error"),
  reason: AuthErrorReason,
});

export const RoomSnapshotSchema = z.object({
  type: z.literal("room.snapshot"),
  room: z.object({ id: z.string().uuid(), name: z.string() }),
  messages: z.array(MessageSchema),
  onlineUsers: z.array(UserSchema),
  // Set when a CA-bomb game is in progress, so a joiner/reconnect can show the
  // status-bar "/watch" hint immediately. Optional for backward compatibility.
  activeGame: z
    .object({ kind: z.literal("cabomb"), by: z.string() })
    .nullable()
    .optional(),
});

export const NewMessageSchema = z.object({
  type: z.literal("message"),
  data: MessageSchema,
});

export const SystemMessageSchema = z.object({
  type: z.literal("system"),
  event: z.enum([
    "join",
    "leave",
    "rename",
    "announce",
    "world.open",
    "world.end",
    "dice",
  ]),
  body: z.string(),
});

export const PresenceSchema = z.object({
  type: z.literal("presence"),
  onlineUsers: z.array(UserSchema),
});

export const HistoryResponseSchema = z.object({
  type: z.literal("history"),
  messages: z.array(MessageSchema),
  hasMore: z.boolean(),
});

export const ErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string().optional(),
});

export const WorldStateSchema = z.object({
  type: z.literal("world.state"),
  active: z.boolean(),
  creditUsed: z.number().int().nonnegative(),
  creditTotal: z.number().int().positive(),
});

// ── Admin mode (server → client) ──

export const AdminAuthOkSchema = z.object({
  type: z.literal("admin.auth.ok"),
  user: z.object({
    id: z.string().uuid(),
    nickname: z.string(),
    discriminator: z.string().length(4),
  }),
  latestClientVersion: z.string().optional(),
});

export const AdminRoomSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  onlineCount: z.number().int().nonnegative(),
});

export const AdminRoomsSchema = z.object({
  type: z.literal("admin.rooms"),
  rooms: z.array(AdminRoomSummarySchema),
});

export const AdminOkSchema = z.object({
  type: z.literal("admin.ok"),
  op: z.enum(["create", "close", "reopen", "delete"]),
  roomName: z.string(),
});

export const AdminErrorSchema = z.object({
  type: z.literal("admin.error"),
  op: z.enum(["create", "close", "reopen", "delete", "list"]),
  code: z.string(),
  message: z.string().optional(),
});

export const GameStateSchema = z.object({
  type: z.literal("game.state"),
  map: z.array(z.array(z.string())),
  player: z.object({ x: z.number().int(), y: z.number().int(), hp: z.number().int() }),
  bomb: z.object({ x: z.number().int(), y: z.number().int(), exploded: z.boolean() }).nullable(),
  playerNickname: z.string(),
  playerDiscriminator: z.string(),
  tick: z.number().int().nonnegative(),
});

export const GameOverSchema = z.object({
  type: z.literal("game.over"),
  result: z.enum(["win", "loss", "quit"]),
  playerNickname: z.string(),
  playerDiscriminator: z.string(),
});

export const GameErrorSchema = z.object({
  type: z.literal("game.error"),
  reason: z.enum(["already_active", "not_your_game"]),
});

// ── CA-bomb server → client ──
const CabombStatePayloadSchema = z.object({
  map: mapV1Schema,
  player: z.object({
    x: z.number().int(),
    y: z.number().int(),
    hp: z.number().int(),
    bombCap: z.number().int(),
    range: z.number().int(),
  }),
  bombs: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  blasts: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  enemies: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  items: z.array(
    z.object({
      x: z.number().int(),
      y: z.number().int(),
      type: z.enum(["heart", "bomb", "range"]),
    }),
  ),
  status: z.enum(["playing", "win", "loss"]),
});

// Broadcast to the whole room (drives the status-bar hint + system message).
export const CabombStartedSchema = z.object({
  type: z.literal("cabomb.started"),
  by: z.string(),
});
// Sent only to the driver + registered spectators.
export const CabombStateSchema = z.object({
  type: z.literal("cabomb.state"),
  by: z.string(),
  state: CabombStatePayloadSchema,
});
// Broadcast to the whole room.
export const CabombOverSchema = z.object({
  type: z.literal("cabomb.over"),
  result: z.enum(["win", "loss", "quit"]),
  by: z.string(),
  summary: z.string().optional(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  AuthOkSchema,
  AuthErrorSchema,
  RoomSnapshotSchema,
  NewMessageSchema,
  SystemMessageSchema,
  PresenceSchema,
  HistoryResponseSchema,
  ErrorSchema,
  WorldStateSchema,
  AdminAuthOkSchema,
  AdminRoomsSchema,
  AdminOkSchema,
  AdminErrorSchema,
  GameStateSchema,
  GameOverSchema,
  GameErrorSchema,
  CabombStartedSchema,
  CabombStateSchema,
  CabombOverSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type AdminRoomSummary = z.infer<typeof AdminRoomSummarySchema>;
export type AdminAuthOk = z.infer<typeof AdminAuthOkSchema>;
export type AdminRooms = z.infer<typeof AdminRoomsSchema>;
export type AdminOk = z.infer<typeof AdminOkSchema>;
export type AdminError = z.infer<typeof AdminErrorSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type GameOver = z.infer<typeof GameOverSchema>;
export type GameError = z.infer<typeof GameErrorSchema>;
export type CabombStarted = z.infer<typeof CabombStartedSchema>;
export type CabombStateMsg = z.infer<typeof CabombStateSchema>;
export type CabombOver = z.infer<typeof CabombOverSchema>;
