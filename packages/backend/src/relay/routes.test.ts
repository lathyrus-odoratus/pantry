import Fastify from "fastify";
import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Config } from "../config.js";
import { registerRelayRoutes } from "./routes.js";

const SECRET = "topsecret-shared-key";
const WEBHOOK = "https://discord.com/api/webhooks/1/abc";

function makeConfig(over: Partial<Config> = {}): Config {
  return {
    port: 8080,
    nodeEnv: "test",
    publicBackendUrl: "http://localhost:8080",
    supabase: { url: "https://x.supabase.co", serviceRoleKey: "k" },
    jwtSigningKey: "0123456789abcdef0123456789abcdef",
    oauth: { discord: { clientId: "d", clientSecret: "d" } },
    adminKey: null,
    anthropicApiKey: null,
    worldCreditTotal: 100000,
    discordWebhookUrl: WEBHOOK,
    githubWebhookSecret: SECRET,
    gameServiceUrl: "https://backend.instantcheeseshao.com/game_service",
    ...over,
  };
}

function sign(body: string, secret = SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function makeApp(config: Config) {
  const app = Fastify({ logger: false });
  await registerRelayRoutes(app, { config });
  await app.ready();
  return app;
}

const PUSH_BODY = JSON.stringify({
  ref: "refs/heads/main",
  compare: "https://github.com/o/r/compare/a...b",
  repository: { full_name: "o/r" },
  pusher: { name: "alice" },
  commits: [{ id: "abc1234", message: "hi" }],
});

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
});
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
});

describe("POST /relay/github", () => {
  it("returns 503 when relay is not configured", async () => {
    const app = await makeApp(makeConfig({ discordWebhookUrl: null }));
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=123",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(PUSH_BODY) },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "relay_not_configured" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 401 on a bad signature", async () => {
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=123",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": "sha256=deadbeef" },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 401 when the signature header is missing", async () => {
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=123",
      headers: { "content-type": "application/json", "x-github-event": "push" },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 when thread_id is missing", async () => {
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(PUSH_BODY) },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "missing_thread_id" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 204 and forwards nothing for a ping", async () => {
    const body = JSON.stringify({ zen: "Keep it simple" });
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=123",
      headers: { "content-type": "application/json", "x-github-event": "ping", "x-hub-signature-256": sign(body) },
      payload: body,
    });
    expect(res.statusCode).toBe(204);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards a push as a Discord embed with thread_id and returns 204", async () => {
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=987654321",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(PUSH_BODY) },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(204);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe(`${WEBHOOK}?thread_id=987654321`);
    const init = call?.[1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.embeds).toHaveLength(1);
    expect(sent.embeds[0].title).toBe("[o/r:main] 1 new commit");
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    await app.close();
  });

  it("returns 502 when Discord rejects the push", async () => {
    globalThis.fetch = vi.fn(async () => new Response("gone", { status: 404 })) as typeof fetch;
    const app = await makeApp(makeConfig());
    const res = await app.inject({
      method: "POST",
      url: "/relay/github?thread_id=123",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(PUSH_BODY) },
      payload: PUSH_BODY,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "relay_push_failed" });
    await app.close();
  });
});
