import React from "react";
import { Box, Text, useInput } from "ink";
import type { ExtGameLeaderboard } from "@pantry/shared";

type Props = {
  data: ExtGameLeaderboard;
  onClose: () => void;
};

export function ExtGameLeaderboardView({ data, onClose }: Props): React.JSX.Element {
  useInput((input, key) => {
    if (input === "q" || key.escape) onClose();
  });

  const colWidth = 20;

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text bold>
        排行榜 · {data.gameId}{"  "}
        <Text dimColor>({data.label})</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold dimColor>{pad("#", 4)}</Text>
          <Text bold dimColor>{pad("玩家", colWidth)}</Text>
          {data.entries[0]?.difficulty !== undefined && data.entries.some(e => e.difficulty) ? (
            <Text bold dimColor>{pad("難度", 8)}</Text>
          ) : null}
          <Text bold dimColor>{data.label}</Text>
        </Box>
        {data.entries.length === 0 ? (
          <Text dimColor>  （尚無記錄）</Text>
        ) : (
          data.entries.map((e) => (
            <Box key={e.rank}>
              <Text color={e.rank <= 3 ? "yellow" : undefined}>
                {pad(String(e.rank), 4)}
              </Text>
              <Text>{pad(e.nickname, colWidth)}</Text>
              {data.entries.some(x => x.difficulty) ? (
                <Text dimColor>{pad(e.difficulty ?? "─", 8)}</Text>
              ) : null}
              <Text bold>{formatValue(e.value, data.metric)}</Text>
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>q / Esc 關閉</Text>
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
