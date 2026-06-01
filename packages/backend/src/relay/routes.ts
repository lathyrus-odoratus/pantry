import type { FastifyInstance, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { buildEmbed } from "./github.js";

export type RelayRoutesDeps = {
  config: Config;
};

// HMAC must run over the exact bytes GitHub signed, so the route uses a
// buffer-based JSON parser (encapsulated to this plugin) and stashes the raw
// body here keyed by the request object.
const rawBodies = new WeakMap<FastifyRequest, Buffer>();

const QuerySchema = z.object({ thread_id: z.string().min(1) });

function verifySignature(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildDiscordUrl(base: string, threadId: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}thread_id=${encodeURIComponent(threadId)}`;
}

export async function registerRelayRoutes(
  app: FastifyInstance,
  deps: RelayRoutesDeps,
): Promise<void> {
  await app.register(async (instance) => {
    instance.removeContentTypeParser("application/json");
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => {
        const buf = body as Buffer;
        rawBodies.set(req, buf);
        if (buf.length === 0) {
          done(null, {});
          return;
        }
        try {
          done(null, JSON.parse(buf.toString("utf8")));
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    instance.post("/relay/github", async (req, reply) => {
      const { discordWebhookUrl, githubWebhookSecret } = deps.config;
      if (!discordWebhookUrl || !githubWebhookSecret) {
        return reply.code(503).send({ error: "relay_not_configured" });
      }

      const raw = rawBodies.get(req) ?? Buffer.alloc(0);
      const sigHeader = req.headers["x-hub-signature-256"];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifySignature(githubWebhookSecret, raw, sig)) {
        return reply.code(401).send({ error: "invalid_signature" });
      }

      const query = QuerySchema.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send({ error: "missing_thread_id" });
      }

      const eventHeader = req.headers["x-github-event"];
      const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
      const embed = buildEmbed(event ?? "", req.body);
      if (!embed) {
        return reply.code(204).send();
      }

      const url = buildDiscordUrl(discordWebhookUrl, query.data.thread_id);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          logger.warn(
            { status: res.status, body: text.slice(0, 500), event },
            "relay discord push non-2xx",
          );
          return reply.code(502).send({ error: "relay_push_failed" });
        }
      } catch (err) {
        logger.error({ err, event }, "relay discord push failed");
        return reply.code(502).send({ error: "relay_push_failed" });
      }

      logger.info({ event, len: raw.length }, "relay github → discord");
      return reply.code(204).send();
    });
  });
}
