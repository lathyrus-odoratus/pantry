import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { THEMES, type Theme } from "./theme.js";

export type Prefs = {
  messagePadding: number;
  theme: Theme;
};

export const DEFAULT_PREFS: Prefs = { messagePadding: 0, theme: "default" };

export function defaultPrefsPath(): string {
  return join(homedir(), ".pantry", "prefs.json");
}

// Tolerant of older/partial prefs files: unknown or missing fields fall back to
// the default rather than discarding the whole file (so adding `theme` doesn't
// reset existing users' messagePadding).
function normalizePrefs(value: unknown): Prefs {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PREFS };
  const p = value as Record<string, unknown>;
  const messagePadding =
    typeof p.messagePadding === "number"
      ? p.messagePadding
      : DEFAULT_PREFS.messagePadding;
  const theme = THEMES.includes(p.theme as Theme)
    ? (p.theme as Theme)
    : DEFAULT_PREFS.theme;
  return { messagePadding, theme };
}

export async function loadPrefs(path = defaultPrefsPath()): Promise<Prefs> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { ...DEFAULT_PREFS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  return normalizePrefs(parsed);
}

export async function savePrefs(
  p: Prefs,
  path = defaultPrefsPath(),
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify(p, null, 2), { mode: 0o600 });
    await chmod(path, 0o600);
  } catch {
    // silent fail — display prefs are not critical
  }
}
