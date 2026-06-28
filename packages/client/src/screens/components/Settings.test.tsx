import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { Settings } from "./Settings.js";
import { DEFAULT_PREFS, type Prefs } from "../../prefs.js";

const ESC = "\x1b";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const DOWN = "\x1b[B";

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

function setup(prefs: Prefs = { ...DEFAULT_PREFS }) {
  const onPrefsChange = vi.fn();
  const onClose = vi.fn();
  const r = render(
    <Settings prefs={prefs} onPrefsChange={onPrefsChange} onClose={onClose} />,
  );
  return { ...r, onPrefsChange, onClose };
}

describe("Settings", () => {
  it("shows the current theme label", () => {
    expect(setup().lastFrame()).toContain("Default");
    expect(setup({ ...DEFAULT_PREFS, theme: "matrix" }).lastFrame()).toContain(
      "Matrix",
    );
  });

  it("changes the theme on the theme row (left/right)", async () => {
    const { stdin, onPrefsChange } = setup();
    await flush();
    stdin.write(RIGHT);
    await flush();
    expect(onPrefsChange).toHaveBeenCalledWith({
      ...DEFAULT_PREFS,
      theme: "matrix",
    });
  });

  it("adjusts message padding only after moving down to its row", async () => {
    const { stdin, onPrefsChange } = setup();
    await flush();
    // Row 0 is theme; right here must NOT touch padding.
    stdin.write(DOWN); // move to padding row
    await flush();
    stdin.write(RIGHT);
    await flush();
    expect(onPrefsChange).toHaveBeenCalledWith({
      ...DEFAULT_PREFS,
      messagePadding: 1,
    });
  });

  it("closes on Esc", async () => {
    const { stdin, onClose } = setup();
    await flush();
    stdin.write(ESC);
    await flush();
    expect(onClose).toHaveBeenCalled();
  });

  it("clamps padding at the minimum", async () => {
    const { stdin, onPrefsChange } = setup();
    await flush();
    stdin.write(DOWN);
    await flush();
    stdin.write(LEFT); // already at 0
    await flush();
    expect(onPrefsChange).not.toHaveBeenCalled();
  });
});
