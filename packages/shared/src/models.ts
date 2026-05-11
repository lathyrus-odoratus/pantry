import { z } from "zod";

export const AuthorSchema = z.object({
  nickname: z.string(),
  discriminator: z.string().length(4),
});
export type Author = z.infer<typeof AuthorSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  author: AuthorSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
});
export type Room = z.infer<typeof RoomSchema>;

export const UserSchema = z.object({
  nickname: z.string(),
  discriminator: z.string().length(4),
});
export type User = z.infer<typeof UserSchema>;

export const AuthProvider = z.enum(["anon", "github", "google", "discord"]);
export type AuthProvider = z.infer<typeof AuthProvider>;
