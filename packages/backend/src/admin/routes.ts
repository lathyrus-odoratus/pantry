import type { FastifyInstance } from "fastify";
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

const BroadcastBodySchema = z.object({
  room: z.string().min(1).max(64),
  body: z.string().min(1).max(500),
});

export type AdminRoutesDeps = {
  config: Config;
  rooms: RoomsRepo;
  registry: ConnectionRegistry;
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
}
