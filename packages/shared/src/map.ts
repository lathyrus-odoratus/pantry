import { z } from "zod";

export const floorSchema = z.enum(["grass", "road"]);
export type Floor = z.infer<typeof floorSchema>;

export const objectColorSchema = z.enum(["red", "orange", "yellow", "blue"]);
export type ObjectColor = z.infer<typeof objectColorSchema>;

export const objectTypeSchema = z.enum([
  "house",
  "block",
  "box",
  "tree",
  "bush",
  "player",
]);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const mapObjectSchema = z.object({
  type: objectTypeSchema,
  color: objectColorSchema.optional(),
});
export type MapObject = z.infer<typeof mapObjectSchema>;

export const mapV1Schema = z.object({
  version: z.literal(1),
  name: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  floor: z.array(z.array(floorSchema)),
  objects: z.array(z.array(mapObjectSchema.nullable())),
});
export type MapV1 = z.infer<typeof mapV1Schema>;

// ---- tile rendering spec (canonical hex; mirrored by tools/map-editor) ----
export type CellStyle = { r1: string; r2: string; fg: string; bg: string };

export const TILE_COLORS: Record<ObjectColor, { bg: string; fg: string }> = {
  red: { bg: "#ff0000", fg: "#af0000" },
  orange: { bg: "#ff8700", fg: "#af5f00" },
  yellow: { bg: "#ffd700", fg: "#af8700" },
  blue: { bg: "#0087ff", fg: "#000087" },
};

const GRASS = { bg: "#00af00", fg: "#00af00", glyph: ["    ", "    "] as const };
const ROAD = { bg: "#808080", fg: "#dadada", glyph: ["    ", " ╎  "] as const };

type ObjDef = {
  glyph: readonly [string, string];
  opaque: boolean;
  colored?: boolean;
  bg?: string;
  fg?: string;
};
const OBJ: Record<ObjectType, ObjDef> = {
  house: { glyph: ["▛▀▀▜", "▌▦▦▐"], opaque: true, colored: true },
  block: { glyph: ["▪▪▪▪", "▪▪▪▪"], opaque: true, colored: true },
  box: { glyph: ["┌╳╳┐", "└╳╳┘"], opaque: true, bg: "#d7af5f", fg: "#875f00" },
  tree: { glyph: [" ▲▲ ", " ┃┃ "], opaque: false, fg: "#005f00" },
  bush: { glyph: ["░░░░", "▒▒▒▒"], opaque: false, fg: "#00d700" },
  player: { glyph: [" ☺☺ ", " ◣◢ "], opaque: false, fg: "#ffffff" },
};

export function cellStyle(map: MapV1, r: number, c: number): CellStyle {
  const floor = map.floor[r]?.[c] === "road" ? ROAD : GRASS;
  const obj = map.objects[r]?.[c] ?? null;
  if (!obj) {
    return { r1: floor.glyph[0], r2: floor.glyph[1], fg: floor.fg, bg: floor.bg };
  }
  const def = OBJ[obj.type];
  if (def.opaque) {
    const bg = def.colored ? TILE_COLORS[obj.color ?? "red"].bg : def.bg ?? "#000000";
    const fg = def.colored ? TILE_COLORS[obj.color ?? "red"].fg : def.fg ?? "#ffffff";
    return { r1: def.glyph[0], r2: def.glyph[1], fg, bg };
  }
  return { r1: def.glyph[0], r2: def.glyph[1], fg: def.fg ?? "#ffffff", bg: floor.bg };
}

// ---- permalink codec (compact; mirrored by tools/map-editor encodeMap) ----
const HOUSE_CHAR: Record<ObjectColor, string> = { red: "r", orange: "o", yellow: "y", blue: "b" };
const BLOCK_CHAR: Record<ObjectColor, string> = { red: "R", orange: "O", yellow: "Y", blue: "B" };

function objToChar(o: MapObject | null): string {
  if (!o) return ".";
  if (o.type === "house") return o.color ? HOUSE_CHAR[o.color] : ".";
  if (o.type === "block") return o.color ? BLOCK_CHAR[o.color] : ".";
  if (o.type === "box") return "x";
  if (o.type === "tree") return "t";
  if (o.type === "bush") return "s";
  return "p"; // player
}

function charToObj(ch: string): MapObject | null {
  const house: Partial<Record<string, ObjectColor>> = { r: "red", o: "orange", y: "yellow", b: "blue" };
  const block: Partial<Record<string, ObjectColor>> = { R: "red", O: "orange", Y: "yellow", B: "blue" };
  const hc = house[ch];
  if (hc) return { type: "house", color: hc };
  const bc = block[ch];
  if (bc) return { type: "block", color: bc };
  if (ch === "x") return { type: "box" };
  if (ch === "t") return { type: "tree" };
  if (ch === "s") return { type: "bush" };
  if (ch === "p") return { type: "player" };
  return null;
}

export function encodePermalinkPayload(map: MapV1): string {
  let floorStr = "";
  let objStr = "";
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      floorStr += map.floor[r]?.[c] === "road" ? "#" : ".";
      objStr += objToChar(map.objects[r]?.[c] ?? null);
    }
  }
  return `1;${encodeURIComponent(map.name)};${map.w};${map.h};${floorStr};${objStr}`;
}

/** Parse a map from a permalink: accepts a full URL, a "#m=…" hash, or a raw payload. */
export function decodePermalink(input: string): MapV1 {
  let payload = input.trim();
  const idx = payload.indexOf("#m=");
  if (idx !== -1) payload = payload.slice(idx + 3);

  const p = payload.split(";");
  if (p[0] !== "1") throw new Error("unsupported map permalink");
  const name = decodeURIComponent(p[1] ?? "untitled");
  const w = Number(p[2]);
  const h = Number(p[3]);
  const floorStr = p[4] ?? "";
  const objStr = p[5] ?? "";
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error("bad map size");
  }
  if (floorStr.length < w * h || objStr.length < w * h) {
    throw new Error("truncated map data");
  }

  const floor: Floor[][] = [];
  const objects: (MapObject | null)[][] = [];
  for (let r = 0; r < h; r++) {
    const floorRow: Floor[] = [];
    const objRow: (MapObject | null)[] = [];
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      floorRow.push(floorStr[i] === "#" ? "road" : "grass");
      objRow.push(charToObj(objStr[i] ?? "."));
    }
    floor.push(floorRow);
    objects.push(objRow);
  }

  return mapV1Schema.parse({ version: 1, name, w, h, floor, objects });
}
