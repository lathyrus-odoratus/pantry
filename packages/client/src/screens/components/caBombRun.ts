import { userInfo } from "node:os";
import { cellStyle, type MapV1 } from "@pantry/shared";
import { CaBombGame, DROP_CHANCE, type ItemType } from "./caBombMock.js";

// Standalone flicker-free renderer for the --ca-bomb POC. Ink's diff renderer
// (erase-line then rewrite) visibly flickers on a full-screen truecolor grid
// that repaints every frame, regardless of fps. Instead we own the alternate
// screen and repaint by writing the WHOLE frame in one cursor-home overwrite
// (no clear), wrapped in DEC synchronized-update so supporting terminals swap
// it atomically. Reuses the pure CaBombGame engine.
const RENDER_MS = 33;
const TRAIL_MS = 240;
const TRAIL_MAX = 2;
const RESET = "\x1b[0m";

const PLAYER = { r1: " ☺☺ ", r2: " ◣◢ ", fg: "#ffffff" };
const ENEMY = { r1: " ▼▼ ", r2: " ▲▲ ", fg: "#ff3030" };
const BOMB = { r1: " ◯◯ ", r2: " ◓◓ ", fg: "#0087ff" };
const BLAST = { r1: "≈≈≈≈", r2: "≈≈≈≈", fg: "#ffffff", bg: "#00aaff" };
const ITEM: Record<ItemType, { r1: string; r2: string; fg: string }> = {
  heart: { r1: " ♥♥ ", r2: " ♥♥ ", fg: "#ff5f5f" },
  bomb: { r1: " ◍◍ ", r2: " ◍◍ ", fg: "#33b5ff" },
  range: { r1: " ✦✦ ", r2: " ✦✦ ", fg: "#ffd700" },
};

type Ghost = { x: number; y: number; born: number };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function sgr(fg: string, bg: string): string {
  const [fr, fgn, fb] = rgb(fg);
  const [br, bgn, bb] = rgb(bg);
  return `\x1b[38;2;${fr};${fgn};${fb};48;2;${br};${bgn};${bb}m`;
}
function fgOnly(text: string, hex: string): string {
  const [r, g, b] = rgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}
function dim(text: string): string {
  return `\x1b[2m${text}${RESET}`;
}
function floorBg(map: MapV1, y: number, x: number): string {
  return map.floor[y]?.[x] === "road" ? "#808080" : "#00af00";
}

