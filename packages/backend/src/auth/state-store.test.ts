import { describe, it, expect, beforeEach, vi } from "vitest";
import { OAuthStateStore } from "./state-store.js";

describe("OAuthStateStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("creates pending state and resolves it later", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    expect(typeof state).toBe("string");
    s.resolve(state, "tok-1");
    const result = s.consume(state);
    expect(result).toEqual({ status: "ready", token: "tok-1" });
  });

  it("consume returns pending until resolved", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    expect(s.consume(state)).toEqual({ status: "pending" });
  });

  it("expires after TTL", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(s.consume(state)).toEqual({ status: "not_found" });
  });

  it("clears after a successful consume", () => {
    const s = new OAuthStateStore();
    const state = s.createPending("github");
    s.resolve(state, "tok-1");
    expect(s.consume(state)).toEqual({ status: "ready", token: "tok-1" });
    expect(s.consume(state)).toEqual({ status: "not_found" });
  });
});
