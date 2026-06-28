import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../store.js";
import { tint, dimText } from "../theme.js";

export function ErrorScreen(): React.JSX.Element {
  const message = useStore((s) => s.errorMessage);
  const reset = useStore((s) => s.reset);
  const theme = useStore((s) => s.prefs.theme);
  useInput((_input, key) => {
    if (key.return) {
      reset();
    }
  });
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={tint("red", theme)} bold>
          Error
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={tint(undefined, theme)}>{message ?? "Unknown error"}</Text>
      </Box>
      <Text {...dimText(theme)}>(Press Enter to start over, Ctrl+C to quit)</Text>
    </Box>
  );
}
