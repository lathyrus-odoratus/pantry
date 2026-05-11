import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { runOAuthFlow } from "./oauth.js";

let calls: { url: string; init?: RequestInit }[] = [];

beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? undefined });
    if (url.endsWith("/auth/oauth/start")) {
      return new Response(
        JSON.stringify({
          authUrl: "https://example.test/auth?state=abc",
          pollUrl: "/auth/oauth/poll?state=abc",
          state: "abc",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/auth/oauth/poll")) {
      // First poll: pending; second poll: ready
      const pendingCount = calls.filter((c) =>
        c.url.includes("/auth/oauth/poll"),
      ).length;
      if (pendingCount < 2) {
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ status: "ready", token: "session.jwt.token" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("runOAuthFlow", () => {
  it("posts /start, opens authUrl, polls until ready", async () => {
    calls = [];
    let openedUrl = "";
    const result = await runOAuthFlow({
      provider: "github",
      backendHttpUrl: "http://localhost:8080",
      open: async (u) => {
        openedUrl = u;
      },
      pollIntervalMs: 5,
    });
    expect(result.token).toBe("session.jwt.token");
    expect(openedUrl).toBe("https://example.test/auth?state=abc");
    expect(calls.some((c) => c.url === "http://localhost:8080/auth/oauth/start"))
      .toBe(true);
    expect(
      calls.filter((c) => c.url.includes("/auth/oauth/poll")).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
