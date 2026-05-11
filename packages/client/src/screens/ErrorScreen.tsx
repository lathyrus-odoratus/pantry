import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../store.js";

export function ErrorScreen(): React.JSX.Element {
  const message = useStore((s) => s.errorMessage);
  const reset = useStore((s) => s.reset);
  useInput((_input, key) => {
    if (key.return) {
      reset();
    }
  });
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="red" bold>
          Error
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{message ?? "Unknown error"}</Text>
      </Box>
      <Text dimColor>(Press Enter to start over, Ctrl+C to quit)</Text>
    </Box>
  );
}
