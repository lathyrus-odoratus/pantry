import { describe, it, expect } from "vitest";
import { tint, dimText, borderTint } from "./theme.js";

describe("tint", () => {
  it("is the identity in the default theme (including undefined)", () => {
    expect(tint("cyan", "default")).toBe("cyan");
    expect(tint("#abcdef", "default")).toBe("#abcdef");
    expect(tint(undefined, "default")).toBeUndefined();
  });

  it("maps undefined (plain text) to a green step under matrix", () => {
    expect(tint(undefined, "matrix")).toBe("#13C413");
  });

  it("maps named colors onto the green ramp under matrix", () => {
    // bright accents
    expect(tint("cyan", "matrix")).toBe("#3DF23D");
    expect(tint("greenBright", "matrix")).toBe("#7CFC7C");
    // dim chrome
    expect(tint("gray", "matrix")).toBe("#0A7A0A");
    // case-insensitive
    expect(tint("CYAN", "matrix")).toBe(tint("cyan", "matrix"));
  });

  it("maps hex colors by luminance under matrix", () => {
    expect(tint("#ffffff", "matrix")).toBe("#7CFC7C"); // brightest
    expect(tint("#000000", "matrix")).toBe("#0A7A0A"); // darkest → dim
    expect(tint("#888", "matrix")).toBe("#13C413"); // mid → normal (3-digit hex)
  });

  it("falls back to a green step for unknown colors under matrix", () => {
    expect(tint("rebeccapurple", "matrix")).toBe("#13C413");
  });
});

describe("dimText", () => {
  it("uses terminal dim in default, dark-green fg under matrix", () => {
    expect(dimText("default")).toEqual({ dimColor: true });
    expect(dimText("matrix")).toEqual({ color: "#0A7A0A" });
  });
});

describe("borderTint", () => {
  it("is undefined in default, green under matrix", () => {
    expect(borderTint("default")).toBeUndefined();
    expect(borderTint("matrix")).toBe("#3DF23D");
  });
});
