import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage } from "@pantry/shared";
import type { AuthedConnection } from "../ws/connection-registry.js";
import { ConnectionRegistry } from "../ws/connection-registry.js";

vi.mock("./api.js");
vi.mock("../ws/broadcast.js");

import {
  startExtGame,
  inputExtGame,
  watchExtGame,
  unwatchExtGame,
  extGameOnDisconnect,
  isExtGameActive,
} from "./manager.js";
import * as api from "./api.js";
import * as broadcast from "../ws/broadcast.js";

const BASE = "http://game-svc";
const SESSION = { sessionId: "sess-1", frame: "main-menu-frame", tick: 0 };

let roomSeq = 0;
function nextRoom(): string {
  return `room-${++roomSeq}`;
}

function fakeConn(
  id: string,
  roomId: string,
  opts: Partial<AuthedConnection> = {},
): { conn: AuthedConnection; outbox: ServerMessage[] } {
  const outbox: ServerMessage[] = [];
  const conn: AuthedConnection = {
    id,
    userId: `user-${id}`,
    roomId,
    nickname: "nick",
    discriminator: "ab12",
    color: null,
    webhook: null,
    sendRaw: (text: string) => outbox.push(JSON.parse(text) as ServerMessage),
    close: vi.fn(),
    kind: "real",
    ...opts,
  };
  return { conn, outbox };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.startTuiSession).mockResolvedValue(SESSION);
  vi.mocked(api.sendTuiInput).mockResolvedValue({ frame: "after", tick: 1 });
  vi.mocked(api.getTuiFrame).mockResolvedValue({ frame: "polled", tick: 1 });
  vi.mocked(api.deleteTuiSession).mockResolvedValue(undefined);
  vi.mocked(broadcast.broadcastToRoom).mockImplementation(() => {});
  vi.mocked(broadcast.send).mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── startExtGame ──────────────────────────────────────────────────────────────

describe("startExtGame", () => {
  it("returns ok, broadcasts ext.game.started, sends initial frame to driver", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver, outbox } = fakeConn("d1", roomId);
    registry.add(driver);

    const result = await startExtGame(driver, registry, BASE);

    expect(result).toBe("ok");
    expect(isExtGameActive(roomId)).toBe(true);

    const broadcastCall = vi.mocked(broadcast.broadcastToRoom).mock.calls[0];
    expect(broadcastCall?.[2]).toMatchObject({ type: "ext.game.started", gameId: "shell" });

    const frame = outbox.find((m) => m.type === "ext.game.frame");
    expect(frame).toMatchObject({ type: "ext.game.frame", frame: SESSION.frame });

    extGameOnDisconnect(driver, registry, BASE);
  });

  it("returns already_active when a game is running in the room", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: d1 } = fakeConn("d1", roomId);
    const { conn: d2 } = fakeConn("d2", roomId);
    registry.add(d1);
    registry.add(d2);

    await startExtGame(d1, registry, BASE);
    const result = await startExtGame(d2, registry, BASE);

    expect(result).toBe("already_active");

    extGameOnDisconnect(d1, registry, BASE);
  });

  it("returns api_error when startTuiSession throws", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);
    vi.mocked(api.startTuiSession).mockRejectedValueOnce(new Error("network"));

    const result = await startExtGame(driver, registry, BASE);

    expect(result).toBe("api_error");
    expect(isExtGameActive(roomId)).toBe(false);
  });

  it("returns api_error when startTuiSession returns null", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);
    vi.mocked(api.startTuiSession).mockResolvedValueOnce(null);

    const result = await startExtGame(driver, registry, BASE);

    expect(result).toBe("api_error");
    expect(isExtGameActive(roomId)).toBe(false);
  });
});

// ── inputExtGame ──────────────────────────────────────────────────────────────

