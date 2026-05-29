import { useEffect } from "react";
import { useStore } from "../../store.js";
import {
  type BoardView,
  TrailTracker,
  boardLines,
  dim,
  fgOnly,
  paintFrame,
  stat,
} from "./caBombDraw.js";

const RENDER_MS = 33;

// Full-screen, flicker-free CA-bomb view rendered OUTSIDE Ink while the chat
// stays connected (Chat returns null while cabombView is set, so this owns the
// terminal). Driver mode sends inputs over WS; spectator mode is read-only.
// State arrives via the store (Chat's onMessage → setCabombState/Result).
export function CabombOverlay(): null {
  useEffect(() => {
    const view = useStore.getState().cabombView;
    if (!view) return;
    const { role, mono } = view;
    const out = process.stdout;
    const stdin = process.stdin;
    const trail = new TrailTracker();

    out.write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let done = false;
    function quit(): void {
      if (done) return;
      done = true;
      const send = useStore.getState().cabombSend;
      if (role === "driver") send?.({ type: "cabomb.input", key: "quit" });
      else send?.({ type: "cabomb.leave" });
      useStore.getState().exitCabomb();
    }

    function onKey(data: string): void {
      const over = useStore.getState().cabombResult !== null;
      for (const ch of data) {
        if (ch === "q" || ch === "\x1b" || ch === "\x03") {
          quit();
          return;
        }
        if (over || role !== "driver") continue;
        const send = useStore.getState().cabombSend;
        if (ch === "w") send?.({ type: "cabomb.input", key: "w" });
        else if (ch === "s") send?.({ type: "cabomb.input", key: "s" });
        else if (ch === "a") send?.({ type: "cabomb.input", key: "a" });
        else if (ch === "d") send?.({ type: "cabomb.input", key: "d" });
        else if (ch === " ") send?.({ type: "cabomb.input", key: "bomb" });
      }
    }
    stdin.on("data", onKey);

    function render(): void {
      const msg = useStore.getState().cabombState;
      const result = useStore.getState().cabombResult;
      const lines: string[] = [];
      if (!msg) {
        lines.push(dim("連線中…  q 離開"));
      } else {
        const st = msg.state;
        const now = Date.now();
        trail.update(st.player.x, st.player.y, now);
        const board: BoardView = {
          map: st.map,
          player: st.player,
          bombs: st.bombs,
          blasts: st.blasts,
          enemies: st.enemies,
          items: st.items,
        };
        const tag = role === "driver" ? "你在玩" : mono ? "旁觀中（黑白）" : "旁觀中";
        lines.push(
          `${fgOnly("CA BOMB", "#ff5fff", mono)}  ${fgOnly(msg.by, "#ffffff", mono)}  ${dim(tag)}`,
        );
        lines.push("");
        lines.push(
          [
            stat("❤", st.player.hp, "#ff5f5f", mono),
            stat("水球", st.player.bombCap, "#33b5ff", mono),
            stat("水力", st.player.range, "#ffd700", mono),
            dim(`敵人 ${st.enemies.length}`),
          ].join("   "),
        );
        lines.push("");
        lines.push(...boardLines(board, trail.ghosts(now), mono));
        lines.push("");
        if (result) {
          const txt =
            result.result === "win"
              ? "清光敵人，獲勝！"
              : result.result === "loss"
                ? "被炸飛了。"
                : "遊戲結束。";
          lines.push(fgOnly(`── ${txt} q 離開 ──`, "#ffd700", mono));
        } else {
          lines.push(
            dim(role === "driver" ? "WASD 移動（推箱）  Space 放水球  q 離開" : "旁觀中  q 離開"),
          );
        }
      }
      paintFrame(out, lines);
    }

    const loop = setInterval(render, RENDER_MS);
    render();

    return () => {
      clearInterval(loop);
      stdin.off("data", onKey);
      out.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
    };
  }, []);

  return null;
}
