import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../store.js";

export function NicknameInput(): React.JSX.Element {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const setPending = useStore((s) => s.setPendingIdentity);
  const setScreen = useStore((s) => s.setScreen);
  const onChange = (v: string) => {
    valueRef.current = v;
    setValue(v);
  };
  const onSubmit = (_v: string) => {
    const v = valueRef.current;
    if (!v.trim()) return;
    setPending({ kind: "anon", nickname: v.trim() });
    setScreen("chat");
  };
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Nickname (1-20 chars):</Text>
      </Box>
      <Box>
        <Text>&gt; </Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
}
