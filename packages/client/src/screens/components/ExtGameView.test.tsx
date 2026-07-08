import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { ExtGameView } from "./ExtGameView.js";
import { useStore } from "../../store.js";

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("ExtGameView key handling", () => {
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useStore.getState().reset();
    send = vi.fn();
    useStore.setState({
      extGameView: { role: "driver" },
      extGameFrame: "test frame",
      extGameActive: { by: "player1", gameId: "shell", title: "遊戲" },
      extGameSend: send,
    });
  });

  it("forwards letter keys as-is", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("w");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "w" });
  });

  it("forwards enter key", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("\r");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "enter" });
  });

  it("forwards escape to shell instead of quitting locally", async () => {
    const onLeave = vi.fn();
    const { stdin } = render(<ExtGameView onLeave={onLeave} />);
    await flush();
    stdin.write("\x1b");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "escape" });
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("forwards q to shell (not intercepted for driver)", async () => {
    const onLeave = vi.fn();
    const { stdin } = render(<ExtGameView onLeave={onLeave} />);
    await flush();
    stdin.write("q");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "q" });
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("forwards arrow up", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("\x1b[A");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "up" });
  });

  it("forwards arrow down", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("\x1b[B");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "down" });
  });

  it("forwards arrow left", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("\x1b[D");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "left" });
  });

  it("forwards arrow right", async () => {
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("\x1b[C");
    await flush();
    expect(send).toHaveBeenCalledWith({ type: "ext.game.input", key: "right" });
  });

  it("does not forward keys when spectator", async () => {
    useStore.setState({ extGameView: { role: "spectator" } });
    const { stdin } = render(<ExtGameView onLeave={vi.fn()} />);
    await flush();
    stdin.write("w");
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("spectator can quit with q", async () => {
    useStore.setState({ extGameView: { role: "spectator" } });
    const onLeave = vi.fn();
    const { stdin } = render(<ExtGameView onLeave={onLeave} />);
    await flush();
    stdin.write("q");
    await flush();
    expect(onLeave).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("spectator can quit with escape", async () => {
    useStore.setState({ extGameView: { role: "spectator" } });
    const onLeave = vi.fn();
    const { stdin } = render(<ExtGameView onLeave={onLeave} />);
    await flush();
    stdin.write("\x1b");
    await flush();
    expect(onLeave).toHaveBeenCalled();
  });
});
