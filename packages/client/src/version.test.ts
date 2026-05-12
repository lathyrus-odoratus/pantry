import { describe, it, expect } from "vitest";
import { compareSemver } from "./version.js";

describe("compareSemver", () => {
  it("returns positive when a > b", () => {
    expect(compareSemver("0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareSemver("0.1.10", "0.1.2")).toBeGreaterThan(0);
  });
  it("returns negative when a < b", () => {
    expect(compareSemver("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareSemver("0.0.1", "1.0.0")).toBeLessThan(0);
  });
  it("returns 0 when equal", () => {
    expect(compareSemver("0.1.0", "0.1.0")).toBe(0);
  });
  it("handles missing segments as 0", () => {
    expect(compareSemver("1", "1.0.0")).toBe(0);
    expect(compareSemver("1.1", "1.0.0")).toBeGreaterThan(0);
  });
});
