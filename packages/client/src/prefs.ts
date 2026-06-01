import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Prefs = {
  messagePadding: number;
};

export const DEFAULT_PREFS: Prefs = { messagePadding: 0 };

export function defaultPrefsPath(): string {
  return join(homedir(), ".pantry", "prefs.json");
}

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p.messagePadding === "number";
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
  return isPrefs(parsed) ? parsed : { ...DEFAULT_PREFS };
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