describe("inputExtGame", () => {
  it("returns no_game when no game is active in room", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    const result = await inputExtGame(driver, "up", registry, BASE);
    expect(result).toBe("no_game");
  });

  it("returns not_driver when caller is not the driver", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    const { conn: other } = fakeConn("d2", roomId);
    registry.add(driver);
    registry.add(other);

    await startExtGame(driver, registry, BASE);
    const result = await inputExtGame(other, "up", registry, BASE);

    expect(result).toBe("not_driver");

    extGameOnDisconnect(driver, registry, BASE);
  });

  it("sends input and pushes updated frame to driver", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver, outbox } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    outbox.length = 0;

    await inputExtGame(driver, "up", registry, BASE);

    expect(api.sendTuiInput).toHaveBeenCalledWith(BASE, SESSION.sessionId, "up");
    const frame = outbox.find((m) => m.type === "ext.game.frame");
    expect(frame).toMatchObject({ type: "ext.game.frame", frame: "after" });

    extGameOnDisconnect(driver, registry, BASE);
  });

  it("ends session when shell returns quit", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    vi.mocked(api.sendTuiInput).mockResolvedValueOnce({ quit: true });

    await inputExtGame(driver, "q", registry, BASE);

    expect(isExtGameActive(roomId)).toBe(false);
    const overCall = vi.mocked(broadcast.broadcastToRoom).mock.calls.find(
      (c) => (c[2] as ServerMessage).type === "ext.game.over",
    );
    expect(overCall?.[2]).toMatchObject({ type: "ext.game.over", result: "quit" });
    expect(api.deleteTuiSession).toHaveBeenCalledWith(BASE, SESSION.sessionId);
  });

  it("ends session when sendTuiInput throws (API error)", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    vi.mocked(api.sendTuiInput).mockRejectedValueOnce(new Error("timeout"));

    await inputExtGame(driver, "up", registry, BASE);

    expect(isExtGameActive(roomId)).toBe(false);
    expect(vi.mocked(broadcast.broadcastToRoom)).toHaveBeenCalledWith(
      registry,
      roomId,
      expect.objectContaining({ type: "ext.game.over", result: "quit" }),
    );
  });

  it("ends session when sendTuiInput returns null (session expired)", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    vi.mocked(api.sendTuiInput).mockResolvedValueOnce(null);

    await inputExtGame(driver, "up", registry, BASE);

    expect(isExtGameActive(roomId)).toBe(false);
  });
});

// ── watchExtGame / unwatchExtGame ─────────────────────────────────────────────

describe("watchExtGame / unwatchExtGame", () => {
  it("returns false when no game is active", () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: spectator } = fakeConn("s1", roomId);
    registry.add(spectator);

    expect(watchExtGame(spectator)).toBe(false);
  });

  it("returns true and sends current lastFrame to spectator", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    const { conn: spectator } = fakeConn("s1", roomId);
    registry.add(driver);
    registry.add(spectator);

    await startExtGame(driver, registry, BASE);
    const ok = watchExtGame(spectator);

    expect(ok).toBe(true);
    const sendCall = vi.mocked(broadcast.send).mock.calls.find(
      (c) => c[0].id === "s1" && (c[1] as ServerMessage).type === "ext.game.frame",
    );
    expect(sendCall?.[1]).toMatchObject({ type: "ext.game.frame", frame: SESSION.frame });

    extGameOnDisconnect(driver, registry, BASE);
  });

  it("unwatchExtGame removes spectator; they no longer receive frames", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    const { conn: spectator, outbox } = fakeConn("s1", roomId);
    registry.add(driver);
    registry.add(spectator);

    await startExtGame(driver, registry, BASE);
    watchExtGame(spectator);
    unwatchExtGame(spectator);
    outbox.length = 0;

    await inputExtGame(driver, "up", registry, BASE);

    expect(outbox.filter((m) => m.type === "ext.game.frame")).toHaveLength(0);

    extGameOnDisconnect(driver, registry, BASE);
  });
});

// ── extGameOnDisconnect ───────────────────────────────────────────────────────

describe("extGameOnDisconnect", () => {
  it("ends game and broadcasts ext.game.over when driver disconnects", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    vi.mocked(broadcast.broadcastToRoom).mockClear();

    extGameOnDisconnect(driver, registry, BASE);

    expect(isExtGameActive(roomId)).toBe(false);
    expect(vi.mocked(broadcast.broadcastToRoom)).toHaveBeenCalledWith(
      registry,
      roomId,
      expect.objectContaining({ type: "ext.game.over", result: "quit" }),
    );
    expect(api.deleteTuiSession).toHaveBeenCalledWith(BASE, SESSION.sessionId);
  });

  it("removes spectator from room but does not end game when spectator disconnects", async () => {
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    const { conn: spectator } = fakeConn("s1", roomId);
    registry.add(driver);
    registry.add(spectator);

    await startExtGame(driver, registry, BASE);
    watchExtGame(spectator);
    vi.mocked(broadcast.broadcastToRoom).mockClear();

    extGameOnDisconnect(spectator, registry, BASE);

    expect(isExtGameActive(roomId)).toBe(true);
    expect(vi.mocked(broadcast.broadcastToRoom)).not.toHaveBeenCalled();

    extGameOnDisconnect(driver, registry, BASE);
  });
});

// ── idle timeout ──────────────────────────────────────────────────────────────

describe("idle timeout", () => {
  it("ends game with quit after IDLE_MS of no input", async () => {
    const IDLE_MS = 120_000;
    const POLL_MS = 200;
    const roomId = nextRoom();
    const registry = new ConnectionRegistry();
    const { conn: driver } = fakeConn("d1", roomId);
    registry.add(driver);

    await startExtGame(driver, registry, BASE);
    vi.mocked(broadcast.broadcastToRoom).mockClear();

    await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS);

    expect(isExtGameActive(roomId)).toBe(false);
    expect(vi.mocked(broadcast.broadcastToRoom)).toHaveBeenCalledWith(
      registry,
      roomId,
      expect.objectContaining({ type: "ext.game.over", result: "quit" }),
    );
  });
});
