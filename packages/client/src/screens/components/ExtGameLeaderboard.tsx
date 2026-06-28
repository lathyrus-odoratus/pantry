import React from "react";
import { Box, Text, useInput } from "ink";
import type { ExtGameLeaderboard } from "@pantry/shared";
import { useStore } from "../../store.js";
import { tint, dimText } from "../../theme.js";

type Props = {
  data: ExtGameLeaderboard;
  onClose: () => void;
};

export function ExtGameLeaderboardView({ data, onClose }: Props): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme);
  useInput((input, key) => {
    if (input === "q" || key.escape) onClose();
  });

  const colWidth = 20;

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text bold color={tint(undefined, theme)}>
        排行榜 · {data.gameId}{"  "}
        <Text {...dimText(theme)}>({data.label})</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold {...dimText(theme)}>{pad("#", 4)}</Text>
          <Text bold {...dimText(theme)}>{pad("玩家", colWidth)}</Text>
          {data.entries[0]?.difficulty !== undefined && data.entries.some(e => e.difficulty) ? (
            <Text bold {...dimText(theme)}>{pad("難度", 8)}</Text>
          ) : null}
          <Text bold {...dimText(theme)}>{data.label}</Text>
        </Box>
        {data.entries.length === 0 ? (
          <Text {...dimText(theme)}>  （尚無記錄）</Text>
        ) : (
          data.entries.map((e) => (
            <Box key={e.rank}>
              <Text color={tint(e.rank <= 3 ? "yellow" : undefined, theme)}>
                {pad(String(e.rank), 4)}
              </Text>
              <Text color={tint(undefined, theme)}>{pad(e.nickname, colWidth)}</Text>
              {data.entries.some(x => x.difficulty) ? (
                <Text {...dimText(theme)}>{pad(e.difficulty ?? "─", 8)}</Text>
              ) : null}
              <Text bold color={tint(undefined, theme)}>{formatValue(e.value, data.metric)}</Text>
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text {...dimText(theme)}>q / Esc 關閉</Text>
      </Box>
    </Box>
  );
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

function formatValue(value: number, metric: string): string {
  if (metric === "secs") {
    const m = Math.floor(value / 60);
    const s = value % 60;
    return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
  }
  return String(value);
}
