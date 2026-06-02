import { useEffect } from "react";
import { useStore } from "../../store.js";
import { paintFrame } from "./caBombDraw.js";

const RENDER_MS = 100;

// Map raw stdin bytes to game key strings expected by the game service.
function parseKeys(data: string): string[] {
  const keys: string[] = [];
  let i = 0;
  while (i < data.length) {
    const ch = data[i]!;
    if (ch === "\x1b" && data[i + 1] === "[") {
      const seq = data[i + 2];
      if (seq === "A") keys.push("up");
      else if (seq === "B") keys.push("down");
      else if (seq === "C") keys.push("right");
      else if (seq === "D") keys.push("left");
      i += 3;
    } else if (ch === "\r") {
      keys.push("enter");
      i++;
    } else if (ch === "\x7f") {
      keys.push("backspace");
      i++;
    } else if (ch === "\x1b") {
      keys.push("escape");
      i++;
    } else {
      keys.push(ch);
      i++;
    }
  }
  return keys;
}

// Full-screen overlay for both the game-selection phase and the play phase.
// Mounted alongside Chat (Chat returns null while extGameView is set), so the WS
// connection stays alive throughout.
export function ExtGameOverlay(): null {
  const extGameSelecting = useStore((s) => s.extGameSelecting);
  const extGameView = useStore((s) => s.extGameView);

  useEffect(() => {
    if (!extGameSelecting && !extGameView) return;

    const out = process.stdout;
    const stdin = process.stdin;

    out.write("\x1b[?1049h\x1b[?25l");
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let done = false;
    let selectedIdx = 0;

    function quit(): void {
      if (done) return;
      done = true;
      const view = useStore.getState().extGameView;
      if (view?.role === "driver") {
        useStore.getState().extGameSend?.({ type: "ext.game.input", key: "quit" });
      } else if (view?.role === "spectator") {
        useStore.getState().extGameSend?.({ type: "ext.game.leave" });
      }
      useStore.getState().cancelExtGameSelect();
      useStore.getState().exitExtGame();
    }

    function onKey(data: string): void {
      const state = useStore.getState();
      const keys = parseKeys(data);

      for (const key of keys) {
        // Ctrl+C always exits
        if (key === "\x03") { quit(); return; }

        // ── Selection phase ──
        if (state.extGameSelecting && !state.extGameView) {
          const games = state.extGames;
          if (!games) continue;
          if (key === "q" || key === "escape") { quit(); return; }
          if (key === "k" || key === "up") {
            selectedIdx = Math.max(0, selectedIdx - 1);
          } else if (key === "j" || key === "down") {
            selectedIdx = Math.min(games.length - 1, selectedIdx + 1);
          } else if (key === "enter") {
            const chosen = games[selectedIdx];
            if (chosen) {
              state.extGameSend?.({ type: "ext.game.start", gameId: chosen.id });
            }
          } else {
            const n = parseInt(key, 10);
            if (!isNaN(n) && n >= 1 && n <= games.length) {
              selectedIdx = n - 1;
              const chosen = games[selectedIdx];
              if (chosen) {
                state.extGameSend?.({ type: "ext.game.start", gameId: chosen.id });
              }
            }
          }
          continue;
        }

        // ── Play / spectate phase ──
        if (state.extGameView) {
          if (key === "q") { quit(); return; }
          if (state.extGameView.role === "driver" && !state.extGameOver) {
            state.extGameSend?.({ type: "ext.game.input", key });
          }
        }
      }
    }

    stdin.on("data", onKey);

    function renderSelect(): void {
      const games = useStore.getState().extGames;
      const lines: string[] = [];
      lines.push("\x1b[1m選擇遊戲\x1b[0m");
      lines.push("");
      if (!games) {
        lines.push("\x1b[2m載入中…\x1b[0m");
      } else {
        games.forEach((g, i) => {
          const active = i === selectedIdx;
          const prefix = active ? "\x1b[1;36m> " : "  ";
          const reset = "\x1b[0m";
          lines.push(`${prefix}${i + 1}. ${g.title}${reset}`);
          lines.push(`   \x1b[2m${g.description}\x1b[0m`);
          lines.push("");
        });
        lines.push("\x1b[2m↑↓ / jk 選擇  Enter / 數字 確認  q 取消\x1b[0m");
      }
      paintFrame(out, lines);
    }

    function renderGame(): void {
      const state = useStore.getState();
      const frame = state.extGameFrame;
      const over = state.extGameOver;
      const view = state.extGameView;
      const active = state.extGameActive;

      const lines: string[] = [];
      const tag = view?.role === "driver" ? "你在玩" : "旁觀中";
      lines.push(`\x1b[1m${active?.title ?? "遊戲"}\x1b[0m  \x1b[2m${active?.by ?? ""}  ${tag}\x1b[0m`);
      lines.push("");
      if (frame) {
        for (const ln of frame.split("\n")) lines.push(ln);
      } else {
        lines.push("\x1b[2m連線中…\x1b[0m");
      }
      lines.push("");
      if (over) {
        const txt =
          over.result === "win" ? "獲勝！" : over.result === "loss" ? "失敗了。" : "遊戲結束。";
        lines.push(`\x1b[33m── ${txt}  q 離開 ──\x1b[0m`);
      } else {
        lines.push(
          `\x1b[2m${view?.role === "driver" ? "q 離開" : "旁觀中  q 離開"}\x1b[0m`,
        );
      }
      paintFrame(out, lines);
    }

    const loop = setInterval(() => {
      const state = useStore.getState();
      if (state.extGameSelecting && !state.extGameView) {
        renderSelect();
      } else if (state.extGameView) {
        renderGame();
      }
    }, RENDER_MS);

    // Initial render
    const initialState = useStore.getState();
    if (initialState.extGameSelecting) renderSelect();
    else renderGame();

    return () => {
      clearInterval(loop);
      stdin.off("data", onKey);
      out.write("\x1b[?25h\x1b[?1049l");
    };
  }, [extGameSelecting, extGameView]);

  return null;
}
