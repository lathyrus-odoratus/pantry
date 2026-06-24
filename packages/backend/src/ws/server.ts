import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HTTPServer } from "node:http";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { ClientMessageSchema, type ServerMessage } from "@pantry/shared";

import type { Config } from "../config.js";
import { logger } from "../logger.js";
import type { RoomsRepo } from "../db/rooms.js";
import type { UsersRepo } from "../db/users.js";
import type { MessagesRepo } from "../db/messages.js";

import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";
import { broadcastToRoom, presenceFor, send } from "./broadcast.js";
import { formatSystem, notify } from "../discord/webhook.js";
import {
  handleAnonAuth,
  handleOAuthAuth,
  admitConnection,
} from "./handlers/auth.js";
import { handleSend } from "./handlers/send.js";
import { handleNick } from "./handlers/nick.js";
import { handleHistory } from "./handlers/history.js";
import { handleColor } from "./handlers/color.js";
import { handleWorldOpen } from "./handlers/world.js";
import { handleDiceRoll } from "./handlers/dice.js";
import { handleGameStart, handleGameInputMsg } from "./handlers/game.js";
import { endGameForPlayer } from "../game/manager.js";
import {
  handleCabombStart,
  handleCabombInput,
  handleCabombWatch,
  handleCabombLeave,
  handleCabombPing,
} from "./handlers/cabomb.js";
import { cabombOnDisconnect } from "../cabomb/manager.js";
import {
  handleExtGameList,
  handleExtGameStart,
  handleExtGameInput,
  handleExtGameWatch,
  handleExtGameLeave,
  handleExtGameLeaderboard,
} from "./handlers/ext-game.js";
import { extGameOnDisconnect } from "../ext-game/manager.js";
import {
  handleAdminAuth,
  makeAdminAuthOk,
  buildRoomsSnapshot,
  handleAdminRoomCreate,
  handleAdminRoomClose,
  handleAdminRoomReopen,
  handleAdminRoomDelete,
  type AdminSession,
} from "./handlers/admin.js";
import type { WorldStateStore } from "../world/state.js";

const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30_000;

export type WsServerDeps = {
  config: Config;
  rooms: RoomsRepo;
  users: UsersRepo;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  anthropic: Anthropic | null;
};

