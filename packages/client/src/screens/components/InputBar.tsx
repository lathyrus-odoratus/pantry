import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  onSend: (body: string) => void;
  onNick: (newNickname: string) => void;
  onColor: (color: string | null) => void;
};

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export function InputBar({ onSend, onNick, onColor }: Props): React.JSX.Element {
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
      } else if (cmd === "color") {
        if (!arg || arg === "reset") {
          onColor(null);
        } else if (HEX_COLOR_RE.test(arg)) {
          onColor(arg);
        }
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
