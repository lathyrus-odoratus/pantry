import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HTTPServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ClientMessageSchema, type ServerMessage } from "@pantry/shared";

import type { Config } from "../config.js";
import { logger } from "../logger.js";
import type { RoomsRepo } from "../db/rooms.js";
import type { UsersRepo } from "../db/users.js";
import type { MessagesRepo } from "../db/messages.js";

import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "./broadcast.js";
import {
  handleAnonAuth,
  handleOAuthAuth,
  admitConnection,
} from "./handlers/auth.js";
import { handleSend } from "./handlers/send.js";
import { handleNick } from "./handlers/nick.js";
import { handleHistory } from "./handlers/history.js";

const AUTH_TIMEOUT_MS = 5000;

export type WsServerDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
};

export function attachWebSocketServer(
  httpServer: HTTPServer,
  deps: WsServerDeps,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const connId = randomUUID();
    const sendRaw = (text: string) => {
      if (ws.readyState === ws.OPEN) ws.send(text);
    };
    const sendMsg = (m: ServerMessage) => sendRaw(JSON.stringify(m));
    const close = (code = 1000, reason = "") => ws.close(code, reason);

    let authed: AuthedConnection | null = null;
    let authedRoomName: string | null = null;

    const authTimer = setTimeout(() => {
      if (!authed) {
        logger.info({ connId }, "auth timeout; closing");
        try {
          sendMsg({ type: "auth.error", reason: "invalid_token" });
        } catch {}
        close(4001, "auth_timeout");
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("message", async (data) => {
      let parsed;
      try {
        parsed = ClientMessageSchema.parse(JSON.parse(data.toString()));
      } catch (err) {
        logger.warn({ err, connId }, "bad client message");
        sendMsg({ type: "error", code: "bad_request" });
        close(4000, "bad_request");
        return;
      }

      try {
        if (!authed) {
          if (parsed.type !== "auth.anon" && parsed.type !== "auth.oauth") {
            sendMsg({ type: "error", code: "not_authenticated" });
            close(4001, "not_authenticated");
            return;
          }
          const pending = { id: connId, sendRaw, close };
          const result =
            parsed.type === "auth.anon"
              ? await handleAnonAuth(parsed, pending, deps)
              : await handleOAuthAuth(parsed, pending, deps);
          if (!result.ok) {
            sendMsg({ type: "auth.error", reason: result.reason });
            close(4002, result.reason);
            return;
          }
          authed = result.conn;
          authedRoomName = parsed.roomName;
          clearTimeout(authTimer);
          await admitConnection(authed, deps, authedRoomName);
          return;
        }

        switch (parsed.type) {
          case "message.send":
            await handleSend(authed, parsed, deps);
            break;
          case "nick.change":
            await handleNick(authed, parsed, deps);
            break;
          case "history.load":
            await handleHistory(authed, parsed, deps);
            break;
          case "auth.anon":
          case "auth.oauth":
            sendMsg({ type: "error", code: "already_authenticated" });
            break;
        }
      } catch (err) {
        logger.error({ err, connId }, "handler crashed");
        sendMsg({ type: "error", code: "internal" });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!authed) return;
      deps.registry.remove(authed);
      const leaveLabel = `${authed.nickname}#${authed.discriminator} left`;
      broadcastToRoom(deps.registry, authed.roomId, {
        type: "system",
        event: "leave",
        body: leaveLabel,
      });
      broadcastToRoom(deps.registry, authed.roomId, {
        type: "presence",
        onlineUsers: presenceFor(deps.registry, authed.roomId),
      });
    });

    ws.on("error", (err) => {
      logger.warn({ err, connId }, "ws error");
    });
  });

  return wss;
}
