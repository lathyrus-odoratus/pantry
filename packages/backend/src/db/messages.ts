import type { DB } from "./supabase.js";
import type { Message } from "@pantry/shared";

export type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  author_nickname: string;
  author_discriminator: string;
  body: string;
  created_at: string;
  reply_to_message_id: string | null;
  reply_to_author_nickname: string | null;
  reply_to_author_discriminator: string | null;
  reply_to_body: string | null;
  reply_to_created_at: string | null;
};

function rowToMessage(r: MessageRow): Message {
  const message: Message = {
    id: r.id,
    body: r.body,
    // Postgres timestamptz serializes as "+00:00"; normalize to "Z" so the
    // client's zod schema (which uses .datetime() without offset support) accepts it.
    createdAt: new Date(r.created_at).toISOString(),
    author: {
      nickname: r.author_nickname,
      discriminator: r.author_discriminator,
    },
  };
  if (
    r.reply_to_message_id &&
    r.reply_to_author_nickname &&
    r.reply_to_author_discriminator &&
    r.reply_to_body &&
    r.reply_to_created_at
  ) {
    message.replyTo = {
      id: r.reply_to_message_id,
      body: r.reply_to_body,
      createdAt: new Date(r.reply_to_created_at).toISOString(),
      author: {
        nickname: r.reply_to_author_nickname,
        discriminator: r.reply_to_author_discriminator,
      },
    };
  }
  return message;
}

export class MessagesRepo {
  constructor(private db: DB) {}

  async insert(input: {
    id: string;
    roomId: string;
    userId: string;
    authorNickname: string;
    authorDiscriminator: string;
    body: string;
    createdAt: string;
    replyTo?: Message["replyTo"];
  }): Promise<void> {
    const { error } = await this.db.from("messages").insert({
      id: input.id,
      room_id: input.roomId,
      user_id: input.userId,
      author_nickname: input.authorNickname,
      author_discriminator: input.authorDiscriminator,
      body: input.body,
      created_at: input.createdAt,
      reply_to_message_id: input.replyTo?.id ?? null,
      reply_to_author_nickname: input.replyTo?.author.nickname ?? null,
      reply_to_author_discriminator: input.replyTo?.author.discriminator ?? null,
      reply_to_body: input.replyTo?.body ?? null,
      reply_to_created_at: input.replyTo?.createdAt ?? null,
    });
    if (error) throw error;
  }

  async findInRoom(messageId: string, roomId: string): Promise<Message | null> {
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .eq("room_id", roomId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToMessage(data as MessageRow);
  }

  /**
   * Most recent `limit` messages in a room, returned in ascending time order.
   */
  async listRecent(roomId: string, limit = 50): Promise<Message[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data ?? []).reverse() as MessageRow[];
    return rows.map(rowToMessage);
  }

  /**
   * Messages strictly older than `beforeMessageId`, returned ascending. Used for
   * scroll-back pagination.
   */
  async listBefore(
    roomId: string,
    beforeMessageId: string,
    limit = 50,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const { data: pivot, error: pivotErr } = await this.db
      .from("messages")
      .select("created_at")
      .eq("id", beforeMessageId)
      .maybeSingle();
    if (pivotErr) throw pivotErr;
    if (!pivot) return { messages: [], hasMore: false };
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .lt("created_at", pivot.created_at)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;
    const rows = (data ?? []) as MessageRow[];
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    return {
      messages: sliced.reverse().map(rowToMessage),
      hasMore,
    };
  }
}
