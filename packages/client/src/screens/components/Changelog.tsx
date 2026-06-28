import React from "react";
import { Box, Text, useInput } from "ink";
import type { ChangelogEntry } from "../../changelog.js";
import { tint, dimText, borderTint, type Theme } from "../../theme.js";

type Props = {
  entries: ChangelogEntry[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  theme?: Theme;
};

export function Changelog({
  entries,
  index,
  onIndexChange,
  onClose,
  theme = "default",
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
        <Text color={tint(undefined, theme)}>No changelog entry.</Text>
      </Box>
    );
  }

  const atFirst = index === 0;
  const atLast = index === entries.length - 1;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderTint(theme)}
      paddingX={1}
    >
      <Box>
        <Text bold color={tint(undefined, theme)}>v{entry.version}</Text>
        <Text {...dimText(theme)}> · {entry.date}</Text>
      </Box>
      <Box>
        <Text color={tint(undefined, theme)}>{entry.title}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {entry.highlights.map((h, i) => (
          <Text key={i} color={tint(undefined, theme)}>  • {h}</Text>
        ))}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text {...dimText(theme)}>
          <Text color={tint(atFirst ? "gray" : undefined, theme)}>[</Text>
          <Text {...dimText(theme)}> / </Text>
          <Text color={tint(atLast ? "gray" : undefined, theme)}>]</Text>
          <Text {...dimText(theme)}>: prev/next   q: close</Text>
        </Text>
        <Text {...dimText(theme)}>
          {index + 1} / {entries.length}
        </Text>
      </Box>
    </Box>
  );
}
