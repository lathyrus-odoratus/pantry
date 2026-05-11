import { z } from "zod";
import { MessageSchema, UserSchema } from "./models.js";

// ─── Client → Server ──────────────────────────────────────────────────────────

export const AuthAnonSchema = z.object({
  type: z.literal("auth.anon"),
  nickname: z.string().min(1).max(20),
  roomName: z.string().min(1).max(64),
});

export const AuthOAuthSchema = z.object({
  type: z.literal("auth.oauth"),
  token: z.string(),
  roomName: z.string().min(1).max(64),
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

export const ClientMessageSchema = z.discriminatedUnion("type", [
  AuthAnonSchema,
  AuthOAuthSchema,
  MessageSendSchema,
  NickChangeSchema,
  HistoryLoadSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type AuthAnon = z.infer<typeof AuthAnonSchema>;
export type AuthOAuth = z.infer<typeof AuthOAuthSchema>;
export type MessageSend = z.infer<typeof MessageSendSchema>;
export type NickChange = z.infer<typeof NickChangeSchema>;
export type HistoryLoad = z.infer<typeof HistoryLoadSchema>;

// ─── Server → Client ──────────────────────────────────────────────────────────

export const AuthOkSchema = z.object({
  type: z.literal("auth.ok"),
  user: z.object({
    id: z.string().uuid(),
    nickname: z.string(),
    discriminator: z.string().length(4),
  }),
});

export const AuthErrorReason = z.enum([
  "room_not_found",
  "invalid_token",
  "nickname_invalid",
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
});

export const NewMessageSchema = z.object({
  type: z.literal("message"),
  data: MessageSchema,
});

export const SystemMessageSchema = z.object({
  type: z.literal("system"),
  event: z.enum(["join", "leave", "rename"]),
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

export const ServerMessageSchema = z.discriminatedUnion("type", [
  AuthOkSchema,
  AuthErrorSchema,
  RoomSnapshotSchema,
  NewMessageSchema,
  SystemMessageSchema,
  PresenceSchema,
  HistoryResponseSchema,
  ErrorSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
