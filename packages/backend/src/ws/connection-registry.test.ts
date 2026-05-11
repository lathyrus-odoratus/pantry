import { describe, it, expect } from "vitest";
import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";

function fakeConn(id: string, userId: string, roomId: string): AuthedConnection {
  return {
    id,
    userId,
    roomId,
    nickname: "n",
    discriminator: "abcd",
    sendRaw: () => {},
    close: () => {},
  };
}

describe("ConnectionRegistry", () => {
  it("adds and lists by room", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    const b = fakeConn("c2", "u2", "r1");
    r.add(a);
    r.add(b);
    expect(new Set(r.listByRoom("r1").map((c) => c.id))).toEqual(new Set(["c1", "c2"]));
  });

  it("removes a connection", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    r.add(a);
    r.remove(a);
    expect(r.listByRoom("r1")).toEqual([]);
  });

  it("renaming reflects in listByRoom", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    r.add(a);
    r.rename("c1", "newnick", "wxyz");
    const got = r.listByRoom("r1");
    expect(got[0]?.nickname).toBe("newnick");
    expect(got[0]?.discriminator).toBe("wxyz");
  });

  it("listByRoom returns empty for unknown room", () => {
    const r = new ConnectionRegistry();
    expect(r.listByRoom("nope")).toEqual([]);
  });
});
