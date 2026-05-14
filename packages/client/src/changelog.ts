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
