import { describe, it, expect } from "vitest";
import { generateDiscriminator, isValidDiscriminator } from "./discriminator.js";

describe("generateDiscriminator", () => {
  it("returns 4 lowercase-alphanumeric chars", () => {
    for (let i = 0; i < 100; i++) {
      const d = generateDiscriminator();
      expect(d).toMatch(/^[a-z0-9]{4}$/);
    }
  });

  it("produces varied outputs", () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateDiscriminator());
    // ~3.36M space — 200 draws should never collide enough to drop below 150 unique
    expect(set.size).toBeGreaterThan(150);
  });
});

describe("isValidDiscriminator", () => {
  it("accepts 4-char alphanumeric", () => {
    expect(isValidDiscriminator("a1b2")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isValidDiscriminator("a1b")).toBe(false);
    expect(isValidDiscriminator("a1b23")).toBe(false);
  });
  it("rejects uppercase", () => {
    expect(isValidDiscriminator("A1B2")).toBe(false);
  });
});
