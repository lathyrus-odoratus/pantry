import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ExtGameInfo } from "@pantry/shared";

type Props = {
  games: ExtGameInfo[] | null;
  onSelect: (gameId: string) => void;
  onCancel: () => void;
};

export function ExtGameSelect({ games, onSelect, onCancel }: Props): React.JSX.Element {
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (!games) { if (key.escape || input === "q") onCancel(); return; }
    if (key.escape || input === "q") { onCancel(); return; }
    if (key.upArrow || input === "k") setIdx((i) => Math.max(0, i - 1));
    if (key.downArrow || input === "j") setIdx((i) => Math.min(games.length - 1, i + 1));
    if (key.return) { const g = games[idx]; if (g) onSelect(g.id); return; }
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= games.length) {
      const g = games[n - 1];
      if (g) onSelect(g.id);
    }
  });

  if (!games) {
    return (
      <Box paddingTop={1}>
        <Text dimColor>載入遊戲清單中… q 取消</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text bold>選擇遊戲</Text>
      {games.map((g, i) => (
        <Box key={g.id} flexDirection="column">
          <Text color={i === idx ? "cyan" : undefined} bold={i === idx}>
            {i === idx ? "> " : "  "}{i + 1}. {g.title}
          </Text>
          <Text dimColor>     {g.description}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑↓ / jk 選擇  Enter / 數字 確認  q 取消</Text>
      </Box>
    </Box>
  );
}
