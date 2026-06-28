import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ExtGameInfo } from "@pantry/shared";
import { useStore } from "../../store.js";
import { tint, dimText } from "../../theme.js";

type Props = {
  games: ExtGameInfo[] | null;
  onSelect: (gameId: string) => void;
  onCancel: () => void;
  onLeaderboard: (gameId: string) => void;
};

export function ExtGameSelect({ games, onSelect, onCancel, onLeaderboard }: Props): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme);
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (!games) { if (key.escape || input === "q") onCancel(); return; }
    if (key.escape || input === "q") { onCancel(); return; }
    if (key.upArrow || input === "k") setIdx((i) => Math.max(0, i - 1));
    if (key.downArrow || input === "j") setIdx((i) => Math.min(games.length - 1, i + 1));
    if (key.return) { const g = games[idx]; if (g) onSelect(g.id); return; }
    if (input === "l") {
      const g = games[idx];
      if (g?.hasLeaderboard) onLeaderboard(g.id);
      return;
    }
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= games.length) {
      const g = games[n - 1];
      if (g) onSelect(g.id);
    }
  });

  if (!games) {
    return (
      <Box paddingTop={1}>
        <Text {...dimText(theme)}>載入遊戲清單中… q 取消</Text>
      </Box>
    );
  }

  const current = games[idx];
  const showLeaderboardHint = current?.hasLeaderboard ?? false;

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text bold color={tint(undefined, theme)}>選擇遊戲</Text>
      {games.map((g, i) => (
        <Box key={g.id} flexDirection="column">
          <Box>
            <Text color={tint(i === idx ? "cyan" : undefined, theme)} bold={i === idx}>
              {i === idx ? "> " : "  "}{i + 1}. {g.title}
            </Text>
            {g.hasLeaderboard ? <Text {...dimText(theme)}> 🏆</Text> : null}
          </Box>
          <Text {...dimText(theme)}>     {g.description}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text {...dimText(theme)}>
          {"↑↓ / jk 選擇  Enter / 數字 確認"}
          {showLeaderboardHint ? "  l 排行榜" : ""}
          {"  q 取消"}
        </Text>
      </Box>
    </Box>
  );
}
