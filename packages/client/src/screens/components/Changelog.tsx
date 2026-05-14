import React from "react";
import { Box, Text, useInput } from "ink";
import type { ChangelogEntry } from "../../changelog.js";

type Props = {
  entries: ChangelogEntry[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
};

export function Changelog({
  entries,
  index,
  onIndexChange,
  onClose,
}: Props): React.JSX.Element {
  useInput((input) => {
    if (input === "q") {
      onClose();
      return;
    }
    if (input === "]" && index < entries.length - 1) {
      onIndexChange(index + 1);
      return;
    }
    if (input === "[" && index > 0) {
      onIndexChange(index - 1);
      return;
    }
  });

  const entry = entries[index];
  if (!entry) {
    return (
      <Box>
        <Text>No changelog entry.</Text>
      </Box>
    );
  }

  const atFirst = index === 0;
  const atLast = index === entries.length - 1;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text bold>v{entry.version}</Text>
        <Text dimColor> · {entry.date}</Text>
      </Box>
      <Box>
        <Text>{entry.title}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {entry.highlights.map((h, i) => (
          <Text key={i}>  • {h}</Text>
        ))}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          <Text color={atFirst ? "gray" : undefined}>[</Text>
          <Text dimColor> / </Text>
          <Text color={atLast ? "gray" : undefined}>]</Text>
          <Text dimColor>: prev/next   q: close</Text>
        </Text>
        <Text dimColor>
          {index + 1} / {entries.length}
        </Text>
      </Box>
    </Box>
  );
}
