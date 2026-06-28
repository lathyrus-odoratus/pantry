import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Prefs } from "../../prefs.js";
import {
  THEMES,
  THEME_LABELS,
  tint,
  dimText,
  borderTint,
} from "../../theme.js";

const MIN_PADDING = 0;
const MAX_PADDING = 3;

const ROWS = ["theme", "padding"] as const;
type Row = (typeof ROWS)[number];

type Props = {
  prefs: Prefs;
  onPrefsChange: (p: Prefs) => void;
  onClose: () => void;
};

export function Settings({
  prefs,
  onPrefsChange,
  onClose,
}: Props): React.JSX.Element {
  const [row, setRow] = useState(0);
  const theme = prefs.theme;

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setRow((r) => Math.max(0, r - 1));
      return;
    }
    if (key.downArrow) {
      setRow((r) => Math.min(ROWS.length - 1, r + 1));
      return;
    }
    const dir = key.rightArrow ? 1 : key.leftArrow ? -1 : 0;
    if (dir === 0) return;
    const current: Row = ROWS[row] ?? "theme";
    if (current === "theme") {
      // Theme cycles (wraps) — only two entries today, room for more later.
      const idx = THEMES.indexOf(prefs.theme);
      const next = THEMES[(idx + dir + THEMES.length) % THEMES.length];
      if (next && next !== prefs.theme) {
        onPrefsChange({ ...prefs, theme: next });
      }
    } else {
      const next = Math.min(
        MAX_PADDING,
        Math.max(MIN_PADDING, prefs.messagePadding + dir),
      );
      if (next !== prefs.messagePadding) {
        onPrefsChange({ ...prefs, messagePadding: next });
      }
    }
  });

  const atMin = prefs.messagePadding <= MIN_PADDING;
  const atMax = prefs.messagePadding >= MAX_PADDING;
  const fg = tint(undefined, theme);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderTint(theme)}
      paddingX={1}
    >
      <Box>
        <Text bold color={fg}>
          Settings
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={fg}>{row === 0 ? "▶ " : "  "}</Text>
        <Text color={fg} bold={row === 0}>
          Theme
        </Text>
        <Text {...dimText(theme)}>◀ </Text>
        <Text bold color={fg}>
          {THEME_LABELS[prefs.theme]}
        </Text>
        <Text {...dimText(theme)}> ▶</Text>
      </Box>

      <Box>
        <Text color={fg}>{row === 1 ? "▶ " : "  "}</Text>
        <Text color={fg} bold={row === 1}>
          Message padding
        </Text>
        <Text {...dimText(theme)}> {atMin ? " " : "◀"} </Text>
        <Text bold color={fg}>
          {prefs.messagePadding}
        </Text>
        <Text {...dimText(theme)}> {atMax ? " " : "▶"}</Text>
      </Box>

      <Box marginTop={1}>
        <Text {...dimText(theme)}>↑↓ pick   ← → adjust   Esc close</Text>
      </Box>
    </Box>
  );
}
