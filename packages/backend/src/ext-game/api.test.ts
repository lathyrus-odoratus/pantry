import { describe, it, expect, vi, beforeEach } from "vitest";
import { listGames, startSession, sendInput, getFrame } from "./api.js";

const BASE = "http://game-svc";

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("listGames", () => {
  it("returns parsed array on 200", async () => {
    const list = [{ id: "g1", title: "Game 1", description: "desc" }];
    mockFetch(200, list);
    expect(await listGames(BASE)).toEqual(list);
  });

  it("returns [] on 404", async () => {
    mockFetch(404, null);
    expect(await listGames(BASE)).toEqual([]);
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(500, null);
    await expect(listGames(BASE)).rejects.toThrow("HTTP 500");
  });
});

describe("startSession", () => {
  it("returns session on 200", async () => {
    const session = { sessionId: "s1", frame: "init", tick: 0 };
    mockFetch(200, session);
    expect(await startSession(BASE, "g1")).toEqual(session);
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await startSession(BASE, "g1")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(503, null);
    await expect(startSession(BASE, "g1")).rejects.toThrow("HTTP 503");
  });

  it("encodes gameId in URL", async () => {
    const session = { sessionId: "s1", frame: "init", tick: 0 };
    const fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve(session) });
    vi.stubGlobal("fetch", fetch);
    await startSession(BASE, "my game/1");
    expect((fetch.mock.calls[0] as unknown[])[0]).toContain(encodeURIComponent("my game/1"));
  });
});

describe("sendInput", () => {
  it("returns result on 200", async () => {
    const result = { frame: "f2", tick: 1, over: false, result: null };
    mockFetch(200, result);
    expect(await sendInput(BASE, "s1", "up")).toEqual(result);
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await sendInput(BASE, "s1", "up")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(500, null);
    await expect(sendInput(BASE, "s1", "up")).rejects.toThrow("HTTP 500");
  });
});

describe("getFrame", () => {
  it("returns frame on 200", async () => {
    mockFetch(200, { frame: "f", tick: 3 });
    expect(await getFrame(BASE, "s1")).toEqual({ frame: "f", tick: 3 });
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await getFrame(BASE, "s1")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(500, null);
    await expect(getFrame(BASE, "s1")).rejects.toThrow("HTTP 500");
  });
});
