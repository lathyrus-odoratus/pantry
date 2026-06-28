import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPrefs, savePrefs, DEFAULT_PREFS } from "./prefs.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pantry-prefs-"));
  dirs.push(dir);
  return join(dir, "prefs.json");
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("prefs", () => {
  it("returns defaults when the file is missing", async () => {
    expect(await loadPrefs(await tmpFile())).toEqual(DEFAULT_PREFS);
  });

  it("round-trips theme and messagePadding", async () => {
    const path = await tmpFile();
    await savePrefs({ messagePadding: 2, theme: "matrix" }, path);
    expect(await loadPrefs(path)).toEqual({ messagePadding: 2, theme: "matrix" });
  });

  it("keeps messagePadding from an older file that has no theme field", async () => {
    const path = await tmpFile();
    await writeFile(path, JSON.stringify({ messagePadding: 3 }));
    expect(await loadPrefs(path)).toEqual({ messagePadding: 3, theme: "default" });
  });

  it("falls back to default theme for an unknown theme value", async () => {
    const path = await tmpFile();
    await writeFile(path, JSON.stringify({ messagePadding: 1, theme: "neon" }));
    expect(await loadPrefs(path)).toEqual({ messagePadding: 1, theme: "default" });
  });
});
