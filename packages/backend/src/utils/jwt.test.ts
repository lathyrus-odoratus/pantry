import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt.js";

const KEY = "0123456789abcdef0123456789abcdef";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("session token", () => {
  it("signs and verifies a token", () => {
    const token = signSessionToken({ userId: USER_ID, provider: "github" }, KEY);
    const decoded = verifySessionToken(token, KEY);
    expect(decoded.userId).toBe(USER_ID);
    expect(decoded.provider).toBe("github");
  });

  it("rejects a token signed with a different key", () => {
    const token = signSessionToken({ userId: USER_ID, provider: "github" }, KEY);
    expect(() => verifySessionToken(token, "x".repeat(32))).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signSessionToken({ userId: USER_ID, provider: "github" }, KEY);
    const bad = token.slice(0, -2) + "aa";
    expect(() => verifySessionToken(bad, KEY)).toThrow();
  });
});
