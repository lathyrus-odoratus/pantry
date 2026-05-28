import React from "react";
import { Box, Text, useApp, useInput } from "ink";
import { cellStyle } from "@pantry/shared";
import { useStore } from "../store.js";

export function MapView(): React.JSX.Element {
  const map = useStore((s) => s.viewedMap);
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
  });

  if (!map) {
    return (
      <Box padding={1}>
        <Text color="red">沒有地圖資料</Text>
      </Box>
    );
  }

  const rows: React.JSX.Element[] = [];
  for (let r = 0; r < map.h; r++) {
    for (let part = 0; part < 2; part++) {
      const spans: React.JSX.Element[] = [];
      for (let c = 0; c < map.w; c++) {
        const s = cellStyle(map, r, c);
        spans.push(
          <Text key={c} color={s.fg} backgroundColor={s.bg}>
            {part === 0 ? s.r1 : s.r2}
          </Text>,
        );
      }
      rows.push(<Text key={`${r}-${part}`}>{spans}</Text>);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>{map.name}</Text>
        <Text dimColor>
          {" "}
          ({map.w}×{map.h})
        </Text>
      </Box>
      <Box flexDirection="column">{rows}</Box>
      <Box marginTop={1}>
        <Text dimColor>q / Esc 離開</Text>
      </Box>
    </Box>
  );
}
