import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useStore } from "../store.js";

type ItemValue = "anon" | "github" | "google" | "discord";

const items: { label: string; value: ItemValue }[] = [
  { label: "Anonymous (just a nickname)", value: "anon" },
  { label: "Sign in with GitHub", value: "github" },
  { label: "Sign in with Google", value: "google" },
  { label: "Sign in with Discord", value: "discord" },
];

export function IdentitySelect(): React.JSX.Element {
  const roomName = useStore((s) => s.roomName);
  const setScreen = useStore((s) => s.setScreen);
  const setPending = useStore((s) => s.setPendingIdentity);

  const onSelect = (item: { value: ItemValue }) => {
    if (item.value === "anon") {
      setPending(null);
      setScreen("nickname_input");
      return;
    }
    setPending({ kind: "oauth", provider: item.value, token: "" });
    setScreen("oauth_waiting");
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Room: <Text bold>{roomName}</Text></Text>
      </Box>
      <Box marginBottom={1}>
        <Text>How do you want to join?</Text>
      </Box>
      <SelectInput items={items} onSelect={onSelect} />
    </Box>
  );
}
