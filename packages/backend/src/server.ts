import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createSupabaseClient } from "./db/supabase.js";
import { RoomsRepo } from "./db/rooms.js";
import { UsersRepo } from "./db/users.js";
import { MessagesRepo } from "./db/messages.js";
import { OAuthStateStore } from "./auth/state-store.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { ConnectionRegistry } from "./ws/connection-registry.js";
import { attachWebSocketServer } from "./ws/server.js";

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const db = createSupabaseClient(config);

  const rooms = new RoomsRepo(db);
  const users = new UsersRepo(db);
  const messages = new MessagesRepo(db);
  const stateStore = new OAuthStateStore();
  const registry = new ConnectionRegistry();

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app, { config, stateStore, usersRepo: users });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  attachWebSocketServer(app.server, { config, rooms, users, messages, registry });

  logger.info({ port: config.port }, "backend listening");
}
