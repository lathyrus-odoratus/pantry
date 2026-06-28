import React from "react";
import { Box, Text } from "ink";
import { tint, dimText, type Theme } from "../../theme.js";

type Props = {
  creditUsed: number;
  creditTotal: number;
  theme?: Theme;
};

const BAR_WIDTH = 24;

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function WorldPanel({
  creditUsed,
  creditTotal,
  theme = "default",
}: Props): React.JSX.Element {
  const pct = creditTotal > 0 ? Math.min(1, creditUsed / creditTotal) : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pctLabel = `${Math.round(pct * 100)}%`;
  // Tint warmer as credit depletes
  const color = pct < 0.5 ? "green" : pct < 0.85 ? "yellow" : "red";
  return (
    <Box>
      <Text bold color={tint(undefined, theme)}>🌍 World </Text>
      <Text color={tint(color, theme)}>{bar}</Text>
      <Text {...dimText(theme)}>
        {" "}
        {pctLabel} · credit {formatTokens(creditUsed)}/{formatTokens(creditTotal)}
      </Text>
    </Box>
  );
}