function stat(label: string, value: number, hex: string): string {
  return `${label} ${fgOnly("●".repeat(value), hex)}${dim("○".repeat(Math.max(0, 3 - value)))}`;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function pushDiscord(text: string): Promise<{ ok: boolean; reason: string }> {
  const url = process.env.PANTRY_DISCORD_WEBHOOK;
  if (!url) return { ok: false, reason: "PANTRY_DISCORD_WEBHOOK 未設定" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    return { ok: res.ok, reason: res.ok ? "" : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function resolveName(name?: string): string {
  if (name && name.trim()) return name.trim();
  try {
    const u = userInfo().username;
    if (u) return u;
  } catch {
    // ignore — fall through to default
  }
  return "player";
}

export function runCaBomb(map?: MapV1, name?: string): Promise<void> {
  const game = new CaBombGame(map);
  const playerName = resolveName(name);
  const out = process.stdout;
  const stdin = process.stdin;
  const startMs = Date.now();

  const trail: Ghost[] = [];
  let prevPlayer: { x: number; y: number } | null = null;
  let finished = false;
  let finishMs = 0;
  let discordPromise: Promise<{ ok: boolean; reason: string }> | null = null;

  function elapsedMs(): number {
    return (finished ? finishMs : Date.now()) - startMs;
  }

  function summary(): string {
    const result =
      game.status === "win" ? "勝利 ✅" : game.status === "loss" ? "失敗 💀" : "中途離開";
    return [
      "🎮 CA BOMB 成績",
      `玩家：${playerName}`,
      `結果：${result}`,
      `用時：${clock(elapsedMs())}`,
      `水球 Lv${game.player.bombCap} ／ 水力 Lv${game.player.range} ／ ❤ ${game.player.hp}`,
      `敵人剩餘：${game.enemies.length}`,
    ].join("\n");
  }

  function ghostGlyph(age: number): { r1: string; r2: string } {
    if (age < TRAIL_MS / 2) return { r1: PLAYER.r1, r2: PLAYER.r2 };
    return { r1: "    ", r2: " ·· " };
  }

  function render(): void {
    const now = Date.now();
    if (prevPlayer && (prevPlayer.x !== game.player.x || prevPlayer.y !== game.player.y)) {
      trail.unshift({ x: prevPlayer.x, y: prevPlayer.y, born: now });
      if (trail.length > TRAIL_MAX) trail.length = TRAIL_MAX;
    }
    prevPlayer = { x: game.player.x, y: game.player.y };
    const ghosts = new Map<string, number>();
    for (const g of trail) {
      const age = now - g.born;
      if (age < TRAIL_MS) ghosts.set(`${g.x},${g.y}`, age);
    }

    const bombs = new Set(game.bombs.map((b) => `${b.x},${b.y}`));
    const blasts = new Set(game.blasts.map((b) => `${b.x},${b.y}`));
    const enemies = new Set(game.enemies.map((e) => `${e.x},${e.y}`));

    const lines: string[] = [];
    lines.push(`${fgOnly("CA BOMB", "#ff5fff")}  ${fgOnly(playerName, "#ffffff")}  ${dim(`POC · ${game.map.name}`)}`);
    lines.push("");
    lines.push(
      [
        stat("❤", game.player.hp, "#ff5f5f"),
        stat("水球", game.player.bombCap, "#33b5ff"),
        stat("水力", game.player.range, "#ffd700"),
      ].join("   "),
    );
    lines.push(
      [
        dim(`敵人 ${game.enemies.length}`),
        dim(`掉落 ${Math.round(DROP_CHANCE * 100)}%`),
        dim(`⏱ ${clock(elapsedMs())}`),
      ].join("   "),
    );
    lines.push("");

    for (let r = 0; r < game.map.h; r++) {
      for (let part = 0; part < 2; part++) {
        let line = "";
        for (let c = 0; c < game.map.w; c++) {
          const k = `${c},${r}`;
          const bg = floorBg(game.map, r, c);
          let fg: string;
          let cbg: string;
          let seg: string;
          if (c === game.player.x && r === game.player.y) {
            fg = PLAYER.fg; cbg = bg; seg = part === 0 ? PLAYER.r1 : PLAYER.r2;
          } else if (enemies.has(k)) {
            fg = ENEMY.fg; cbg = bg; seg = part === 0 ? ENEMY.r1 : ENEMY.r2;
          } else if (blasts.has(k)) {
            fg = BLAST.fg; cbg = BLAST.bg; seg = part === 0 ? BLAST.r1 : BLAST.r2;
          } else if (bombs.has(k)) {
            fg = BOMB.fg; cbg = bg; seg = part === 0 ? BOMB.r1 : BOMB.r2;
          } else if (game.items.has(k)) {
            const it = ITEM[game.items.get(k)!];
            fg = it.fg; cbg = bg; seg = part === 0 ? it.r1 : it.r2;
          } else if (ghosts.has(k)) {
            const g = ghostGlyph(ghosts.get(k)!);
            fg = "#2f7f7f"; cbg = bg; seg = part === 0 ? g.r1 : g.r2;
          } else {
            const s = cellStyle(game.map, r, c);
            fg = s.fg; cbg = s.bg; seg = part === 0 ? s.r1 : s.r2;
          }
          line += sgr(fg, cbg) + seg;
        }
        lines.push(line + RESET);
      }
    }

    lines.push("");
    if (game.status === "win") lines.push(fgOnly("── 清光敵人，獲勝！ q 離開 ──", "#5fff5f"));
    else if (game.status === "loss") lines.push(fgOnly("── 你被炸飛了。 q 離開 ──", "#ff5f5f"));
    else lines.push(dim("WASD 移動（推箱）  Space 放水球  q 離開"));

    const frame = lines.map((l) => l + "\x1b[K").join("\r\n");
    out.write(`\x1b[?2026h\x1b[H${frame}\x1b[J\x1b[?2026l`);
  }

  return new Promise<void>((resolve) => {
    let closed = false;
    const cleanup = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      clearInterval(loop);
      stdin.off("data", onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      out.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
      // Score text → terminal (stays in scrollback) and Discord.
      console.log("\n" + summary());
      const ds = discordPromise ? await discordPromise : null;
      if (ds) console.log(ds.ok ? "→ 已推送到 Discord" : `→ Discord 未推送（${ds.reason}）`);
      resolve();
    };

    const onKey = (data: string): void => {
      for (const ch of data) {
        if (ch === "q" || ch === "\x1b" || ch === "\x03") {
          cleanup();
          return;
        }
        if (game.status !== "playing") continue;
        if (ch === "w") game.move(0, -1);
        else if (ch === "s") game.move(0, 1);
        else if (ch === "a") game.move(-1, 0);
        else if (ch === "d") game.move(1, 0);
        else if (ch === " ") game.placeBomb();
      }
      render();
    };

    out.write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onKey);
    const loop = setInterval(() => {
      game.tick(RENDER_MS);
      if (!finished && game.status !== "playing") {
        finished = true;
        finishMs = Date.now();
        discordPromise = pushDiscord(summary()); // fire once at the result
      }
      render();
    }, RENDER_MS);
    render();
  });
}
