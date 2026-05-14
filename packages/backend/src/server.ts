import Fastify from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createSupabaseClient } from "./db/supabase.js";
import { RoomsRepo } from "./db/rooms.js";
import { UsersRepo } from "./db/users.js";
import { MessagesRepo } from "./db/messages.js";
import { OAuthStateStore } from "./auth/state-store.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { ConnectionRegistry } from "./ws/connection-registry.js";
import { attachWebSocketServer } from "./ws/server.js";
import { WorldStateStore } from "./world/state.js";

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const db = createSupabaseClient(config);

  const rooms = new RoomsRepo(db);
  const users = new UsersRepo(db);
  const messages = new MessagesRepo(db);
  const stateStore = new OAuthStateStore();
  const registry = new ConnectionRegistry();
  const worldState = new WorldStateStore();
  const anthropic = config.anthropicApiKey
    ? new Anthropic({ apiKey: config.anthropicApiKey })
    : null;
  if (anthropic) {
    logger.info("anthropic client ready (world feature enabled)");
  } else {
    logger.info("ANTHROPIC_API_KEY not set; world feature disabled");
  }

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app, { config, stateStore, usersRepo: users });
  await registerAdminRoutes(app, {
    config,
    rooms,
    registry,
    worldState,
    anthropic,
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  attachWebSocketServer(app.server, {
    config,
    rooms,
    users,
    messages,
    registry,
    worldState,
    anthropic,
  });

  logger.info({ port: config.port }, "backend listening");
}
