import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  onSend: (body: string) => void;
  onNick: (newNickname: string) => void;
  onColor: (color: string | null) => void;
  onChangelog: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onWorldOpen: () => void;
  onDiceRoll: () => void;
  onGameStart: () => void;
  onCabomb: () => void;
  onWatch: (mono: boolean) => void;
};

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export function InputBar({
  onSend,
  onNick,
  onColor,
  onChangelog,
  onSettings,
  onHelp,
  onWorldOpen,
  onDiceRoll,
  onGameStart,
  onCabomb,
  onWatch,
}: Props): React.JSX.Element {
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
      } else if (cmd === "changelog") {
        onChangelog();
      } else if (cmd === "settings") {
        onSettings();
      } else if (cmd === "h" || cmd === "help") {
        onHelp();
      } else if (cmd === "the-world") {
        onWorldOpen();
      } else if (cmd === "roll") {
        // Bare /roll — server reads the dice spec from world state's
        // pendingRoll (set by the NPC's [[roll:…]] marker).
        onDiceRoll();
      } else if (cmd === "bomb") {
        onGameStart();
      } else if (cmd === "ca-bomb") {
        onCabomb();
      } else if (cmd === "watch") {
        onWatch(arg === "bw");
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
