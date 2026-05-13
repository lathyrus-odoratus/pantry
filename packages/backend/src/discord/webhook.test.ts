import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatChat,
  formatSystem,
  pushToDiscord,
  notify,
  targetFromRoom,
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
    ).resolves.toBeUndefined();
  });
});

describe("notify", () => {
  it("is a no-op when target is null", () => {
    const spy = vi.fn();
    globalThis.fetch = spy as typeof fetch;
    notify(null, "anything");
    expect(spy).not.toHaveBeenCalled();
  });
});
