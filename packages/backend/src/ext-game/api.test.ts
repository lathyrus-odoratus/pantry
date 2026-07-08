import { describe, it, expect, vi, beforeEach } from "vitest";
import { startTuiSession, sendTuiInput, getTuiFrame, deleteTuiSession } from "./api.js";

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

describe("startTuiSession", () => {
  it("returns session on 200", async () => {
    const session = { sessionId: "s1", frame: "main menu", tick: 0 };
    mockFetch(200, session);
    expect(await startTuiSession(BASE, "Shao")).toEqual(session);
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await startTuiSession(BASE, "Shao")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(503, null);
    await expect(startTuiSession(BASE, "Shao")).rejects.toThrow("HTTP 503");
  });

  it("posts nickname in body", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ sessionId: "s1", frame: "menu", tick: 0 }),
    });
    vi.stubGlobal("fetch", fetch);
    await startTuiSession(BASE, "TestUser");
    const [, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ nickname: "TestUser" });
  });
});

describe("sendTuiInput", () => {
  it("returns frame result on 200", async () => {
    mockFetch(200, { frame: "game frame", tick: 5 });
    expect(await sendTuiInput(BASE, "s1", "up")).toEqual({ frame: "game frame", tick: 5 });
  });

  it("returns quit signal", async () => {
    mockFetch(200, { quit: true });
    expect(await sendTuiInput(BASE, "s1", "q")).toEqual({ quit: true });
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await sendTuiInput(BASE, "s1", "up")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(500, null);
    await expect(sendTuiInput(BASE, "s1", "up")).rejects.toThrow("HTTP 500");
  });

  it("encodes sessionId in URL", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ frame: "f", tick: 1 }),
    });
    vi.stubGlobal("fetch", fetch);
    await sendTuiInput(BASE, "sess/with space", "up");
    expect((fetch.mock.calls[0] as unknown[])[0]).toContain(
      encodeURIComponent("sess/with space"),
    );
  });
});

describe("getTuiFrame", () => {
  it("returns frame on 200", async () => {
    mockFetch(200, { frame: "f", tick: 3 });
    expect(await getTuiFrame(BASE, "s1")).toEqual({ frame: "f", tick: 3 });
  });

  it("returns null on 404", async () => {
    mockFetch(404, null);
    expect(await getTuiFrame(BASE, "s1")).toBeNull();
  });

  it("throws on non-2xx non-404", async () => {
    mockFetch(500, null);
    await expect(getTuiFrame(BASE, "s1")).rejects.toThrow("HTTP 500");
  });
});

describe("deleteTuiSession", () => {
  it("calls DELETE and does not throw on success", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 204, ok: true });
    vi.stubGlobal("fetch", fetch);
    await expect(deleteTuiSession(BASE, "s1")).resolves.toBeUndefined();
    expect((fetch.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("swallows network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(deleteTuiSession(BASE, "s1")).resolves.toBeUndefined();
  });
});
