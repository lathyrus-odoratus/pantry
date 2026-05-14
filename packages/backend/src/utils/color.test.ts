import { describe, it, expect } from "vitest";
import { normalizeColor } from "./color.js";

describe("normalizeColor", () => {
  it("uppercases lowercase hex with leading #", () => {
    expect(normalizeColor("#ff6b6b")).toBe("#FF6B6B");
  });

  it("adds leading # to bare hex", () => {
    expect(normalizeColor("ff6b6b")).toBe("#FF6B6B");
  });

  it("uppercases bare lowercase hex", () => {
    expect(normalizeColor("abcdef")).toBe("#ABCDEF");
  });

  it("passes through canonical form unchanged", () => {
    expect(normalizeColor("#FF6B6B")).toBe("#FF6B6B");
  });

  it("preserves digits", () => {
    expect(normalizeColor("#012345")).toBe("#012345");
  });
});
