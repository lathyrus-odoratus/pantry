import type { DB } from "./supabase.js";
import type { Message } from "@chat-room/shared";

export type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  author_nickname: string;
  author_discriminator: string;
  body: string;
  created_at: string;
};

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: {
      nickname: r.author_nickname,
      discriminator: r.author_discriminator,
    },
  };
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
  }): Promise<void> {
    const { error } = await this.db.from("messages").insert({
      id: input.id,
      room_id: input.roomId,
      user_id: input.userId,
      author_nickname: input.authorNickname,
      author_discriminator: input.authorDiscriminator,
      body: input.body,
      created_at: input.createdAt,
    });
    if (error) throw error;
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
