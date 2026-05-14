import { describe, it, expect } from "vitest";
import { parseDiceExpression, rollDice, formatRoll } from "./dice.js";

describe("parseDiceExpression", () => {
  it("parses d20 → 1 die of 20 sides, no modifier", () => {
    expect(parseDiceExpression("d20")).toEqual({
      count: 1,
      sides: 20,
      modifier: 0,
    });
  });

  it("parses 3d6 → 3 dice of 6 sides", () => {
    expect(parseDiceExpression("3d6")).toEqual({
      count: 3,
      sides: 6,
      modifier: 0,
    });
  });

  it("parses d8+2 → +2 modifier", () => {
    expect(parseDiceExpression("d8+2")).toEqual({
      count: 1,
      sides: 8,
      modifier: 2,
    });
  });

  it("parses 2d10-1 → negative modifier", () => {
    expect(parseDiceExpression("2d10-1")).toEqual({
      count: 2,
      sides: 10,
      modifier: -1,
    });
  });

  it("is case-insensitive on the d separator", () => {
    expect(parseDiceExpression("D20")).toEqual({
      count: 1,
      sides: 20,
      modifier: 0,
    });
  });

  it("rejects unknown sides (e.g., d7)", () => {
    expect(parseDiceExpression("d7")).toBeNull();
  });

  it("rejects too many dice (>20)", () => {
    expect(parseDiceExpression("21d6")).toBeNull();
  });

  it("rejects modifier above |999|", () => {
    expect(parseDiceExpression("d20+1000")).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseDiceExpression("hello")).toBeNull();
    expect(parseDiceExpression("d")).toBeNull();
    expect(parseDiceExpression("")).toBeNull();
    expect(parseDiceExpression("d20+")).toBeNull();
  });
});

describe("rollDice", () => {
  it("returns N rolls each in [1, sides]", () => {
    for (let i = 0; i < 30; i++) {
      const { rolls, total } = rollDice({ count: 3, sides: 6, modifier: 0 });
      expect(rolls).toHaveLength(3);
      for (const r of rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
      expect(total).toBe(rolls.reduce((s, r) => s + r, 0));
    }
  });

  it("applies modifier to total", () => {
    const { rolls, total } = rollDice({ count: 1, sides: 4, modifier: 10 });
    expect(total).toBe(rolls[0]! + 10);
  });
});

describe("formatRoll", () => {
  it("formats a single die without modifier compactly", () => {
    const out = formatRoll(
      "alice#ab12",
      { count: 1, sides: 20, modifier: 0 },
      { rolls: [14], total: 14 },
    );
    expect(out).toBe("🎲 alice#ab12 rolled d20 → 14");
  });

  it("formats multiple dice with their individual rolls", () => {
    const out = formatRoll(
      "alice#ab12",
      { count: 3, sides: 6, modifier: 0 },
      { rolls: [5, 2, 4], total: 11 },
    );
    expect(out).toBe("🎲 alice#ab12 rolled 3d6 → [5, 2, 4] = 11");
  });

  it("formats with a positive modifier", () => {
    const out = formatRoll(
      "alice#ab12",
      { count: 2, sides: 8, modifier: 3 },
      { rolls: [5, 6], total: 14 },
    );
    expect(out).toBe("🎲 alice#ab12 rolled 2d8+3 → [5, 6] + 3 = 14");
  });

  it("formats with a negative modifier", () => {
    const out = formatRoll(
      "alice#ab12",
      { count: 1, sides: 20, modifier: -2 },
      { rolls: [10], total: 8 },
    );
    expect(out).toBe("🎲 alice#ab12 rolled d20-2 → 10 - 2 = 8");
  });
});
