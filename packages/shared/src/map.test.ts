import { describe, it, expect } from "vitest";
import {
  decodePermalink,
  encodePermalinkPayload,
  cellStyle,
  TILE_COLORS,
  type MapV1,
} from "./map.js";

const sample: MapV1 = {
  version: 1,
  name: "t e/s;t name",
  w: 3,
  h: 2,
  floor: [
    ["grass", "road", "grass"],
    ["road", "grass", "road"],
  ],
  objects: [
    [null, { type: "house", color: "blue" }, { type: "tree" }],
    [{ type: "box" }, null, { type: "player" }],
  ],
};

describe("permalink codec", () => {
  it("round-trips through #m= hash", () => {
    const payload = encodePermalinkPayload(sample);
    expect(decodePermalink("#m=" + payload)).toEqual(sample);
  });

  it("round-trips when embedded in a full URL (name with special chars survives)", () => {
    const payload = encodePermalinkPayload(sample);
    expect(decodePermalink(`https://example.com/tools/map-editor/#m=${payload}`)).toEqual(sample);
  });

  it("accepts a raw payload without the #m= prefix", () => {
    const payload = encodePermalinkPayload(sample);
    expect(decodePermalink(payload)).toEqual(sample);
  });

  it("rejects an unsupported / non-map string", () => {
    expect(() => decodePermalink("https://example.com/")).toThrow();
  });

  it("rejects truncated map data", () => {
    expect(() => decodePermalink("#m=1;x;3;2;..-;.")).toThrow();
  });

  // "#" is the URL fragment delimiter; if it were the road sentinel it would be
  // percent-encoded to %23 on a location.hash round-trip and silently lost.
  it("encodes road with a URL-safe sentinel, never '#'", () => {
    const payload = encodePermalinkPayload(sample);
    expect(payload).not.toContain("#");
    expect(payload).toContain("-"); // sample has road cells
  });
});

describe("cellStyle", () => {
  it("uses the object color for an opaque colored tile (house)", () => {
    const s = cellStyle(sample, 0, 1);
    expect(s.bg).toBe(TILE_COLORS.blue.bg);
    expect(s.fg).toBe(TILE_COLORS.blue.fg);
  });

  it("keeps the underlying floor bg for an overlay tile (player on road)", () => {
    const s = cellStyle(sample, 1, 2);
    expect(s.bg).toBe("#808080"); // road
    expect(s.fg).toBe("#ffffff"); // player
  });

  it("renders bare grass floor when no object is present", () => {
    const grass = cellStyle(sample, 0, 0);
    expect(grass.bg).toBe("#00af00");
  });

  it("renders an opaque non-colored tile with its own color (box → wood)", () => {
    const box = cellStyle(sample, 1, 0);
    expect(box.bg).toBe("#d7af5f");
    expect(box.fg).toBe("#875f00");
  });
});
