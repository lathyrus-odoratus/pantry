import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { InputBar } from "./InputBar.js";

// Wait for ink's useEffect-based useInput hook to register stdin listeners.
async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("InputBar", () => {
  it("calls onSend on Enter with the typed value", async () => {
    const onSend = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={() => {}} />);
    await flush();
    stdin.write("hello");
    stdin.write("\r");
    await flush();
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("calls onNick when input starts with /nick", async () => {
    const onNick = vi.fn();
    const { stdin } = render(<InputBar onSend={() => {}} onNick={onNick} />);
    await flush();
    stdin.write("/nick Alicia");
    stdin.write("\r");
    await flush();
    expect(onNick).toHaveBeenCalledWith("Alicia");
  });

  it("ignores empty submissions", async () => {
    const onSend = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={() => {}} />);
    await flush();
    stdin.write("\r");
    await flush();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("ignores unknown slash commands", async () => {
    const onSend = vi.fn();
    const onNick = vi.fn();
    const { stdin } = render(<InputBar onSend={onSend} onNick={onNick} />);
    await flush();
    stdin.write("/foo bar");
    stdin.write("\r");
    await flush();
    expect(onSend).not.toHaveBeenCalled();
    expect(onNick).not.toHaveBeenCalled();
  });
});
