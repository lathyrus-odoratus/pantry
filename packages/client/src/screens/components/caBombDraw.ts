import { cellStyle, type ItemType, type MapV1 } from "@pantry/shared";
import { tint, type Theme } from "../../theme.js";

// Shared ANSI drawing for the CA-bomb full-screen renderers (offline sandbox +
// networked room overlay). All glyphs are 4 narrow chars × 2 rows — no emoji
// (they'd break the fixed cell width).
export const RESET = "\x1b[0m";

const TRAIL_MS = 240;
const TRAIL_MAX = 2;

const PLAYER = { r1: " ☺☺ ", r2: " ◣◢ ", fg: "#ffffff" };
const ENEMY = { r1: " ▼▼ ", r2: " ▲▲ ", fg: "#ff3030" };
const BOMB = { r1: " ◯◯ ", r2: " ◓◓ ", fg: "#0087ff" };
const BLAST = { r1: "≈≈≈≈", r2: "≈≈≈≈", fg: "#ffffff", bg: "#00aaff" };
const ITEM: Record<ItemType, { r1: string; r2: string; fg: string }> = {
  heart: { r1: " ♥♥ ", r2: " ♥♥ ", fg: "#ff5f5f" },
  bomb: { r1: " ◍◍ ", r2: " ◍◍ ", fg: "#33b5ff" },
  range: { r1: " ✦✦ ", r2: " ✦✦ ", fg: "#ffd700" },
};

export type BoardView = {
  map: MapV1;
  player: { x: number; y: number };
  bombs: Array<{ x: number; y: number }>;
  blasts: Array<{ x: number; y: number }>;
  enemies: Array<{ x: number; y: number }>;
  items: Array<{ x: number; y: number; type: ItemType }>;
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Luminance grayscale for the /watch bw spectate mode.
function grayed(hex: string, mono: boolean): [number, number, number] {
  const [r, g, b] = rgb(hex);
  if (!mono) return [r, g, b];
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return [y, y, y];
}
function sgrCell(fg: string, bg: string, mono: boolean): string {
  const [fr, fgn, fb] = grayed(fg, mono);
  const [br, bgn, bb] = grayed(bg, mono);
  return `\x1b[38;2;${fr};${fgn};${fb};48;2;${br};${bgn};${bb}m`;
}
export function fgOnly(text: string, hex: string, mono = false): string {
  const [r, g, b] = grayed(hex, mono);
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}
export function dim(text: string): string {
  return `\x1b[2m${text}${RESET}`;
}
export function stat(label: string, value: number, hex: string, mono = false): string {
  return `${label} ${fgOnly("●".repeat(value), hex, mono)}${dim("○".repeat(Math.max(0, 3 - value)))}`;
}
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function floorBg(map: MapV1, y: number, x: number): string {
  return map.floor[y]?.[x] === "road" ? "#808080" : "#00af00";
}
function ghostGlyph(age: number): { r1: string; r2: string } {
  if (age < TRAIL_MS / 2) return { r1: PLAYER.r1, r2: PLAYER.r2 };
  return { r1: "    ", r2: " ·· " };
}

// Tier 0 afterimage: remember cells the player just left and fade them out.
export class TrailTracker {
  private trail: Array<{ x: number; y: number; born: number }> = [];
  private prev: { x: number; y: number } | null = null;

  update(x: number, y: number, now: number): void {
    if (this.prev && (this.prev.x !== x || this.prev.y !== y)) {
      this.trail.unshift({ x: this.prev.x, y: this.prev.y, born: now });
      if (this.trail.length > TRAIL_MAX) this.trail.length = TRAIL_MAX;
    }
    this.prev = { x, y };
  }

  ghosts(now: number): Map<string, number> {
    const out = new Map<string, number>();
    for (const g of this.trail) {
      const age = now - g.born;
      if (age < TRAIL_MS) out.set(`${g.x},${g.y}`, age);
    }
    return out;
  }
}

export function boardLines(
  view: BoardView,
  ghosts: Map<string, number>,
  mono: boolean,
  theme: Theme = "default",
): string[] {
  const { map } = view;
  const bombs = new Set(view.bombs.map((b) => `${b.x},${b.y}`));
  const blasts = new Set(view.blasts.map((b) => `${b.x},${b.y}`));
  const enemies = new Set(view.enemies.map((e) => `${e.x},${e.y}`));
  const items = new Map(view.items.map((i) => [`${i.x},${i.y}`, i.type]));

  const lines: string[] = [];
  for (let r = 0; r < map.h; r++) {
    for (let part = 0; part < 2; part++) {
      let line = "";
      for (let c = 0; c < map.w; c++) {
        const k = `${c},${r}`;
        const bg = floorBg(map, r, c);
        let fg: string;
        let cbg: string;
        let seg: string;
        if (c === view.player.x && r === view.player.y) {
          fg = PLAYER.fg; cbg = bg; seg = part === 0 ? PLAYER.r1 : PLAYER.r2;
        } else if (enemies.has(k)) {
          fg = ENEMY.fg; cbg = bg; seg = part === 0 ? ENEMY.r1 : ENEMY.r2;
        } else if (blasts.has(k)) {
          fg = BLAST.fg; cbg = BLAST.bg; seg = part === 0 ? BLAST.r1 : BLAST.r2;
        } else if (bombs.has(k)) {
          fg = BOMB.fg; cbg = bg; seg = part === 0 ? BOMB.r1 : BOMB.r2;
        } else if (items.has(k)) {
          const it = ITEM[items.get(k)!];
          fg = it.fg; cbg = bg; seg = part === 0 ? it.r1 : it.r2;
        } else if (ghosts.has(k)) {
          const g = ghostGlyph(ghosts.get(k)!);
          fg = "#2f7f7f"; cbg = bg; seg = part === 0 ? g.r1 : g.r2;
        } else {
          const s = cellStyle(map, r, c);
          fg = s.fg; cbg = s.bg; seg = part === 0 ? s.r1 : s.r2;
        }
        line += sgrCell(tint(fg, theme) ?? fg, tint(cbg, theme) ?? cbg, mono) + seg;
      }
      lines.push(line + RESET);
    }
  }
  return lines;
}

// Compose lines into one cursor-home, no-clear, synchronized-update frame.
export function paintFrame(out: NodeJS.WriteStream, lines: string[]): void {
  const body = lines.map((l) => l + "\x1b[K").join("\r\n");
  out.write(`\x1b[?2026h\x1b[H${body}\x1b[J\x1b[?2026l`);
}
