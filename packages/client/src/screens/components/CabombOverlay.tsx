import { useEffect } from "react";
import { useStore } from "../../store.js";
import { tint, type Theme } from "../../theme.js";
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
const PING_MS = 1500;

// Under matrix, "dim" terminal text muddies the green, so render dim hints as
// dark green instead. Mono (bw spectate) still wins — it stays grayscale.
function dimT(text: string, theme: Theme, mono: boolean): string {
  return theme === "matrix" && !mono ? fgOnly(text, "#0A7A0A", mono) : dim(text);
}

// Colour the latency readout green/amber/red by RTT, respecting mono mode.
function latencyText(ms: number | null, mono: boolean, theme: Theme): string {
  if (ms == null) return dimT("⚡ —", theme, mono);
  const hex = ms < 80 ? "#5fff5f" : ms < 200 ? "#ffd700" : "#ff5f5f";
  return fgOnly(`⚡ ${ms}ms`, tint(hex, theme) ?? hex, mono);
}

// Full-screen, flicker-free CA-bomb view rendered OUTSIDE Ink while the chat
// stays connected (Chat returns null while cabombView is set, so this owns the
// terminal). Driver mode sends inputs over WS; spectator mode is read-only.
// State arrives via the store (Chat's onMessage → setCabombState/Result).
export function CabombOverlay(): null {
  useEffect(() => {
    const view = useStore.getState().cabombView;
    if (!view) return;
    const { role, mono } = view;
    const theme = useStore.getState().prefs.theme;
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

    // Latency probe: echo a timestamp off the server every PING_MS; the pong
    // handler (Chat) records the RTT into the store, which the HUD reads.
    function ping(): void {
      useStore.getState().cabombSend?.({ type: "cabomb.ping", t: Date.now() });
    }
    ping();
    const pinger = setInterval(ping, PING_MS);

    function render(): void {
      const msg = useStore.getState().cabombState;
      const result = useStore.getState().cabombResult;
      const lines: string[] = [];
      if (!msg) {
        lines.push(dimT("連線中…  q 離開", theme, mono));
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
          `${fgOnly("CA BOMB", tint("#ff5fff", theme) ?? "#ff5fff", mono)}  ${fgOnly(msg.by, tint("#ffffff", theme) ?? "#ffffff", mono)}  ${dimT(tag, theme, mono)}`,
        );
        lines.push("");
        lines.push(
          [
            stat("❤", st.player.hp, tint("#ff5f5f", theme) ?? "#ff5f5f", mono),
            stat("水球", st.player.bombCap, tint("#33b5ff", theme) ?? "#33b5ff", mono),
            stat("水力", st.player.range, tint("#ffd700", theme) ?? "#ffd700", mono),
            dimT(`敵人 ${st.enemies.length}`, theme, mono),
            latencyText(useStore.getState().cabombLatencyMs, mono, theme),
          ].join("   "),
        );
        lines.push("");
        lines.push(...boardLines(board, trail.ghosts(now), mono, theme));
        lines.push("");
        if (result) {
          const txt =
            result.result === "win"
              ? "清光敵人，獲勝！"
              : result.result === "loss"
                ? "被炸飛了。"
                : "遊戲結束。";
          lines.push(fgOnly(`── ${txt} q 離開 ──`, tint("#ffd700", theme) ?? "#ffd700", mono));
          if (result.summary) {
            lines.push("");
            for (const ln of result.summary.split("\n")) lines.push(dimT(ln, theme, mono));
          }
        } else {
          lines.push(
            dimT(role === "driver" ? "WASD 移動（推箱）  Space 放水球  q 離開" : "旁觀中  q 離開", theme, mono),
          );
        }
      }
      paintFrame(out, lines);
    }

    const loop = setInterval(render, RENDER_MS);
    render();

    return () => {
      clearInterval(loop);
      clearInterval(pinger);
      stdin.off("data", onKey);
      out.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
    };
  }, []);

  return null;
}
