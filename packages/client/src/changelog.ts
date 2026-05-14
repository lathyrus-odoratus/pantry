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
