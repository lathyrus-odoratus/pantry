import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Config } from "../config.js";
import type { RoomsRepo } from "../db/rooms.js";
import type { ConnectionRegistry } from "../ws/connection-registry.js";
import { broadcastToRoom } from "../ws/broadcast.js";
import {
  formatSystem,
  notify,
  targetFromRoom,
} from "../discord/webhook.js";
import { logger } from "../logger.js";
import type { WorldStateStore } from "../world/state.js";
import { endWorld } from "../ws/handlers/world.js";
import { generateEndSummary, END_FOOTER } from "../world/brain.js";

const BroadcastBodySchema = z.object({
  room: z.string().min(1).max(64),
  body: z.string().min(1).max(500),
});

export type AdminRoutesDeps = {
  config: Config;
  rooms: RoomsRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  anthropic: Anthropic | null;
};

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRoutesDeps,
): Promise<void> {
  app.post("/admin/broadcast", async (req, reply) => {
    if (!deps.config.adminKey) {
      return reply.code(503).send({ error: "admin_disabled" });
    }
    const provided = req.headers["x-admin-key"];
    if (typeof provided !== "string" || provided !== deps.config.adminKey) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = BroadcastBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    }
    const { room: roomName, body } = parsed.data;

    const room = await deps.rooms.findByName(roomName);
    if (!room) return reply.code(404).send({ error: "room_not_found" });

    broadcastToRoom(deps.registry, room.id, {
      type: "system",
      event: "announce",
      body,
    });
    notify(
      targetFromRoom({
        url: room.webhook_url,
        threadId: room.webhook_thread_id,
      }),
      formatSystem("announce", body),
    );
    logger.info({ roomName, len: body.length }, "admin announce");
    return reply.code(204).send();
  });

  app.post("/admin/world/end", async (req, reply) => {
    if (!deps.config.adminKey) {
      return reply.code(503).send({ error: "admin_disabled" });
    }
    const provided = req.headers["x-admin-key"];
    if (typeof provided !== "string" || provided !== deps.config.adminKey) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const active = deps.worldState.get();
    if (!active) return reply.code(404).send({ error: "no_active_world" });

    let summary: string | undefined;
    if (deps.anthropic) {
      try {
        summary = await generateEndSummary(deps.anthropic, active.transcript);
      } catch (err) {
        logger.warn({ err }, "admin force-end summary failed");
        summary = `世界結束（admin force）。摘要產生失敗。\n\n${END_FOOTER}`;
      }
    } else {
      summary = `世界結束（admin force）。\n\n${END_FOOTER}`;
    }

    await endWorld(
      {
        users: undefined as never,
        registry: deps.registry,
        worldState: deps.worldState,
        creditTotal: active.creditTotal,
      },
      "admin_force",
      summary,
    );
    logger.info({ roomId: active.roomId }, "admin force-ended world");
    return reply.code(204).send({});
  });
}
