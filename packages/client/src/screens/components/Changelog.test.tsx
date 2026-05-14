import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Changelog } from "./Changelog.js";
import type { ChangelogEntry } from "../../changelog.js";

const ENTRIES: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-05-20",
    title: "New thing",
    highlights: ["alpha", "beta"],
  },
  {
    version: "0.1.0",
    date: "2026-05-10",
    title: "Initial",
    highlights: ["first", "second"],
  },
];

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("Changelog", () => {
  it("renders the entry at the given index", async () => {
    const { lastFrame } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    await flush();
    const out = lastFrame() ?? "";
    expect(out).toContain("0.2.0");
    expect(out).toContain("New thing");
    expect(out).toContain("2026-05-20");
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
  });

  it("renders page indicator", async () => {
    const { lastFrame } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    await flush();
    expect(lastFrame() ?? "").toMatch(/1\s*\/\s*2/);
  });

  it("renders key bindings hint", async () => {
    const { lastFrame } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    await flush();
    const out = lastFrame() ?? "";
    expect(out).toContain("[");
    expect(out).toContain("]");
    expect(out).toContain("q");
  });

  it("] advances index by 1", async () => {
    const onIndexChange = vi.fn();
    const { stdin } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={onIndexChange}
        onClose={() => {}}
      />,
    );
    await flush();
    stdin.write("]");
    await flush();
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("[ decrements index by 1", async () => {
    const onIndexChange = vi.fn();
    const { stdin } = render(
      <Changelog
        entries={ENTRIES}
        index={1}
        onIndexChange={onIndexChange}
        onClose={() => {}}
      />,
    );
    await flush();
    stdin.write("[");
    await flush();
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("] at last page does NOT call onIndexChange", async () => {
    const onIndexChange = vi.fn();
    const { stdin } = render(
      <Changelog
        entries={ENTRIES}
        index={1}
        onIndexChange={onIndexChange}
        onClose={() => {}}
      />,
    );
    await flush();
    stdin.write("]");
    await flush();
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("[ at first page does NOT call onIndexChange", async () => {
    const onIndexChange = vi.fn();
    const { stdin } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={onIndexChange}
        onClose={() => {}}
      />,
    );
    await flush();
    stdin.write("[");
    await flush();
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("q calls onClose", async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <Changelog
        entries={ENTRIES}
        index={0}
        onIndexChange={() => {}}
        onClose={onClose}
      />,
    );
    await flush();
    stdin.write("q");
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
