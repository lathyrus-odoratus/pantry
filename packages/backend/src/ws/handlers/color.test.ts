import { describe, it, expect, vi } from "vitest";
import type { ServerMessage } from "@pantry/shared";
import type { UsersRepo } from "../../db/users.js";
import { ConnectionRegistry, type AuthedConnection } from "../connection-registry.js";
import { handleColor } from "./color.js";

function fakeConn(opts: Partial<AuthedConnection> & { userId: string; id: string }): {
  conn: AuthedConnection;
  outbox: ServerMessage[];
} {
  const outbox: ServerMessage[] = [];
  return {
    outbox,
    conn: {
      roomId: "room-1",
      nickname: "user",
      discriminator: "ab12",
      color: null,
      webhook: null,
      sendRaw: (text: string) => outbox.push(JSON.parse(text) as ServerMessage),
      close: () => {},
      kind: "real",
      ...opts,
    },
  };
}

function fakeUsersRepo(): UsersRepo {
  return {
    setColor: vi.fn().mockResolvedValue(undefined),
  } as unknown as UsersRepo;
}

function presenceFrom(outbox: ServerMessage[]): Extract<ServerMessage, { type: "presence" }> | undefined {
  return outbox.find(
    (m): m is Extract<ServerMessage, { type: "presence" }> => m.type === "presence",
  );
}

describe("handleColor", () => {
  it("normalizes bare-hex to #UPPER, persists, updates registry, broadcasts presence", async () => {
    const registry = new ConnectionRegistry();
    const users = fakeUsersRepo();
    const alice = fakeConn({ id: "c-a", userId: "user-alice", nickname: "Colora", color: null });
    const bob = fakeConn({ id: "c-b", userId: "user-bob", nickname: "Boba" });
    registry.add(alice.conn);
    registry.add(bob.conn);

    await handleColor(
      alice.conn,
      { type: "color.change", color: "ff6b6b" },
      { users, registry },
    );

    expect(users.setColor).toHaveBeenCalledWith("user-alice", "#FF6B6B");
    expect(registry.get("c-a")?.color).toBe("#FF6B6B");

    const alicePresence = presenceFrom(alice.outbox);
    const bobPresence = presenceFrom(bob.outbox);
    expect(alicePresence?.onlineUsers.find((u) => u.nickname === "Colora")?.color).toBe(
      "#FF6B6B",
    );
    expect(bobPresence?.onlineUsers.find((u) => u.nickname === "Colora")?.color).toBe(
      "#FF6B6B",
    );
  });

  it("accepts the four equivalent input forms and normalizes them all the same", async () => {
    for (const input of ["#FF6B6B", "ff6b6b", "FF6B6B", "#ff6b6b"]) {
      const registry = new ConnectionRegistry();
      const users = fakeUsersRepo();
      const alice = fakeConn({ id: "c-a", userId: "user-alice", color: null });
      registry.add(alice.conn);

      await handleColor(
        alice.conn,
        { type: "color.change", color: input },
        { users, registry },
      );

      expect(users.setColor).toHaveBeenCalledWith("user-alice", "#FF6B6B");
    }
  });

  it("resetting to null persists null, clears registry color, broadcasts null in presence", async () => {
    const registry = new ConnectionRegistry();
    const users = fakeUsersRepo();
    const alice = fakeConn({ id: "c-a", userId: "user-alice", nickname: "Colora", color: "#FF6B6B" });
    registry.add(alice.conn);

    await handleColor(
      alice.conn,
      { type: "color.change", color: null },
      { users, registry },
    );

    expect(users.setColor).toHaveBeenCalledWith("user-alice", null);
    expect(registry.get("c-a")?.color).toBeNull();
    const presence = presenceFrom(alice.outbox);
    expect(presence?.onlineUsers.find((u) => u.nickname === "Colora")?.color).toBeNull();
  });

  it("is a no-op when normalized value equals the current color (no DB write, no broadcast)", async () => {
    const registry = new ConnectionRegistry();
    const users = fakeUsersRepo();
    const alice = fakeConn({ id: "c-a", userId: "user-alice", color: "#FF6B6B" });
    registry.add(alice.conn);

    await handleColor(
      alice.conn,
      { type: "color.change", color: "ff6b6b" },
      { users, registry },
    );

    expect(users.setColor).not.toHaveBeenCalled();
    expect(alice.outbox).toHaveLength(0);
  });

  it("does not broadcast presence to a different room", async () => {
    const registry = new ConnectionRegistry();
    const users = fakeUsersRepo();
    const alice = fakeConn({ id: "c-a", userId: "user-alice", roomId: "room-1", color: null });
    const eve = fakeConn({ id: "c-e", userId: "user-eve", roomId: "room-2", color: null });
    registry.add(alice.conn);
    registry.add(eve.conn);

    await handleColor(
      alice.conn,
      { type: "color.change", color: "ff6b6b" },
      { users, registry },
    );

    expect(presenceFrom(alice.outbox)).toBeDefined();
    expect(presenceFrom(eve.outbox)).toBeUndefined();
  });
});
