export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

// Latest first. Keep in lockstep with packages/client/package.json#version
// when shipping a release (see CLAUDE.md release flow).
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.29",
    date: "2026-06-02",
    title: "被 @提及時訊息高亮 + /font 調整行距",
    highlights: [
      "有人用 @你的暱稱#編號 提及你時，該訊息的提及欄位會反白高亮，比較不會漏看。",
      "新增 /font normal|medium|large，可調整訊息行距讓畫面更好讀。",
    ],
  },
  {
    version: "0.1.28",
    date: "2026-06-02",
    title: "新增 /game：在聊天室裡玩 CLI 小遊戲",
    highlights: [
      "輸入 /game 從遊戲清單挑一款小遊戲開始玩，畫面直接顯示在聊天室裡，房間其他人可以繼續聊天。",
      "別人會在狀態列看到提示，輸入 /watch 就能旁觀你的遊戲。",
      "按 q 離開、斷線或閒置兩分鐘後，遊戲會自動結束。",
    ],
  },
  {
    version: "0.1.27",
    date: "2026-06-01",
    title: "修正 /ca-bomb 一進去就顯示「遊戲結束」",
    highlights: [
      "修正房內看過上一場 /ca-bomb 結束後，自己再開新的一場時會立刻卡在「遊戲結束」、按鍵沒反應的問題。現在每次開局都會從乾淨狀態開始。",
    ],
  },
  {
    version: "0.1.26",
    date: "2026-05-30",
    title: "/ca-bomb 全螢幕加上延遲(ping)顯示",
    highlights: [
      "/ca-bomb 全螢幕的 HUD 右側新增即時延遲讀數 ⚡，顯示與伺服器之間的來回延遲（RTT），會依快慢標成綠/黃/紅。房內版是伺服器主導，按鍵到畫面更新會經過一次來回，這個數字能讓你判斷卡頓是不是來自網路。driver 和旁觀者都看得到。",
    ],
  },
  {
    version: "0.1.25",
    date: "2026-05-30",
    title: "新增 /ca-bomb 爆爆王風格炸彈遊戲 + 全螢幕旁觀",
    highlights: [
      "在聊天室輸入 /ca-bomb 開一場 Crazy Arcade 風格的炸彈遊戲：WASD 移動（可推箱）、空白鍵放水球、q 離開。炸箱掉道具成長「水球（數量）／水力（範圍）／❤」，清光敵人就贏。",
      "同房的其他人可選擇性進全螢幕旁觀：輸入 /watch 看彩色、/watch bw 看黑白；不想看就照常聊天。狀態列會持續顯示目前有沒有人在玩。",
      "也可用 pantry --ca-bomb 離線單機玩（搭配 --name 顯示玩家名）。",
    ],
  },
  {
    version: "0.1.24",
    date: "2026-05-29",
    title: "新增 /bomb 炸彈超人小遊戲",
    highlights: [
      "在聊天室輸入 /bomb 開一場單人炸彈超人：WASD 移動、空白鍵放炸彈、q 離開。炸掉所有敵人就贏，HP 歸零就輸。",
      "同房間的其他人會在輸入欄上方看到即時觀戰畫面，仍可正常聊天。每個房間同時只能有一場遊戲。",
    ],
  },
  {
    version: "0.1.23",
    date: "2026-05-28",
    title: "修正：貼地圖連結沒顯示馬路",
    highlights: [
      "修正貼上地圖連結時「馬路」沒有渲染的問題——連結裡代表馬路的符號與網址結構衝突而在傳遞中遺失（房子、樹、木箱不受影響）。請從地圖編輯器重新複製一條新連結，舊連結需重新產生。",
    ],
  },
  {
    version: "0.1.22",
    date: "2026-05-28",
    title: "聊天貼地圖連結會內嵌渲染地圖",
    highlights: [
      "在聊天室貼上地圖編輯器（https://lathyrus-odoratus.github.io/pantry/）的連結，pantry 會直接在那則訊息下方把地圖渲染出來（像連結預覽）。純終端顯示，訊息本體仍是原始連結，不影響 Discord 等其他客戶端。",
      "也可用 `pantry --map \"<連結>\"` 開獨立全螢幕檢視同一張地圖。這是日後在 pantry 內建 Crazy Arcade 小遊戲的第一步。",
    ],
  },
  {
    version: "0.1.21",
    date: "2026-05-28",
    title: "/settings 選單 + 長網址精簡為可點連結",
    highlights: [
      "新增 /settings 選單，目前可調整聊天訊息的段落間距（行距）；之後其他偏好設定也會收在這裡。",
      "過長的網址（例如從 Discord 轉發進來的附件連結）會精簡成可點擊的短標籤（如 `cdn.discordapp.com/…/image.png`），在支援超連結的終端機可直接點開；不支援的終端機仍顯示完整網址。",
    ],
  },
  {
    version: "0.1.20",
    date: "2026-05-19",
    title: "World chat 中 NPC 訊息上下加空行",
    highlights: [
      "在 `/the-world` TRPG 模式裡，灰袍旅人（NPC）的訊息上下各加一行空白，視覺上跟玩家訊息分開，旁白比較好讀。",
    ],
  },
  {
    version: "0.1.19",
    date: "2026-05-15",
    title: "Reconnect 畫面顯示斷線原因",
    highlights: [
      "重連時 StatusBar 多印一行 `· last: <code> <reason>`，把 server 主動關閉（4001 auth_timeout / 4002 room_not_found 之類）和網路層斷線（1006 abnormal、Unexpected server response: 4xx）區分開來，回報問題時直接截圖就能看出 root cause。",
      "Pre-connect 階段的 error message（TLS 失敗、proxy 把 Upgrade header 吃掉、DNS 不通）現在也會一併顯示，不再被 transport 預設靜默。",
    ],
  },
  {
    version: "0.1.18",
    date: "2026-05-15",
    title: "Admin scene (--admin) + room close/reopen",
    highlights: [
      "`pantry --admin` enters a Discord-authenticated admin TUI for managing rooms (list / create / close / reopen / delete). Requires admin grant on the server.",
      "Rooms can be 'closed' — history preserved, new joins rejected (`Auth failed: room_closed`); existing connections stay until they drop. Admin can reopen.",
      "Admin's Discord token cached at ~/.pantry/credentials.json (mode 600, 7-day) so repeat `--admin` launches skip the OAuth dance.",
    ],
  },
  {
    version: "0.1.17",
    date: "2026-05-14",
    title: "Cheaper LLM, NPC reacts to dice, clearer /roll prompt",
    highlights: [
      "Transcript-level prompt caching enabled — repeat history bytes now read from cache at ~10% cost, so a 100k-credit world should support ~2–3× more turns.",
      "Credit budget now weighted by real Haiku 4.5 cost ratio (cache reads ×0.1, output ×5). Progress bar tracks $ spend, not raw tokens.",
      "Every LLM call logs its token breakdown (input / cache_read / cache_write / output / weighted) so we can audit spend retrospectively.",
      "After you /roll, the NPC reacts immediately to the outcome instead of waiting for someone to speak again.",
      "When the NPC asks for a roll, a system hint follows the message — 「🎲 等候 X 打 /roll」— so it's clear whose action provoked the dice.",
    ],
  },
  {
    version: "0.1.16",
    date: "2026-05-14",
    title: "GM-driven dice + NPC emoji moves + summary stays 正體",
    highlights: [
      "Dice flow flipped: /roll takes no argument. The NPC asks for a roll via `[[roll:d20]]` markers in its responses (server replaces the marker with an inline 🎲(d20) hint and parks the spec in world state). /roll consumes the pending spec and broadcasts the result; outcome enters the transcript so the NPC sees it on its next turn. /roll only works inside an active world.",
      "NPC's 🌫 emoji renders in front of the nickname (parallel with the 🎲 player marker) instead of being part of the body.",
      "End-of-world summary now hard-bans simplified characters via its own focused system prompt (previous releases let the closing recap drift back to 简体).",
    ],
  },
  {
    version: "0.1.14",
    date: "2026-05-14",
    title: "World polish + testing mode",
    highlights: [
      "NPC speech is now prefixed with 🌫 so the traveler's lines stand out from human players.",
      "Easter egg: while a world is active, each player's nick gets a 🎲 in front — testing-period only, marks the TRPG cast.",
      "World open/end notices carry an emoji (🌍 / 🌒); the multi-line end summary no longer gets ── ── wrapped.",
      "World open + end notices (including the end summary) now relay to the room's Discord webhook if one is configured.",
      "Slash commands wrap to their own line in the StatusBar; /the-world is listed alongside /h, /changelog, /nick, /color.",
      "NPC prompt: replies in 台灣正體中文 by default (never simplified characters); Japanese / English when the player uses those.",
      "TESTING MODE: NPC now replies to every player message instead of only when its name appears. Burns credit faster — temporary while we evaluate the chat-flow feel.",
    ],
  },
  {
    version: "0.1.13",
    date: "2026-05-14",
    title: "/the-world — TRPG roguelike MVP",
    highlights: [
      "/the-world opens a globally-singleton world in this room with one LLM NPC, 「灰袍旅人」.",
      "Progress bar above the input shows credit (100k tokens) burning down as you address the NPC.",
      "NPC only responds when its name appears in your message; player-to-player chat is free.",
      "World ends when credit hits zero or an operator force-ends it; an LLM-written summary is broadcast either way.",
      "Cross-session memory is not built yet — the next world starts fresh (closing summary footer reminds you).",
    ],
  },
  {
    version: "0.1.12",
    date: "2026-05-14",
    title: "/h help + status bar refresh",
    highlights: [
      "/h (or /help) prints a one-shot command reference in the chat.",
      "Status bar now lists /h, /changelog, /nick, /color so new users notice them.",
      "System notices render as dim multi-line blocks without the `·#sys:` prefix.",
    ],
  },
  {
    version: "0.1.11",
    date: "2026-05-14",
    title: "/changelog command",
    highlights: [
      "/changelog opens an in-TUI modal listing recent versions.",
      "Navigate with [ and ] (prev/next). Press q to close.",
      "Key bindings shown at the bottom of the modal.",
    ],
  },
  {
    version: "0.1.10",
    date: "2026-05-14",
    title: "Update-available hint fix",
    highlights: [
      "Bumped CLIENT_VERSION + LATEST_CLIENT_VERSION + package.json in lockstep.",
      "Older clients connecting now reliably see the upgrade nudge in the status bar.",
    ],
  },
  {
    version: "0.1.9",
    date: "2026-05-14",
    title: "/color command",
    highlights: [
      "/color [#]ffffff sets your nickname color (6-digit hex; # optional).",
      "/color or /color reset clears it.",
      "Messages render using the author's current color from presence; falls back to a hashed default.",
    ],
  },
  {
    version: "0.1.7",
    date: "2026-05-13",
    title: "Stable anonymous identity",
    highlights: [
      "Anonymous identity persists at ~/.pantry/anon.json so re-launches keep the same nickname#discriminator.",
      "WS heartbeat keeps connections alive behind Cloudflare Tunnel.",
      "Admin can broadcast announcements into a room.",
    ],
  },
];
