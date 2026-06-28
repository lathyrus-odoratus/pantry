import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useStore } from "../store.js";
import { loadAnon, type AnonIdentity } from "../auth/anon.js";
import { tint } from "../theme.js";

type ItemValue = "anon" | "github" | "google" | "discord";

export function IdentitySelect(): React.JSX.Element {
  const roomName = useStore((s) => s.roomName);
  const setScreen = useStore((s) => s.setScreen);
  const setPending = useStore((s) => s.setPendingIdentity);
  const theme = useStore((s) => s.prefs.theme);
  const [saved, setSaved] = useState<AnonIdentity | null>(null);

  useEffect(() => {
    void loadAnon().then(setSaved);
  }, []);

  const items: { label: string; value: ItemValue }[] = [
    {
      label: saved
        ? `Anonymous (continue as ${saved.nickname})`
        : "Anonymous (just a nickname)",
      value: "anon",
    },
    { label: "Sign in with GitHub", value: "github" },
    { label: "Sign in with Google", value: "google" },
    { label: "Sign in with Discord", value: "discord" },
  ];

  const onSelect = (item: { value: ItemValue }) => {
    if (item.value === "anon") {
      if (saved) {
        setPending({
          kind: "anon",
          nickname: saved.nickname,
          subject: saved.subject,
        });
        setScreen("chat");
        return;
      }
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
        <Text color={tint(undefined, theme)}>Room: <Text color={tint(undefined, theme)} bold>{roomName}</Text></Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={tint(undefined, theme)}>How do you want to join?</Text>
      </Box>
      <SelectInput items={items} onSelect={onSelect} />
    </Box>
  );
}
