import { randomUUID } from "node:crypto";
import type { Message, AuthProvider } from "@pantry/shared";
import type { RoomRow } from "../../db/rooms.js";
import type { UserRow } from "../../db/users.js";
import { generateDiscriminator } from "../../utils/discriminator.js";

// In-memory stand-ins for RoomsRepo / UsersRepo / MessagesRepo. The flow
// tests pass these into the real Fastify + WS server so everything above
// the DB boundary runs for real — only the storage layer is faked. This
// keeps the test path off prod Supabase without giving up the wiring
// coverage that's the whole point of these tests.
//
// Methods implemented are only the ones the tested handler paths reach;
// other Repo methods are intentionally absent. The type assertions at
// construction site (`as unknown as RoomsRepo` etc.) work because the test
// never invokes the un-implemented methods.

const MAX_DISCRIMINATOR_RETRIES = 8;

export class FakeRoomsRepo {
  private rooms: RoomRow[] = [];

  async findByName(name: string): Promise<RoomRow | null> {
    return this.rooms.find((r) => r.name === name) ?? null;
  }

  async create(name: string, createdBy?: string): Promise<RoomRow> {
    const row: RoomRow = {
      id: randomUUID(),
      name,
      created_at: new Date().toISOString(),
      created_by: createdBy ?? null,
      webhook_url: null,
      webhook_thread_id: null,
      closed_at: null,
    };
    this.rooms.push(row);
    return row;
  }

  async deleteByName(name: string): Promise<void> {
    this.rooms = this.rooms.filter((r) => r.name !== name);
  }
}

export class FakeUsersRepo {
  private users: UserRow[] = [];

  async findByProviderSubject(
    provider: AuthProvider,
    subject: string,
  ): Promise<UserRow | null> {
    return (
      this.users.find(
        (u) => u.auth_provider === provider && u.auth_subject === subject,
      ) ?? null
    );
  }

  async createWithDiscriminator(input: {
    provider: AuthProvider;
    subject: string;
    nickname: string;
  }): Promise<UserRow> {
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      const collides = this.users.some(
        (u) => u.nickname === input.nickname && u.discriminator === discriminator,
      );
      if (collides) continue;
      const row: UserRow = {
        id: randomUUID(),
        auth_provider: input.provider,
        auth_subject: input.subject,
        nickname: input.nickname,
        discriminator,
        color: null,
        is_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.users.push(row);
      return row;
    }
    throw new Error(
      `could not allocate discriminator after ${MAX_DISCRIMINATOR_RETRIES} attempts`,
    );
  }

  async renameWithDiscriminatorRetry(
    userId: string,
    newNickname: string,
  ): Promise<UserRow> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`user ${userId} not found`);

    const collides = (nick: string, disc: string): boolean =>
      this.users.some(
        (u) => u.id !== userId && u.nickname === nick && u.discriminator === disc,
      );

    if (!collides(newNickname, user.discriminator)) {
      user.nickname = newNickname;
      user.updated_at = new Date().toISOString();
      return user;
    }

    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      if (collides(newNickname, discriminator)) continue;
      user.nickname = newNickname;
      user.discriminator = discriminator;
      user.updated_at = new Date().toISOString();
      return user;
    }
    throw new Error(
      `could not allocate discriminator after ${MAX_DISCRIMINATOR_RETRIES} attempts`,
    );
  }
}

type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  author_nickname: string;
  author_discriminator: string;
  body: string;
  created_at: string;
};

export class FakeMessagesRepo {
  private rows: MessageRow[] = [];

  async insert(input: {
    id: string;
    roomId: string;
    userId: string;
    authorNickname: string;
    authorDiscriminator: string;
    body: string;
    createdAt: string;
  }): Promise<void> {
    this.rows.push({
      id: input.id,
      room_id: input.roomId,
      user_id: input.userId,
      author_nickname: input.authorNickname,
      author_discriminator: input.authorDiscriminator,
      body: input.body,
      created_at: input.createdAt,
    });
  }

  async listRecent(roomId: string, limit = 50): Promise<Message[]> {
    return this.rows
      .filter((r) => r.room_id === roomId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit)
      .map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at,
        author: {
          nickname: r.author_nickname,
          discriminator: r.author_discriminator,
        },
      }));
  }
}
