import React from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useStore } from "../store.js";
import { MapGrid } from "./components/MapGrid.js";

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

  return (
    <Box flexDirection="column" padding={1}>
      <MapGrid map={map} />
      <Box marginTop={1}>
        <Text dimColor>q / Esc 離開</Text>
      </Box>
    </Box>
  );
}
