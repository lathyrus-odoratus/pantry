import { describe, it, expect } from "vitest";
import { encodePermalinkPayload, type MapV1 } from "@pantry/shared";
import { findMaps } from "./mapLinks.js";

const sample: MapV1 = {
  version: 1,
  name: "demo",
  w: 2,
  h: 1,
  floor: [["grass", "road"]],
  objects: [[{ type: "house", color: "red" }, null]],
};

const permalink = `https://lathyrus-odoratus.github.io/pantry/#m=${encodePermalinkPayload(sample)}`;

describe("findMaps", () => {
  it("decodes a map permalink embedded in surrounding text", () => {
    const maps = findMaps(`看看這張 ${permalink} 還不錯`);
    expect(maps).toHaveLength(1);
    expect(maps[0]).toEqual(sample);
  });

  it("ignores ordinary links without a #m= payload", () => {
    expect(findMaps("https://example.com/foo and https://x.y/z")).toHaveLength(0);
  });

  it("skips a #m= link whose payload is malformed", () => {
    expect(findMaps("https://e.x/#m=not-a-real-payload")).toHaveLength(0);
  });

  it("returns an empty array when there are no URLs", () => {
    expect(findMaps("just plain chat, no links")).toHaveLength(0);
  });

  it("finds multiple map links in one message", () => {
    expect(findMaps(`${permalink} ${permalink}`)).toHaveLength(2);
  });
});
