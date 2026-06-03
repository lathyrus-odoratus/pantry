import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { ExtGameView } from "./ExtGameView.js";
import { useStore } from "../../store.js";
import type { ClientMessage } from "@pantry/shared";

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("ExtGameView key handling", () => {
  let send: (msg: ClientMessage) => void;

  beforeEach(() => {
    useStore.getState().reset();
    send = vi.fn();
    useStore.setState({
      extGameView: { role: "driver" },
      extGameOver: null,
      extGameFrame: "test frame",
      extGameActive: { by: "player1", gameId: "maze", title: "Maze" },
      extGameSend: send,
    });
  });

  it("forwards letter keys as-is", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("w");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "w" });
  });

  it("forwards enter key", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("\r");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "enter" });
  });

  it("forwards escape to backend instead of quitting locally", async () => {
    const onQuit = vi.fn();
    const { stdin } = render(<ExtGameView onQuit={onQuit} />);
    await flush();
    stdin.write("\x1b");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "escape" });
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("forwards arrow up", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("\x1b[A");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "up" });
  });

  it("forwards arrow down", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("\x1b[B");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "down" });
  });

  it("forwards arrow left", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("\x1b[D");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "left" });
  });

  it("forwards arrow right", async () => {
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("\x1b[C");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "right" });
  });

  it("q sends quit to backend during active game", async () => {
    const onQuit = vi.fn();
    const { stdin } = render(<ExtGameView onQuit={onQuit} />);
    await flush();
    stdin.write("q");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "quit" });
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("does not forward keys when spectator", async () => {
    useStore.setState({ extGameView: { role: "spectator" } });
    const { stdin } = render(<ExtGameView onQuit={vi.fn()} />);
    await flush();
    stdin.write("w");
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("q calls onQuit after game over, not send", async () => {
    useStore.setState({ extGameOver: { result: "win" } });
    const onQuit = vi.fn();
    const { stdin } = render(<ExtGameView onQuit={onQuit} />);
    await flush();
    stdin.write("q");
    await flush();
    expect(onQuit).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("escape calls onQuit after game over", async () => {
    useStore.setState({ extGameOver: { result: "loss" } });
    const onQuit = vi.fn();
    const { stdin } = render(<ExtGameView onQuit={onQuit} />);
    await flush();
    stdin.write("\x1b");
    await flush();
    expect(onQuit).toHaveBeenCalled();
  });
});
