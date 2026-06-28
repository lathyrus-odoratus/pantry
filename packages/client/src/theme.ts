// UI theme. "default" leaves every color untouched (current look); "matrix"
// remaps the whole palette onto a green ramp — the Hacker/駭客任務 look — so even
// normally-uncolored text reads as green, differing only in brightness.

export type Theme = "default" | "matrix";

export const THEMES: Theme[] = ["default", "matrix"];

export const THEME_LABELS: Record<Theme, string> = {
  default: "Default",
  matrix: "Matrix",
};

// Four brightness steps of green. Order matters: brightest = strongest emphasis,
// dim = backgrounded chrome (hints, walls, system notices).
const GREEN = {
  brightest: "#7CFC7C",
  bright: "#3DF23D",
  normal: "#13C413",
  dim: "#0A7A0A",
} as const;

// Map the colors actually used across the client onto the green ramp by their
// perceived intensity / semantic emphasis. Keys are lowercased Ink color names.
const MATRIX_BY_NAME: Record<string, string> = {
  whitebright: GREEN.brightest,
  yellowbright: GREEN.brightest,
  greenbright: GREEN.brightest,
  cyanbright: GREEN.bright,
  bluebright: GREEN.bright,
  redbright: GREEN.bright,
  cyan: GREEN.bright,
  green: GREEN.bright,
  yellow: GREEN.normal,
  magenta: GREEN.normal,
  blue: GREEN.normal,
  red: GREEN.normal,
  white: GREEN.normal,
  gray: GREEN.dim,
  grey: GREEN.dim,
  blackbright: GREEN.dim,
};

const STEPS = [GREEN.dim, GREEN.normal, GREEN.bright, GREEN.brightest] as const;

// Map an arbitrary #rgb / #rrggbb to a green step by perceived luminance, so
// truecolor surfaces (e.g. the map renderer) keep their light/dark structure
// instead of flattening to one shade.
function hexToGreen(hex: string): string | undefined {
  const h = hex.replace(/^#/, "");
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0]! + h[0]!, 16);
    g = parseInt(h[1]! + h[1]!, 16);
    b = parseInt(h[2]! + h[2]!, 16);
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return undefined;
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0–255
  const idx = lum >= 200 ? 3 : lum >= 140 ? 2 : lum >= 70 ? 1 : 0;
  return STEPS[idx];
}

// Resolve a color for the active theme. In "default" it is the identity
// function (including undefined → undefined, i.e. the terminal's own fg). In
// "matrix" every input — named, hex, or undefined — collapses to a green step,
// so callers can wrap *every* <Text color> (and pass undefined for plain text)
// and get a uniformly green UI that still varies in brightness.
export function tint(
  color: string | undefined,
  theme: Theme,
): string | undefined {
  if (theme !== "matrix") return color;
  if (color === undefined) return GREEN.normal;
  const hit = MATRIX_BY_NAME[color.toLowerCase()];
  if (hit) return hit;
  if (color.startsWith("#")) return hexToGreen(color) ?? GREEN.normal;
  return GREEN.normal;
}

// Props to spread onto a <Text> that should render "dim". Under matrix, real
// terminal dimming (dimColor) muddies the green, so use a dark-green fg instead.
export function dimText(theme: Theme): {
  color?: string;
  dimColor?: boolean;
} {
  return theme === "matrix" ? { color: GREEN.dim } : { dimColor: true };
}

// Border color for framed boxes. undefined in default (terminal default),
// green under matrix.
export function borderTint(theme: Theme): string | undefined {
  return theme === "matrix" ? GREEN.bright : undefined;
}
