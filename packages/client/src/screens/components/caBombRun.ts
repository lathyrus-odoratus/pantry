import { userInfo } from "node:os";
import { type MapV1, CaBombGame, DROP_CHANCE } from "@pantry/shared";
import {
  type BoardView,
  TrailTracker,
  boardLines,
  clock,
  dim,
  fgOnly,
  paintFrame,
  stat,
} from "./caBombDraw.js";

// Standalone flicker-free renderer for the offline `--ca-bomb` sandbox. Owns the
// alternate screen and repaints the whole frame in one cursor-home overwrite (no
// clear), wrapped in DEC synchronized-update. Runs the engine locally; the
// networked room version lives in CabombOverlay.
const RENDER_MS = 33;

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
  const trail = new TrailTracker();

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

  function render(): void {
    const now = Date.now();
    trail.update(game.player.x, game.player.y, now);
    const view: BoardView = {
      map: game.map,
      player: game.player,
      bombs: game.bombs,
      blasts: game.blasts,
      enemies: game.enemies,
      items: [...game.items].map(([k, type]) => {
        const [x, y] = k.split(",").map(Number);
        return { x: x ?? 0, y: y ?? 0, type };
      }),
    };

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
    lines.push(...boardLines(view, trail.ghosts(now), false));
    lines.push("");
    if (game.status === "win") lines.push(fgOnly("── 清光敵人，獲勝！ q 離開 ──", "#5fff5f"));
    else if (game.status === "loss") lines.push(fgOnly("── 你被炸飛了。 q 離開 ──", "#ff5f5f"));
    else lines.push(dim("WASD 移動（推箱）  Space 放水球  q 離開"));

    paintFrame(out, lines);
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
        discordPromise = pushDiscord(summary());
      }
      render();
    }, RENDER_MS);
    render();
  });
}
