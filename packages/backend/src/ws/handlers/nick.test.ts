import { describe, it, expect, vi } from "vitest";
import type { ServerMessage } from "@pantry/shared";
import type { UsersRepo } from "../../db/users.js";
import { ConnectionRegistry, type AuthedConnection } from "../connection-registry.js";
import { handleNick } from "./nick.js";

function fakeConn(opts: Partial<AuthedConnection> & { userId: string; id: string }): {
  conn: AuthedConnection;
  outbox: ServerMessage[];
} {
  const outbox: ServerMessage[] = [];
  return {
    outbox,
    conn: {
      roomId: "room-1",
      nickname: "Alice",
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

function fakeUsersRepo(
  result: { nickname: string; discriminator: string },
): UsersRepo {
  return {
    renameWithDiscriminatorRetry: vi.fn().mockResolvedValue(result),
  } as unknown as UsersRepo;
}

describe("handleNick", () => {
  it("sends nick.ok directly to the renaming user with new name and discriminator", async () => {
    const registry = new ConnectionRegistry();
    const alice = fakeConn({ id: "c-a", userId: "u-alice", nickname: "Alice", discriminator: "ab12" });
    registry.add(alice.conn);

    await handleNick(
      alice.conn,
      { type: "nick.change", newNickname: "Alicia" },
      { users: fakeUsersRepo({ nickname: "Alicia", discriminator: "ab12" }), registry },
    );

    const nickOk = alice.outbox.find((m): m is Extract<ServerMessage, { type: "nick.ok" }> =>
      m.type === "nick.ok",
    );
    expect(nickOk).toBeDefined();
    expect(nickOk?.nickname).toBe("Alicia");
    expect(nickOk?.discriminator).toBe("ab12");
  });

  it("sends nick.ok before the system broadcast so the client name is correct when it processes system", async () => {
    const registry = new ConnectionRegistry();
    const alice = fakeConn({ id: "c-a", userId: "u-alice", nickname: "Alice", discriminator: "ab12" });
    registry.add(alice.conn);

    await handleNick(
      alice.conn,
      { type: "nick.change", newNickname: "Alicia" },
      { users: fakeUsersRepo({ nickname: "Alicia", discriminator: "ab12" }), registry },
    );

    const types = alice.outbox.map((m) => m.type);
    const nickOkIdx = types.indexOf("nick.ok");
    const sysIdx = types.indexOf("system");
    expect(nickOkIdx).toBeGreaterThanOrEqual(0);
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(nickOkIdx).toBeLessThan(sysIdx);
  });

  it("broadcasts system rename and presence to all room members", async () => {
    const registry = new ConnectionRegistry();
    const alice = fakeConn({ id: "c-a", userId: "u-alice", nickname: "Alice", discriminator: "ab12" });
    const bob = fakeConn({ id: "c-b", userId: "u-bob", nickname: "Bob", discriminator: "cd34" });
    registry.add(alice.conn);
    registry.add(bob.conn);

    await handleNick(
      alice.conn,
      { type: "nick.change", newNickname: "Alicia" },
      { users: fakeUsersRepo({ nickname: "Alicia", discriminator: "ab12" }), registry },
    );

    const bobSys = bob.outbox.find((m): m is Extract<ServerMessage, { type: "system" }> =>
      m.type === "system",
    );
    expect(bobSys?.body).toMatch(/Alice/);
    expect(bobSys?.body).toMatch(/Alicia/);
    expect(bob.outbox.some((m) => m.type === "presence")).toBe(true);
  });

  it("does not send nick.ok when nickname is unchanged", async () => {
    const registry = new ConnectionRegistry();
    const alice = fakeConn({ id: "c-a", userId: "u-alice", nickname: "Alice", discriminator: "ab12" });
    registry.add(alice.conn);

    await handleNick(
      alice.conn,
      { type: "nick.change", newNickname: "Alice" },
      { users: fakeUsersRepo({ nickname: "Alice", discriminator: "ab12" }), registry },
    );

    expect(alice.outbox.some((m) => m.type === "nick.ok")).toBe(false);
  });

  it("does not send nick.ok on invalid nickname", async () => {
    const registry = new ConnectionRegistry();
    const alice = fakeConn({ id: "c-a", userId: "u-alice", nickname: "Alice", discriminator: "ab12" });
    registry.add(alice.conn);

    await handleNick(
      alice.conn,
      { type: "nick.change", newNickname: "" },
      { users: fakeUsersRepo({ nickname: "Alice", discriminator: "ab12" }), registry },
    );

    expect(alice.outbox.some((m) => m.type === "nick.ok")).toBe(false);
    expect(alice.outbox.some((m) => m.type === "error")).toBe(true);
  });
});
