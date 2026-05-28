import Fastify from "fastify";
import { describe, it, expect, vi } from "vitest";
import type { RoomsRepo } from "../db/rooms.js";
import type { UsersRepo } from "../db/users.js";
import type { MessagesRepo } from "../db/messages.js";
import { ConnectionRegistry, type AuthedConnection } from "../ws/connection-registry.js";
import { registerWebhookRoutes } from "./routes.js";

function fakeConn(roomId: string, sink: unknown[]): AuthedConnection {
  return {
    id: "conn-1",
    userId: "u-real-1",
    roomId,
    nickname: "Watcher",
    discriminator: "a1b2",
    color: null,
    webhook: null,
    sendRaw: (text: string) => sink.push(JSON.parse(text)),
    close: () => {},
    kind: "real",
  };
}

describe("POST /webhook/discord/messages", () => {
  it("broadcasts and persists message with [DC] nickname + hash discriminator", async () => {
    const app = Fastify({ logger: false });
    const registry = new ConnectionRegistry();
    const outbox: unknown[] = [];
    registry.add(fakeConn("room-1", outbox));

    const rooms = {
      findByName: vi.fn().mockResolvedValue({
        id: "room-1",
        name: "lobby",
        created_at: new Date().toISOString(),
        created_by: null,
        webhook_url: null,
        webhook_thread_id: null,
        closed_at: null,
      }),
    } as unknown as RoomsRepo;

    const users = {
      findById: vi.fn().mockResolvedValue({
        id: "2c0b8d96-b3dc-4ca8-a43d-b89dfb3d4a25",
      }),
    } as unknown as UsersRepo;

    const messages = {
      insert: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessagesRepo;

    await registerWebhookRoutes(app, {
      rooms,
      users,
      messages,
      registry,
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/discord/messages",
      payload: {
        roomName: "lobby",
        displayName: "AliceFromDiscordWithLongLongName",
        sourceUserId: "123456789012345678",
        message: "hello from dc",
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.author.nickname).toBe("AliceFromDiscordWithL[DC]");
    expect(body.author.discriminator).toMatch(/^[a-z0-9]{4}$/);

    expect(messages.insert).toHaveBeenCalledTimes(1);
    const inserted = (messages.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
      authorNickname: string;
      authorDiscriminator: string;
      body: string;
    };
    expect(inserted.authorNickname).toBe("AliceFromDiscordWithL[DC]");
    expect(inserted.authorDiscriminator).toMatch(/^[a-z0-9]{4}$/);
    expect(inserted.body).toBe("hello from dc");

    expect(outbox).toHaveLength(1);
    const outbound = outbox[0] as { type: string; data?: { author?: { nickname: string } } };
    expect(outbound.type).toBe("message");
    expect(outbound.data?.author?.nickname).toBe("AliceFromDiscordWithL[DC]");

    await app.close();
  });

  it("returns 409 when room is closed", async () => {
    const app = Fastify({ logger: false });
    await registerWebhookRoutes(app, {
      rooms: {
        findByName: vi.fn().mockResolvedValue({
          id: "room-1",
          closed_at: new Date().toISOString(),
          webhook_url: null,
          webhook_thread_id: null,
        }),
      } as unknown as RoomsRepo,
      users: { findById: vi.fn() } as unknown as UsersRepo,
      messages: { insert: vi.fn() } as unknown as MessagesRepo,
      registry: new ConnectionRegistry(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/discord/messages",
      payload: {
        roomName: "lobby",
        displayName: "Alice",
        sourceUserId: "123456789",
        message: "hello",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "room_closed" });
    await app.close();
  });

  it("returns 503 when bridge user is not configured", async () => {
    const app = Fastify({ logger: false });
    await registerWebhookRoutes(app, {
      rooms: {
        findByName: vi.fn().mockResolvedValue({
          id: "room-1",
          closed_at: null,
          webhook_url: null,
          webhook_thread_id: null,
        }),
      } as unknown as RoomsRepo,
      users: { findById: vi.fn().mockResolvedValue(null) } as unknown as UsersRepo,
      messages: { insert: vi.fn() } as unknown as MessagesRepo,
      registry: new ConnectionRegistry(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/discord/messages",
      payload: {
        roomName: "lobby",
        displayName: "Alice",
        sourceUserId: "123456789",
        message: "hello",
      },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "bridge_user_not_configured" });
    await app.close();
  });
});
