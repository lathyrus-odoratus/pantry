import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "./client.js";
import { migrate } from "./migrate.js";
import { RoomsRepo } from "./rooms.js";
import { UsersRepo } from "./users.js";
import { MessagesRepo } from "./messages.js";
import type { Config } from "../config.js";

vi.mock("../utils/discriminator.js", () => ({ generateDiscriminator: vi.fn(() => "aaaa") }));
const { generateDiscriminator } = await import("../utils/discriminator.js");
const nextDiscriminators = (...ds: string[]) => {
  for (const d of ds) vi.mocked(generateDiscriminator).mockReturnValueOnce(d);
};

// Runs against a real Postgres. TEST_DATABASE_URL (not DATABASE_URL, which .env
// may point at prod) must be a throwaway database: every test truncates it.
const url = process.env.TEST_DATABASE_URL;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe.skipIf(!url)("Postgres repos", () => {
  let db: DB;
  let rooms: RoomsRepo;
  let users: UsersRepo;
  let messages: MessagesRepo;

  beforeAll(async () => {
    db = createDb({ databaseUrl: url } as Config);
    await db`DROP TABLE IF EXISTS messages, users, rooms, schema_migrations`;
    await migrate(db);
    rooms = new RoomsRepo(db);
    users = new UsersRepo(db);
    messages = new MessagesRepo(db);
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE messages, users, rooms`;
  });

  it("migrate is idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  describe("rooms", () => {
    it("creates, finds, and lists rooms with ISO timestamps", async () => {
      const room = await rooms.create("lobby");
      expect(room.name).toBe("lobby");
      expect(room.created_at).toMatch(ISO);
      expect(room.closed_at).toBeNull();
      expect(await rooms.findByName("lobby")).toEqual(room);
      expect(await rooms.findByName("nope")).toBeNull();
      await rooms.create("second");
      expect((await rooms.list()).map((r) => r.name)).toEqual(["lobby", "second"]);
    });

    it("closes, reopens, and deletes", async () => {
      await rooms.create("lobby");
      expect((await rooms.close("lobby")).closed_at).toMatch(ISO);
      expect((await rooms.reopen("lobby")).closed_at).toBeNull();
      await rooms.deleteByName("lobby");
      expect(await rooms.findByName("lobby")).toBeNull();
    });

    it("throws when closing a missing room", async () => {
      await expect(rooms.close("nope")).rejects.toThrow(/not found/);
    });
  });

  describe("users", () => {
    it("creates and finds users", async () => {
      nextDiscriminators("ab12");
      const u = await users.createWithDiscriminator({ provider: "anon", subject: "s1", nickname: "Alice" });
      expect(u).toMatchObject({ nickname: "Alice", discriminator: "ab12", is_admin: false, color: null });
      expect(await users.findByProviderSubject("anon", "s1")).toEqual(u);
      expect(await users.findById(u.id)).toEqual(u);
      expect(await users.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
    });

    it("retries the discriminator on a (nickname, discriminator) collision", async () => {
      nextDiscriminators("aaaa", "aaaa", "bbbb");
      await users.createWithDiscriminator({ provider: "anon", subject: "s1", nickname: "Alice" });
      const second = await users.createWithDiscriminator({ provider: "anon", subject: "s2", nickname: "Alice" });
      expect(second.discriminator).toBe("bbbb");
    });

    it("renames, keeping the discriminator unless it collides", async () => {
      nextDiscriminators("aaaa", "cccc", "aaaa");
      await users.createWithDiscriminator({ provider: "anon", subject: "s1", nickname: "Alice" });
      const bob = await users.createWithDiscriminator({ provider: "anon", subject: "s2", nickname: "Bob" });
      // Alice#aaaa exists, but Bob is cccc: no collision, discriminator kept
      expect((await users.renameWithDiscriminatorRetry(bob.id, "Alice")).discriminator).toBe("cccc");
      const carol = await users.createWithDiscriminator({ provider: "anon", subject: "s3", nickname: "Carol" });
      // Carol is aaaa: renaming to Alice collides with Alice#aaaa, so a new one is drawn
      nextDiscriminators("eeee");
      expect((await users.renameWithDiscriminatorRetry(carol.id, "Alice")).discriminator).toBe("eeee");
    });

    it("sets and clears color, enforcing the format", async () => {
      const u = await users.createWithDiscriminator({ provider: "anon", subject: "s1", nickname: "Alice" });
      await users.setColor(u.id, "#FF0000");
      expect((await users.findById(u.id))?.color).toBe("#FF0000");
      await users.setColor(u.id, null);
      expect((await users.findById(u.id))?.color).toBeNull();
      await expect(users.setColor(u.id, "red")).rejects.toThrow();
    });
  });

  describe("messages", () => {
    async function seed() {
      const room = await rooms.create("lobby");
      const user = await users.createWithDiscriminator({ provider: "anon", subject: "s1", nickname: "Alice" });
      const insert = (i: number, replyTo?: Parameters<MessagesRepo["insert"]>[0]["replyTo"]) =>
        messages.insert({
          id: crypto.randomUUID(),
          roomId: room.id,
          userId: user.id,
          authorNickname: "Alice",
          authorDiscriminator: user.discriminator,
          body: `m${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
          replyTo,
        });
      return { room, insert };
    }

    it("lists recent messages in ascending order", async () => {
      const { room, insert } = await seed();
      for (let i = 0; i < 5; i++) await insert(i);
      const recent = await messages.listRecent(room.id, 3);
      expect(recent.map((m) => m.body)).toEqual(["m2", "m3", "m4"]);
      expect(recent[0]!.createdAt).toBe("2026-01-01T00:00:02.000Z");
    });

    it("pages backwards from a pivot", async () => {
      const { room, insert } = await seed();
      for (let i = 0; i < 5; i++) await insert(i);
      const [pivot] = await messages.listRecent(room.id, 1);
      const page1 = await messages.listBefore(room.id, pivot!.id, 2);
      expect(page1.messages.map((m) => m.body)).toEqual(["m2", "m3"]);
      expect(page1.hasMore).toBe(true);
      const page2 = await messages.listBefore(room.id, page1.messages[0]!.id, 2);
      expect(page2.messages.map((m) => m.body)).toEqual(["m0", "m1"]);
      expect(page2.hasMore).toBe(false);
      expect(await messages.listBefore(room.id, "00000000-0000-0000-0000-000000000000")).toEqual({
        messages: [],
        hasMore: false,
      });
    });

    it("stores replies and finds a message within its room", async () => {
      const { room, insert } = await seed();
      await insert(0);
      const [original] = await messages.listRecent(room.id, 1);
      await insert(1, original);
      const [reply] = await messages.listRecent(room.id, 1);
      expect(reply!.replyTo).toEqual(original);
      expect(await messages.findInRoom(reply!.id, room.id)).toEqual(reply);
      const other = await rooms.create("other");
      expect(await messages.findInRoom(reply!.id, other.id)).toBeNull();
    });
  });
});
