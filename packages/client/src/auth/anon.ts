import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type AnonIdentity = {
  subject: string;
  nickname: string;
};

export function defaultAnonPath(): string {
  return join(homedir(), ".pantry", "anon.json");
}

export function newAnonSubject(): string {
  return `anon:${randomUUID()}`;
}

export async function saveAnon(
  c: AnonIdentity,
  path = defaultAnonPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}

function isAnonIdentity(value: unknown): value is AnonIdentity {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.subject === "string" &&
    /^anon:[A-Za-z0-9._-]+$/.test(c.subject) &&
    typeof c.nickname === "string" &&
    c.nickname.length > 0
  );
}

export async function loadAnon(
  path = defaultAnonPath(),
): Promise<AnonIdentity | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isAnonIdentity(parsed) ? parsed : null;
}
