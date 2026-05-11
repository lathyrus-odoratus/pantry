import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { loadConfig } from "../../config.js";
import { createSupabaseClient } from "../../db/supabase.js";
import { RoomsRepo } from "../../db/rooms.js";
import { UsersRepo } from "../../db/users.js";
import { MessagesRepo } from "../../db/messages.js";
import { ConnectionRegistry } from "../../ws/connection-registry.js";
import { attachWebSocketServer } from "../../ws/server.js";
import { OAuthStateStore } from "../../auth/state-store.js";
import { registerAuthRoutes } from "../../auth/routes.js";
import type { ServerMessage } from "@chat-room/shared";

function next<T extends ServerMessage["type"]>(
  ws: WebSocket,
  type: T,
  timeoutMs = 4000,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === type) {
          ws.off("message", onMsg);
          clearTimeout(t);
          resolve(msg as Extract<ServerMessage, { type: T }>);
        }
      } catch {
        // ignore
      }
    };
    ws.on("message", onMsg);
  });
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("backend integration flow", () => {
  const roomName = `it-${randomUUID().slice(0, 8)}`;
  let baseUrl = "";
  let wsUrl = "";
  let app: ReturnType<typeof Fastify>;
  let rooms: RoomsRepo;

  beforeAll(async () => {
    const config = loadConfig();
    const db = createSupabaseClient(config);
    rooms = new RoomsRepo(db);
    const users = new UsersRepo(db);
    const messages = new MessagesRepo(db);
    const stateStore = new OAuthStateStore();
    const registry = new ConnectionRegistry();

    app = Fastify({ logger: false });
    app.get("/health", async () => ({ ok: true }));
    await registerAuthRoutes(app, { config, stateStore, usersRepo: users });
    // bind to ephemeral port
    await app.listen({ port: 0, host: "127.0.0.1" });
    attachWebSocketServer(app.server, { config, rooms, users, messages, registry });
    const addr = app.server.address();
    if (typeof addr !== "object" || !addr) throw new Error("no addr");
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
    await rooms.create(roomName);
  });

  afterAll(async () => {
    if (rooms) await rooms.deleteByName(roomName).catch(() => {});
    if (app) await app.close();
  });

  it("two anonymous users can join, exchange messages, and rename", async () => {
    const alice = await connect(wsUrl);
    alice.send(JSON.stringify({ type: "auth.anon", nickname: "Alice", roomName }));
    const aliceOk = await next(alice, "auth.ok");
    expect(aliceOk.user.nickname).toBe("Alice");
    await next(alice, "room.snapshot");

    const bob = await connect(wsUrl);
    bob.send(JSON.stringify({ type: "auth.anon", nickname: "Bob", roomName }));
    await next(bob, "auth.ok");
    await next(bob, "room.snapshot");

    // Alice should have seen a join from Bob
    await next(alice, "system");

    // Alice sends a message; Bob should receive it
    alice.send(JSON.stringify({ type: "message.send", body: "hello" }));
    const received = await next(bob, "message");
    expect(received.data.body).toBe("hello");
    expect(received.data.author.nickname).toBe("Alice");

    // Alice renames; Bob should see a system message and a presence update
    alice.send(JSON.stringify({ type: "nick.change", newNickname: "Alicia" }));
    const sys = await next(bob, "system");
    expect(sys.body).toMatch(/Alice/);
    expect(sys.body).toMatch(/Alicia/);
    await next(bob, "presence");

    alice.close();
    bob.close();
  });

  it("rejects join to non-existent room", async () => {
    const ws = await connect(wsUrl);
    ws.send(
      JSON.stringify({ type: "auth.anon", nickname: "Ghost", roomName: "does-not-exist" }),
    );
    const err = await next(ws, "auth.error");
    expect(err.reason).toBe("room_not_found");
  });
});
