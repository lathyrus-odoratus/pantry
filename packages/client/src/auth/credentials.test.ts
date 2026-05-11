import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  type Credentials,
} from "./credentials.js";

describe("credentials", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cr-cred-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("save and load round trips", async () => {
    const path = join(dir, "credentials.json");
    const c: Credentials = {
      token: "jwt.payload.sig",
      provider: "github",
      savedAt: "2026-05-11T00:00:00.000Z",
    };
    await saveCredentials(c, path);
    const loaded = await loadCredentials(path);
    expect(loaded).toEqual(c);
  });

  it("save writes file with mode 0600", async () => {
    const path = join(dir, "credentials.json");
    await saveCredentials(
      { token: "t", provider: "github", savedAt: "x" },
      path,
    );
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("loadCredentials returns null when file missing", async () => {
    const loaded = await loadCredentials(join(dir, "nope.json"));
    expect(loaded).toBeNull();
  });

  it("loadCredentials returns null when file is invalid JSON", async () => {
    const { writeFileSync } = await import("node:fs");
    const path = join(dir, "credentials.json");
    writeFileSync(path, "not json");
    const loaded = await loadCredentials(path);
    expect(loaded).toBeNull();
  });

  it("loadCredentials returns null when JSON is valid but wrong shape", async () => {
    const { writeFileSync } = await import("node:fs");
    const path = join(dir, "credentials.json");
    writeFileSync(path, JSON.stringify({ foo: "bar" }));
    const loaded = await loadCredentials(path);
    expect(loaded).toBeNull();
  });

  it("clearCredentials removes the file", async () => {
    const path = join(dir, "credentials.json");
    await saveCredentials(
      { token: "t", provider: "github", savedAt: "x" },
      path,
    );
    expect(existsSync(path)).toBe(true);
    await clearCredentials(path);
    expect(existsSync(path)).toBe(false);
  });

  it("clearCredentials is a no-op when file missing", async () => {
    await clearCredentials(join(dir, "missing.json"));
    // no throw
  });
});
