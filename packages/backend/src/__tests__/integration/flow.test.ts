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

type WaitingConsumer = {
  predicate: (m: ServerMessage) => boolean;
  resolve: (m: ServerMessage) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

class ClientChannel {
  private buffer: ServerMessage[] = [];
  private waiters: WaitingConsumer[] = [];

  constructor(public ws: WebSocket) {
    ws.on("message", (data: WebSocket.RawData) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(data.toString()) as ServerMessage;
      } catch {
        return;
      }
      // Try to satisfy an existing waiter
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i]!;
        if (w.predicate(msg)) {
          this.waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(msg);
          return;
        }
      }
      // Otherwise buffer it for later consumption
      this.buffer.push(msg);
    });
  }

  send(payload: object): void {
    this.ws.send(JSON.stringify(payload));
  }

  close(): void {
    this.ws.close();
  }

  next<T extends ServerMessage["type"]>(
    type: T,
    timeoutMs = 4000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    // First check the buffer
    for (let i = 0; i < this.buffer.length; i++) {
      const m = this.buffer[i]!;
      if (m.type === type) {
        this.buffer.splice(i, 1);
        return Promise.resolve(m as Extract<ServerMessage, { type: T }>);
      }
    }
    // Otherwise wait
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`timeout waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push({
        predicate: (m) => m.type === type,
        resolve: (m) => resolve(m as Extract<ServerMessage, { type: T }>),
        reject,
        timer,
      });
    });
  }
}

function connect(url: string): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(new ClientChannel(ws)));
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
    alice.send({ type: "auth.anon", nickname: "Alice", roomName });
    const aliceOk = await alice.next("auth.ok");
    expect(aliceOk.user.nickname).toBe("Alice");
    await alice.next("room.snapshot");

    const bob = await connect(wsUrl);
    bob.send({ type: "auth.anon", nickname: "Bob", roomName });
    await bob.next("auth.ok");
    await bob.next("room.snapshot");

    // Alice should have seen a join from Bob
    await alice.next("system");

    // Alice sends a message; Bob should receive it
    alice.send({ type: "message.send", body: "hello" });
    const received = await bob.next("message");
    expect(received.data.body).toBe("hello");
    expect(received.data.author.nickname).toBe("Alice");

    // Alice renames; Bob should see a system message and a presence update
    alice.send({ type: "nick.change", newNickname: "Alicia" });
    const sys = await bob.next("system");
    expect(sys.body).toMatch(/Alice/);
    expect(sys.body).toMatch(/Alicia/);
    await bob.next("presence");

    alice.close();
    bob.close();
  });

  it("rejects join to non-existent room", async () => {
    const ws = await connect(wsUrl);
    ws.send({ type: "auth.anon", nickname: "Ghost", roomName: "does-not-exist" });
    const err = await ws.next("auth.error");
    expect(err.reason).toBe("room_not_found");
  });
});
