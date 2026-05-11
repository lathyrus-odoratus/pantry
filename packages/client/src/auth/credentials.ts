import { mkdir, readFile, writeFile, unlink, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

export type OAuthProvider = "github" | "google" | "discord";

export type Credentials = {
  token: string;
  provider: OAuthProvider;
  savedAt: string;
};

export function defaultCredentialsPath(): string {
  return join(homedir(), ".chat-room", "credentials.json");
}

export async function saveCredentials(
  c: Credentials,
  path = defaultCredentialsPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c, null, 2), { mode: 0o600 });
  // Ensure mode is set even if the file already existed.
  await chmod(path, 0o600);
}

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.token === "string" &&
    typeof c.savedAt === "string" &&
    (c.provider === "github" || c.provider === "google" || c.provider === "discord")
  );
}

export async function loadCredentials(
  path = defaultCredentialsPath(),
): Promise<Credentials | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isCredentials(parsed) ? parsed : null;
}

export async function clearCredentials(
  path = defaultCredentialsPath(),
): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}
