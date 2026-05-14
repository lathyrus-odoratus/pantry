import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerMessage } from "@pantry/shared";
import type { UserRow, UsersRepo } from "../../db/users.js";
import { ConnectionRegistry, type AuthedConnection } from "../connection-registry.js";
import { WorldStateStore } from "../../world/state.js";
import { handleWorldOpen, endWorld } from "./world.js";
import { NPC } from "../../world/npc.js";

const NPC_USER_ROW: UserRow = {
  id: "npc-user-id",
  auth_provider: "npc",
  auth_subject: NPC.subject,
  nickname: NPC.nickname,
  discriminator: "wxyz",
  color: null,
  created_at: "2026-05-14T00:00:00Z",
  updated_at: "2026-05-14T00:00:00Z",
};

function fakeOpener(roomId = "room-1"): {
  conn: AuthedConnection;
  outbox: ServerMessage[];
} {
  const outbox: ServerMessage[] = [];
  return {
    outbox,
    conn: {
      id: "conn-opener",
      userId: "user-opener",
      roomId,
      nickname: "alice",
      discriminator: "ab12",
      color: null,
      webhook: null,
      sendRaw: (text: string) => outbox.push(JSON.parse(text)),
      close: () => {},
      kind: "real",
    },
  };
}

function fakeUsersRepo(npcUser: UserRow = NPC_USER_ROW) {
  return {
    findByProviderSubject: vi.fn().mockResolvedValue(npcUser),
    createWithDiscriminator: vi.fn().mockResolvedValue(npcUser),
  } as unknown as UsersRepo;
}

function makeDeps(roomId = "room-1") {
  const registry = new ConnectionRegistry();
  const worldState = new WorldStateStore();
  const users = fakeUsersRepo();
  const opener = fakeOpener(roomId);
  registry.add(opener.conn);
  return { registry, worldState, users, opener };
}

describe("handleWorldOpen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds when no world is active: NPC registered, state set, room broadcasts include world.open and world.state", async () => {
    const { registry, worldState, users, opener } = makeDeps();
    const roomBroadcasts: ServerMessage[] = [];
    // Spy on all connections in registry to collect broadcasts. Easier:
    // wrap opener's sendRaw to also capture broadcasts, since broadcasts go
    // to every connection in the room (currently just opener).
    opener.conn.sendRaw = (text: string) => roomBroadcasts.push(JSON.parse(text));

    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });

    expect(worldState.isActive()).toBe(true);
    expect(worldState.get()?.roomId).toBe("room-1");
    expect(worldState.get()?.creditTotal).toBe(100_000);

    // Registry should now contain the opener + the NPC (kind=virtual)
    const inRoom = registry.listByRoom("room-1");
    expect(inRoom).toHaveLength(2);
    expect(inRoom.some((c) => c.kind === "virtual")).toBe(true);

    // Broadcasts: system world.open + presence + world.state (active=true)
    const systemEvents = roomBroadcasts.filter((m) => m.type === "system");
    expect(systemEvents.some((m) => "event" in m && m.event === "world.open")).toBe(true);

    const worldStates = roomBroadcasts.filter((m) => m.type === "world.state");
    expect(worldStates).toHaveLength(1);
    expect(
      (worldStates[0] as { active: boolean; creditTotal: number }).active,
    ).toBe(true);
  });

  it("rejects with error when a world is already active in the same room", async () => {
    const { registry, worldState, users, opener } = makeDeps();
    const errors: ServerMessage[] = [];
    opener.conn.sendRaw = (text: string) => {
      const m = JSON.parse(text);
      if (m.type === "error") errors.push(m);
    };

    // First open succeeds
    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });
    // Second open should be rejected with error
    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });

    expect(errors).toHaveLength(1);
    expect((errors[0] as { code: string }).code).toBe("world_already_active");
  });

  it("rejects with error when a world is already active in a different room", async () => {
    const { registry, worldState, users } = makeDeps("room-1");
    // Pre-set world active in room-2 manually
    worldState.set({
      roomId: "room-2",
      npcUserId: "x",
      npcConnectionId: "y",
      startedAt: Date.now(),
      creditUsed: 0,
      creditTotal: 100_000,
      transcript: [],
      webhook: null,
      brainBusy: false,
    });

    const opener = fakeOpener("room-1");
    registry.add(opener.conn);

    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });

    const err = opener.outbox.find((m) => m.type === "error");
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe("world_already_active");
  });
});

describe("endWorld", () => {
  it("removes NPC from registry, clears state, broadcasts world.end + inactive world.state", async () => {
    const { registry, worldState, users, opener } = makeDeps();
    const captured: ServerMessage[] = [];
    opener.conn.sendRaw = (text: string) => captured.push(JSON.parse(text));

    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });
    captured.length = 0; // reset after open

    await endWorld(
      { users, registry, worldState, creditTotal: 100_000 },
      "credit_exhausted",
    );

    expect(worldState.isActive()).toBe(false);
    // Only the opener (real) should remain in the room
    const inRoom = registry.listByRoom("room-1");
    expect(inRoom).toHaveLength(1);
    expect(inRoom[0]?.kind).toBe("real");

    const endEvent = captured.find(
      (m) => m.type === "system" && "event" in m && m.event === "world.end",
    );
    expect(endEvent).toBeDefined();

    const finalState = captured.filter((m) => m.type === "world.state");
    const lastState = finalState[finalState.length - 1];
    expect(lastState).toBeDefined();
    expect((lastState as { active: boolean }).active).toBe(false);
  });

  it("includes the provided summary in the world.end body", async () => {
    const { registry, worldState, users, opener } = makeDeps();
    const captured: ServerMessage[] = [];
    opener.conn.sendRaw = (text: string) => captured.push(JSON.parse(text));

    await handleWorldOpen(opener.conn, {
      users,
      registry,
      worldState,
      creditTotal: 100_000,
    });
    captured.length = 0;

    await endWorld(
      { users, registry, worldState, creditTotal: 100_000 },
      "credit_exhausted",
      "FINAL_SUMMARY_TEXT",
    );

    const endEvent = captured.find(
      (m) => m.type === "system" && "event" in m && m.event === "world.end",
    );
    expect((endEvent as { body: string }).body).toContain("FINAL_SUMMARY_TEXT");
  });

  it("is a no-op when no world is active", async () => {
    const { registry, worldState, users } = makeDeps();
    await expect(
      endWorld(
        { users, registry, worldState, creditTotal: 100_000 },
        "admin_force",
      ),
    ).resolves.toBeUndefined();
    expect(worldState.isActive()).toBe(false);
  });
});
