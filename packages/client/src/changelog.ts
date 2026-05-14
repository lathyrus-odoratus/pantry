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
