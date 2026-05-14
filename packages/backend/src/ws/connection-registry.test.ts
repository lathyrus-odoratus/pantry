import { describe, it, expect } from "vitest";
import { ConnectionRegistry, type AuthedConnection } from "./connection-registry.js";

function fakeConn(id: string, userId: string, roomId: string): AuthedConnection {
  return {
    id,
    userId,
    roomId,
    nickname: "n",
    discriminator: "abcd",
    color: null,
    webhook: null,
    sendRaw: () => {},
    close: () => {},
    kind: "real",
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

  it("setColor updates a connection's color across all its sockets sharing userId", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    const b = fakeConn("c2", "u1", "r1"); // same user, different socket
    const c = fakeConn("c3", "u2", "r1"); // different user
    r.add(a);
    r.add(b);
    r.add(c);
    r.setColor("u1", "#FF6B6B");
    const list = r.listByRoom("r1");
    const aGot = list.find((x) => x.id === "c1");
    const bGot = list.find((x) => x.id === "c2");
    const cGot = list.find((x) => x.id === "c3");
    expect(aGot?.color).toBe("#FF6B6B");
    expect(bGot?.color).toBe("#FF6B6B");
    expect(cGot?.color).toBeNull();
  });

  it("setColor with null clears the color", () => {
    const r = new ConnectionRegistry();
    const a = fakeConn("c1", "u1", "r1");
    a.color = "#ABCDEF";
    r.add(a);
    r.setColor("u1", null);
    expect(r.listByRoom("r1")[0]?.color).toBeNull();
  });
});
