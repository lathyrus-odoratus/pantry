import type { DB } from "./client.js";
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
    r.reply_to_body &&
    r.reply_to_author_nickname &&
    r.reply_to_author_discriminator &&
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
    await this.db`
      INSERT INTO messages (
        id, room_id, user_id, author_nickname, author_discriminator, body, created_at,
        reply_to_message_id, reply_to_author_nickname, reply_to_author_discriminator,
        reply_to_body, reply_to_created_at
      ) VALUES (
        ${input.id}, ${input.roomId}, ${input.userId}, ${input.authorNickname},
        ${input.authorDiscriminator}, ${input.body}, ${input.createdAt},
        ${input.replyTo?.id ?? null}, ${input.replyTo?.author.nickname ?? null},
        ${input.replyTo?.author.discriminator ?? null}, ${input.replyTo?.body ?? null},
        ${input.replyTo?.createdAt ?? null}
      )
    `;
  }

  async findInRoom(messageId: string, roomId: string): Promise<Message | null> {
    const [row] = await this.db<MessageRow[]>`
      SELECT * FROM messages WHERE id = ${messageId} AND room_id = ${roomId}
    `;
    return row ? rowToMessage(row) : null;
  }

  /**
   * Most recent `limit` messages in a room, returned in ascending time order.
   */
  async listRecent(roomId: string, limit = 50): Promise<Message[]> {
    const rows = await this.db<MessageRow[]>`
      SELECT * FROM messages WHERE room_id = ${roomId}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.reverse().map(rowToMessage);
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
    // Compare against the pivot inside SQL so timestamptz keeps its full
    // (microsecond) precision; an unknown pivot yields no rows.
    const rows = await this.db<MessageRow[]>`
      SELECT * FROM messages
      WHERE room_id = ${roomId}
        AND created_at < (SELECT created_at FROM messages WHERE id = ${beforeMessageId})
      ORDER BY created_at DESC LIMIT ${limit + 1}
    `;
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : [...rows];
    return {
      messages: sliced.reverse().map(rowToMessage),
      hasMore,
    };
  }
}
