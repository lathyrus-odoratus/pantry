import { describe, it, expect } from "vitest";
import { WorldStateStore, type ActiveWorld } from "./state.js";

function fakeActive(roomId = "r1"): ActiveWorld {
  return {
    roomId,
    npcUserId: "npc-user-id",
    npcConnectionId: "npc-conn-id",
    startedAt: 1000,
    creditUsed: 0,
    creditTotal: 100_000,
    transcript: [],
    webhook: null,
    brainBusy: false,
    pendingRoll: null,
    consecutiveInvalidRequests: 0,
    npcDebounceTimer: null,
  };
}

describe("WorldStateStore", () => {
  it("starts empty", () => {
    const s = new WorldStateStore();
    expect(s.get()).toBeNull();
    expect(s.isActive()).toBe(false);
    expect(s.isActiveInRoom("any")).toBe(false);
  });

  it("set + get tracks active world", () => {
    const s = new WorldStateStore();
    const a = fakeActive("r-7");
    s.set(a);
    expect(s.get()).toBe(a);
    expect(s.isActive()).toBe(true);
    expect(s.isActiveInRoom("r-7")).toBe(true);
    expect(s.isActiveInRoom("r-other")).toBe(false);
  });

  it("set(null) clears", () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    s.set(null);
    expect(s.get()).toBeNull();
    expect(s.isActive()).toBe(false);
  });

  it("addCreditUsage accumulates", () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    s.addCreditUsage(1200);
    s.addCreditUsage(800);
    expect(s.get()?.creditUsed).toBe(2000);
  });

  it("addCreditUsage is a no-op when inactive", () => {
    const s = new WorldStateStore();
    expect(() => s.addCreditUsage(1200)).not.toThrow();
    expect(s.get()).toBeNull();
  });

  it("appendTranscript pushes entries in order", () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    s.appendTranscript({ role: "player", authorLabel: "alice#ab12", body: "hi", at: 1 });
    s.appendTranscript({ role: "npc", authorLabel: "灰袍旅人#wxyz", body: "...", at: 2 });
    expect(s.get()?.transcript).toHaveLength(2);
    expect(s.get()?.transcript[0]?.body).toBe("hi");
    expect(s.get()?.transcript[1]?.role).toBe("npc");
  });
});

describe("WorldStateStore – debounce timer", () => {
  it("scheduleNpcTurn fires after the specified delay", async () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    let fired = false;
    s.scheduleNpcTurn(() => { fired = true; }, 10);
    expect(fired).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(fired).toBe(true);
  });

  it("re-scheduling before the first fires cancels the first", async () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    let count = 0;
    s.scheduleNpcTurn(() => { count++; }, 30);
    await new Promise((r) => setTimeout(r, 10));
    s.scheduleNpcTurn(() => { count++; }, 30);
    await new Promise((r) => setTimeout(r, 50));
    expect(count).toBe(1);
  });

  it("clearNpcDebounce prevents the callback from firing", async () => {
    const s = new WorldStateStore();
    s.set(fakeActive());
    let fired = false;
    s.scheduleNpcTurn(() => { fired = true; }, 20);
    s.clearNpcDebounce();
    await new Promise((r) => setTimeout(r, 40));
    expect(fired).toBe(false);
  });

  it("scheduleNpcTurn is a no-op when no world is active", () => {
    const s = new WorldStateStore();
    expect(() => s.scheduleNpcTurn(() => {}, 100)).not.toThrow();
  });

  it("clearNpcDebounce is a no-op when no world is active", () => {
    const s = new WorldStateStore();
    expect(() => s.clearNpcDebounce()).not.toThrow();
  });
});
