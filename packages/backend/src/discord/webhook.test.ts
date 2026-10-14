import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger.js";
import {
  chatUsername,
  formatChat,
  formatChatPost,
  formatSystem,
  pushToDiscord,
  notify,
  notifyChat,
  targetFromRoom,
  flushWebhookQueues,
  _resetWebhookBatching,
} from "./webhook.js";

describe("formatChat", () => {
  it("prefixes nickname#discriminator", () => {
    expect(formatChat({ nickname: "alice", discriminator: "ab12" }, "hi")).toBe(
      "**alice#ab12**: hi",
    );
  });

  it("truncates content over 2000 chars", () => {
    const body = "x".repeat(2100);
    const out = formatChat({ nickname: "a", discriminator: "bbbb" }, body);
    expect(out.length).toBe(2000);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("formatChatPost", () => {
  const alice = { nickname: "alice", discriminator: "ab12" };

  it("sends under the author's name without an inline label", () => {
    expect(formatChatPost(alice, "hi")).toEqual({
      content: "hi",
      fallback: "**alice#ab12**: hi",
      username: "alice#ab12",
    });
  });

  it("keeps the reply quote above the body", () => {
    const post = formatChatPost(alice, "me too", {
      author: { nickname: "bob", discriminator: "cd34" },
      body: "line1\nline2",
    });
    expect(post.content).toBe("> bob#cd34: line1\n> line2\nme too");
  });

  it("falls back to the labeled form when the name is not allowed", () => {
    for (const nickname of ["discordfan", "Clyde"]) {
      const post = formatChatPost({ nickname, discriminator: "ab12" }, "hi");
      expect(post.username).toBeNull();
      expect(post.content).toBe(`**${nickname}#ab12**: hi`);
    }
    expect(chatUsername({ nickname: "x".repeat(80), discriminator: "ab12" })).toBeNull();
  });
});

describe("formatSystem", () => {
  it("renders body as a Discord blockquote", () => {
    expect(formatSystem("join", "alice#ab12 joined")).toBe(
      "> alice#ab12 joined",
    );
  });
});

describe("targetFromRoom", () => {
  it("returns null when url missing", () => {
    expect(targetFromRoom({ url: null, threadId: null })).toBeNull();
    expect(targetFromRoom({ url: null, threadId: "123" })).toBeNull();
  });

  it("passes through url and threadId", () => {
    expect(
      targetFromRoom({ url: "https://discord.com/api/webhooks/x/y", threadId: "9" }),
    ).toEqual({ url: "https://discord.com/api/webhooks/x/y", threadId: "9" });
  });
});

describe("pushToDiscord", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("appends thread_id query param", async () => {
    await pushToDiscord(
      { url: "https://discord.com/api/webhooks/1/abc", threadId: "42" },
      "hello",
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe(
      "https://discord.com/api/webhooks/1/abc?thread_id=42",
    );
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      content: "hello",
      allowed_mentions: { parse: [] },
    });
  });

  it("sets username when given and returns the status", async () => {
    const status = await pushToDiscord(
      { url: "https://discord.com/api/webhooks/1/abc", threadId: null },
      "hi",
      "alice#ab12",
    );
    expect(status).toBe(204);
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string).username).toBe("alice#ab12");
  });

  it("logs a rate-limit event on 429 without leaking the webhook token", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.5, global: false }), {
          status: 429,
          headers: { "x-ratelimit-scope": "shared" },
        }),
    ) as typeof fetch;
    const status = await pushToDiscord(
      { url: "https://discord.com/api/webhooks/123/secret-token", threadId: "9" },
      "hi",
    );
    expect(status).toBe(429);
    const [fields] = warn.mock.calls[0]!;
    expect(fields).toMatchObject({
      event: "discord.rate_limited",
      webhookId: "123",
      threadId: "9",
      retryAfterSec: 1.5,
      scope: "shared",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-token");
    warn.mockRestore();
  });

  it("merges thread_id when url already has query", async () => {
    await pushToDiscord(
      { url: "https://example.com/hook?foo=bar", threadId: "9" },
      "hi",
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe("https://example.com/hook?foo=bar&thread_id=9");
  });

  it("swallows fetch errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await expect(
      pushToDiscord(
        { url: "https://discord.com/api/webhooks/1/abc", threadId: null },
        "x",
      ),
    ).resolves.toBeNull();
  });
});

describe("notify (batching)", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    _resetWebhookBatching();
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
  });
  afterEach(() => {
    _resetWebhookBatching();
    globalThis.fetch = origFetch;
  });

  it("is a no-op when target is null", async () => {
    notify(null, "anything");
    await flushWebhookQueues();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not POST synchronously — accumulates until flush", async () => {
    const target = { url: "https://example.com/hook", threadId: null };
    notify(target, "a");
    notify(target, "b");
    notify(target, "c");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await flushWebhookQueues();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string).content).toBe("a\nb\nc");
  });

  it("keeps different (url, thread) pairs in separate batches", async () => {
    const a = { url: "https://example.com/hook", threadId: "1" };
    const b = { url: "https://example.com/hook", threadId: "2" };
    notify(a, "alpha");
    notify(b, "beta");
    await flushWebhookQueues();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("splits into multiple POSTs when one batch would exceed 2000 chars", async () => {
    const target = { url: "https://example.com/hook", threadId: null };
    // Three lines × 800 chars + newlines = 2402 chars → needs 2 chunks
    notify(target, "a".repeat(800));
    notify(target, "b".repeat(800));
    notify(target, "c".repeat(800));
    await flushWebhookQueues();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("sends one POST per run of consecutive same-author lines, in order", async () => {
    const target = { url: "https://example.com/hook", threadId: null };
    const alice = { nickname: "alice", discriminator: "ab12" };
    const bob = { nickname: "bob", discriminator: "cd34" };
    notifyChat(target, formatChatPost(alice, "a1"));
    notifyChat(target, formatChatPost(alice, "a2"));
    notifyChat(target, formatChatPost(bob, "b1"));
    notify(target, "> bob left");
    notifyChat(target, formatChatPost(alice, "a3"));
    await flushWebhookQueues();
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string),
    );
    expect(sent.map((b) => [b.username ?? null, b.content])).toEqual([
      ["alice#ab12", "a1\na2"],
      ["bob#cd34", "b1"],
      [null, "> bob left"],
      ["alice#ab12", "a3"],
    ]);
  });

  it("resends a run under the bot's name when Discord rejects the username", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      return new Response(null, { status: body.username ? 400 : 204 });
    }) as typeof fetch;
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const target = { url: "https://example.com/hook", threadId: null };
    const alice = { nickname: "alice", discriminator: "ab12" };
    notifyChat(target, formatChatPost(alice, "a1"));
    notifyChat(target, formatChatPost(alice, "a2"));
    await flushWebhookQueues();
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string),
    );
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ content: "**alice#ab12**: a1\n**alice#ab12**: a2" });
    expect(sent[1].username).toBeUndefined();
    vi.mocked(logger.warn).mockRestore();
  });

  it("clears queue after flush so a second flush does nothing", async () => {
    const target = { url: "https://example.com/hook", threadId: null };
    notify(target, "once");
    await flushWebhookQueues();
    await flushWebhookQueues();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
