import React from "react";
import { Box, Text, useInput } from "ink";
import type { Prefs } from "../../prefs.js";

const MIN_PADDING = 0;
const MAX_PADDING = 3;

type Props = {
  prefs: Prefs;
  onPrefsChange: (p: Prefs) => void;
  onClose: () => void;
};

export function Settings({
  prefs,
  onPrefsChange,
  onClose,
}: Props): React.JSX.Element {
  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.rightArrow) {
      const next = Math.min(MAX_PADDING, prefs.messagePadding + 1);
      if (next !== prefs.messagePadding) {
        onPrefsChange({ ...prefs, messagePadding: next });
      }
      return;
    }
    if (key.leftArrow) {
      const next = Math.max(MIN_PADDING, prefs.messagePadding - 1);
      if (next !== prefs.messagePadding) {
        onPrefsChange({ ...prefs, messagePadding: next });
      }
      return;
    }
  });

  const atMin = prefs.messagePadding <= MIN_PADDING;
  const atMax = prefs.messagePadding >= MAX_PADDING;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text bold>Settings</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Message padding  </Text>
        <Text dimColor>{atMin ? " " : "◀"} </Text>
        <Text bold>{prefs.messagePadding}</Text>
        <Text dimColor> {atMax ? " " : "▶"}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → adjust   Esc close</Text>
      </Box>
    </Box>
  );
}
