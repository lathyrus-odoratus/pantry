import React from "react";
import { Box, Text } from "ink";
import type { GameState } from "@pantry/shared";
import { useStore } from "../../store.js";
import { tint, dimText } from "../../theme.js";

type Props = { game: GameState };

function explosionCells(
  map: string[][],
  bomb: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [{ x: bomb.x, y: bomb.y }];
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  for (const dir of dirs) {
    const nx = bomb.x + dir.x;
    const ny = bomb.y + dir.y;
    const row = map[ny];
    if (row && nx >= 0 && nx < row.length && row[nx] !== "#") {
      cells.push({ x: nx, y: ny });
    }
  }
  return cells;
}

function cellColor(ch: string): string | undefined {
  if (ch === "@") return "cyan";
  if (ch === "E") return "red";
  if (ch === "B") return "yellow";
  if (ch === "*") return "yellowBright";
  if (ch === "#") return "gray";
  if (ch === "X") return "white";
  return undefined;
}

export function GameSpectate({ game }: Props): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme);
  const screen = game.map.map((row) => [...row]);
  if (game.bomb) {
    if (game.bomb.exploded) {
      for (const c of explosionCells(game.map, game.bomb)) {
        const row = screen[c.y];
        if (row) row[c.x] = "*";
      }
    } else {
      const row = screen[game.bomb.y];
      if (row) row[game.bomb.x] = "B";
    }
  }
  const pr = screen[game.player.y];
  if (pr) pr[game.player.x] = "@";

  const hearts = "♥".repeat(Math.max(0, game.player.hp));
  const lost = "♡".repeat(Math.max(0, 3 - game.player.hp));

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={tint(undefined, theme)}>
        🎮 {game.playerNickname}#{game.playerDiscriminator}{" "}
        <Text color={tint("red", theme)}>{hearts}</Text>
        <Text {...dimText(theme)}>{lost}</Text>
      </Text>
      {screen.map((row, y) => (
        <Text key={y}>
          {row.map((ch, x) => (
            <Text key={x} color={tint(cellColor(ch), theme)}>{ch}</Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
