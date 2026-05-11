import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { WebSocketServer } from "ws";
import { TransportClient } from "./client.js";
import type { ServerMessage } from "@pantry/shared";

let port: number;
let server: WebSocketServer;
const receivedFrames: string[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => {
      const addr = server.address();
      if (typeof addr !== "object" || !addr) throw new Error("no addr");
      port = addr.port;
      resolve();
    });
    server.on("connection", (ws) => {
      ws.on("message", (data) => {
        receivedFrames.push(data.toString());
      });
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function url() {
  return `ws://127.0.0.1:${port}`;
}

describe("TransportClient", () => {
  it("connects, sends, and reports status", async () => {
    receivedFrames.length = 0;
    const statuses: string[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: (s) => statuses.push(s),
      onMessage: () => {},
    });
    client.connect();
    await new Promise<void>((resolve) => {
      const i = setInterval(() => {
        if (statuses.includes("connected")) {
          clearInterval(i);
          resolve();
        }
      }, 20);
    });
    client.send({ type: "auth.anon", nickname: "x", roomName: "lobby" });
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedFrames[0]).toContain('"type":"auth.anon"');
    client.close();
  });

  it("parses inbound messages and forwards to onMessage", async () => {
    const received: ServerMessage[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: () => {},
      onMessage: (m) => received.push(m),
    });
    // Wire a server handler to push back a fake message once a client connects
    const handler = (ws: import("ws").WebSocket) => {
      ws.send(JSON.stringify({ type: "presence", onlineUsers: [] }));
    };
    server.on("connection", handler);
    client.connect();
    await new Promise((r) => setTimeout(r, 100));
    server.off("connection", handler);
    expect(received.some((m) => m.type === "presence")).toBe(true);
    client.close();
  });

  it("reconnects with backoff when the connection drops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const statuses: string[] = [];
    const client = new TransportClient({
      url: url(),
      onStatus: (s) => statuses.push(s),
      onMessage: () => {},
      backoffSchedule: [10, 20, 30],
    });
    client.connect();
    // Wait for first connection (real timers under shouldAdvanceTime keep advancing)
    await new Promise((r) => setTimeout(r, 80));
    expect(statuses).toContain("connected");
    // Close from server side by closing all clients
    for (const ws of server.clients) ws.close();
    // Allow backoff schedule to elapse + reconnect
    await new Promise((r) => setTimeout(r, 200));
    expect(statuses.filter((s) => s === "connected").length).toBeGreaterThanOrEqual(2);
    client.close();
    vi.useRealTimers();
  });
});
