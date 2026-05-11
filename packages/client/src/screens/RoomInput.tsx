import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../store.js";

export function RoomInput(): React.JSX.Element {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const commit = useStore((s) => s.commitRoomName);
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
        <Text bold>Welcome to chat-room</Text>
      </Box>
      <Box>
        <Text>Room name: </Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>(Enter to continue, Ctrl+C to quit)</Text>
      </Box>
    </Box>
  );
}
