import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  onSend: (body: string) => void;
  onNick: (newNickname: string) => void;
};

export function InputBar({ onSend, onNick }: Props): React.JSX.Element {
  const [value, setValue] = useState("");
  const valueRef = useRef("");

  const onChange = (v: string) => {
    valueRef.current = v;
    setValue(v);
  };

  const onSubmit = (_raw: string) => {
    const trimmed = valueRef.current.trim();
    valueRef.current = "";
    setValue("");
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
      const arg = rest.join(" ").trim();
      if (cmd === "nick" && arg) {
        onNick(arg);
      }
      return;
    }
    onSend(trimmed);
  };

  return (
    <Box>
      <Text>&gt; </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
}
