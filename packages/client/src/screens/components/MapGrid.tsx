import React from "react";
import { Box, Text } from "ink";
import { cellStyle, type MapV1 } from "@pantry/shared";
import { tint, dimText, type Theme } from "../../theme.js";

/** Renders a map full-size (4 chars wide × 2 tall per cell) with truecolor. */
export function MapGrid({
  map,
  showTitle = true,
  theme = "default",
}: {
  map: MapV1;
  showTitle?: boolean;
  theme?: Theme;
}): React.JSX.Element {
  const rows: React.JSX.Element[] = [];
  for (let r = 0; r < map.h; r++) {
    for (let part = 0; part < 2; part++) {
      const spans: React.JSX.Element[] = [];
      for (let c = 0; c < map.w; c++) {
        const s = cellStyle(map, r, c);
        spans.push(
          <Text
            key={c}
            color={tint(s.fg, theme)}
            backgroundColor={tint(s.bg, theme)}
          >
            {part === 0 ? s.r1 : s.r2}
          </Text>,
        );
      }
      rows.push(<Text key={`${r}-${part}`}>{spans}</Text>);
    }
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      {showTitle ? (
        <Text {...dimText(theme)}>
          🗺 {map.name} ({map.w}×{map.h})
        </Text>
      ) : null}
      {rows}
    </Box>
  );
}