export function attachWebSocketServer(
  httpServer: HTTPServer,
  deps: WsServerDeps,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Liveness tracking — Cloudflare Tunnel closes idle WS around ~100s with no
  // traffic, so we ping every 30s and terminate sockets that miss a pong.
  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (alive.get(client) === false) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      try {
        client.ping();
      } catch {}
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    const connId = randomUUID();
    const sendRaw = (text: string) => {
      if (ws.readyState === ws.OPEN) ws.send(text);
    };
    const sendMsg = (m: ServerMessage) => sendRaw(JSON.stringify(m));
    const close = (code = 1000, reason = "") => ws.close(code, reason);

    let authed: AuthedConnection | null = null;
    let authedRoomName: string | null = null;
    let adminSession: AdminSession | null = null;

    const authTimer = setTimeout(() => {
      if (!authed && !adminSession) {
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
        if (!authed && !adminSession) {
          if (parsed.type === "auth.admin") {
            const result = await handleAdminAuth(parsed, deps);
            if (!result.ok) {
              sendMsg({ type: "auth.error", reason: result.reason });
              close(4002, result.reason);
              return;
            }
            adminSession = result.session;
            clearTimeout(authTimer);
            sendMsg(makeAdminAuthOk(adminSession));
            logger.info(
              { connId, userId: adminSession.userId },
              "admin connected",
            );
            return;
          }
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

        if (adminSession) {
          switch (parsed.type) {
            case "admin.rooms.list": {
              const rooms = await buildRoomsSnapshot(deps);
              sendMsg({ type: "admin.rooms", rooms });
              break;
            }
            case "admin.room.create":
              sendMsg(await handleAdminRoomCreate(parsed, deps));
              break;
            case "admin.room.close":
              sendMsg(await handleAdminRoomClose(parsed, deps));
              break;
            case "admin.room.reopen":
              sendMsg(await handleAdminRoomReopen(parsed, deps));
              break;
            case "admin.room.delete":
              sendMsg(await handleAdminRoomDelete(parsed, deps));
              break;
            default:
              sendMsg({ type: "error", code: "not_in_chat_mode" });
          }
          return;
        }

        if (!authed) return;
        const conn = authed;

        switch (parsed.type) {
          case "message.send":
            await handleSend(conn, parsed, {
              messages: deps.messages,
              registry: deps.registry,
              worldState: deps.worldState,
              anthropic: deps.anthropic,
              worldCreditTotal: deps.config.worldCreditTotal,
            });
            break;
          case "nick.change":
            await handleNick(conn, parsed, deps);
            break;
          case "color.change":
            await handleColor(conn, parsed, deps);
            break;
          case "world.open":
            if (deps.anthropic === null) {
              sendMsg({
                type: "error",
                code: "world_not_configured",
                message: "World feature is not configured on this server.",
              });
              break;
            }
            await handleWorldOpen(conn, {
              users: deps.users,
              registry: deps.registry,
              worldState: deps.worldState,
              creditTotal: deps.config.worldCreditTotal,
            });
            break;
          case "dice.roll":
            await handleDiceRoll(conn, {
              registry: deps.registry,
              worldState: deps.worldState,
              anthropic: deps.anthropic,
              messages: deps.messages,
              worldCreditTotal: deps.config.worldCreditTotal,
            });
            break;
          case "history.load":
            await handleHistory(conn, parsed, deps);
            break;
          case "game.start":
            handleGameStart(conn, deps.registry);
            break;
          case "game.input":
            handleGameInputMsg(conn, parsed, deps.registry);
            break;
          case "cabomb.start":
            handleCabombStart(conn, deps.registry);
            break;
          case "cabomb.input":
            handleCabombInput(conn, parsed, deps.registry);
            break;
          case "cabomb.watch":
            handleCabombWatch(conn);
            break;
          case "cabomb.leave":
            handleCabombLeave(conn);
            break;
          case "cabomb.ping":
            handleCabombPing(conn, parsed);
            break;
          case "ext.game.list":
            await handleExtGameList(conn, deps.config.gameServiceUrl);
            break;
          case "ext.game.start":
            await handleExtGameStart(conn, parsed, deps.registry, deps.config.gameServiceUrl);
            break;
          case "ext.game.input":
            await handleExtGameInput(conn, parsed, deps.registry, deps.config.gameServiceUrl);
            break;
          case "ext.game.watch":
            handleExtGameWatch(conn);
            break;
          case "ext.game.leave":
            handleExtGameLeave(conn);
            break;
          case "ext.game.leaderboard":
            await handleExtGameLeaderboard(conn, parsed, deps.config.gameServiceUrl);
            break;
          case "auth.anon":
          case "auth.oauth":
          case "auth.admin":
            sendMsg({ type: "error", code: "already_authenticated" });
            break;
          case "admin.rooms.list":
          case "admin.room.create":
          case "admin.room.close":
          case "admin.room.reopen":
          case "admin.room.delete":
            sendMsg({ type: "error", code: "not_in_admin_mode" });
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
      endGameForPlayer(authed.userId, deps.registry);
      cabombOnDisconnect(authed, deps.registry);
      extGameOnDisconnect(authed, deps.registry);
      deps.registry.remove(authed);
      const leaveLabel = `${authed.nickname}#${authed.discriminator} left`;
      broadcastToRoom(deps.registry, authed.roomId, {
        type: "system",
        event: "leave",
        body: leaveLabel,
      });
      notify(authed.webhook, formatSystem("leave", leaveLabel));
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
