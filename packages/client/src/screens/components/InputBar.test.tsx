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
    const { stdin } = render(<InputBar onSend={onSend} onNick={onNick} onColor={() => {}} />);
    await flush();
    stdin.write("/foo bar");
    stdin.write("\r");
    await flush();
    expect(onSend).not.toHaveBeenCalled();
    expect(onNick).not.toHaveBeenCalled();
  });

  it("calls onColor with hex including #", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color #ff6b6b");
    stdin.write("\r");
    await flush();
    expect(onColor).toHaveBeenCalledWith("#ff6b6b");
  });

  it("calls onColor with bare hex (no #)", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color FF6B6B");
    stdin.write("\r");
    await flush();
    expect(onColor).toHaveBeenCalledWith("FF6B6B");
  });

  it("calls onColor(null) for /color reset", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color reset");
    stdin.write("\r");
    await flush();
    expect(onColor).toHaveBeenCalledWith(null);
  });

  it("calls onColor(null) for /color with no argument", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color");
    stdin.write("\r");
    await flush();
    expect(onColor).toHaveBeenCalledWith(null);
  });

  it("ignores /color with a color name (e.g. red)", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color red");
    stdin.write("\r");
    await flush();
    expect(onColor).not.toHaveBeenCalled();
  });

  it("ignores /color with 3-digit hex shorthand", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color #fff");
    stdin.write("\r");
    await flush();
    expect(onColor).not.toHaveBeenCalled();
  });

  it("ignores /color with 8-digit hex (alpha)", async () => {
    const onColor = vi.fn();
    const { stdin } = render(
      <InputBar onSend={() => {}} onNick={() => {}} onColor={onColor} />,
    );
    await flush();
    stdin.write("/color #ff6b6bff");
    stdin.write("\r");
    await flush();
    expect(onColor).not.toHaveBeenCalled();
  });

  it("calls onChangelog when /changelog is entered", async () => {
    const onChangelog = vi.fn();
    const { stdin } = render(
      <InputBar
        onSend={() => {}}
        onNick={() => {}}
        onColor={() => {}}
        onChangelog={onChangelog}
      />,
    );
    await flush();
    stdin.write("/changelog");
    stdin.write("\r");
    await flush();
    expect(onChangelog).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend on /changelog", async () => {
    const onSend = vi.fn();
    const { stdin } = render(
      <InputBar
        onSend={onSend}
        onNick={() => {}}
        onColor={() => {}}
        onChangelog={() => {}}
        onHelp={() => {}}
      />,
    );
    await flush();
    stdin.write("/changelog");
    stdin.write("\r");
    await flush();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onHelp on /h", async () => {
    const onHelp = vi.fn();
    const { stdin } = render(
      <InputBar
        onSend={() => {}}
        onNick={() => {}}
        onColor={() => {}}
        onChangelog={() => {}}
        onHelp={onHelp}
      />,
    );
    await flush();
    stdin.write("/h");
    stdin.write("\r");
    await flush();
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("calls onHelp on /help (alias)", async () => {
    const onHelp = vi.fn();
    const { stdin } = render(
      <InputBar
        onSend={() => {}}
        onNick={() => {}}
        onColor={() => {}}
        onChangelog={() => {}}
        onHelp={onHelp}
      />,
    );
    await flush();
    stdin.write("/help");
    stdin.write("\r");
    await flush();
    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});
