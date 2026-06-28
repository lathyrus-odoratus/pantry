import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../store.js";
import { tint, dimText } from "../theme.js";

export function RoomInput(): React.JSX.Element {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const commit = useStore((s) => s.commitRoomName);
  const theme = useStore((s) => s.prefs.theme);
  const onChange = (v: string) => {
    valueRef.current = v;
    setValue(v);
  };
  const onSubmit = (_v: string) => {
    const v = valueRef.current;
    if (!v.trim()) return;
    commit(v.trim());
  };
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={tint(undefined, theme)} bold>Welcome to pantry</Text>
      </Box>
      <Box>
        <Text color={tint(undefined, theme)}>Room name: </Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text {...dimText(theme)}>(Enter to continue, Ctrl+C to quit)</Text>
      </Box>
    </Box>
  );
}
