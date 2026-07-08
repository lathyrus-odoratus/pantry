import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../../store.js";
import { tint, dimText } from "../../theme.js";

type Props = {
  // Called when a spectator presses q/escape to leave the view. Drivers
  // send q through the normal key path so the shell can handle navigation.
  onLeave: () => void;
};

export function ExtGameView({ onLeave }: Props): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme);
  const frame = useStore((s) => s.extGameFrame);
  const view = useStore((s) => s.extGameView);
  const active = useStore((s) => s.extGameActive);
  const send = useStore((s) => s.extGameSend);

  useInput((input, key) => {
    // Spectators only observe; q/escape exits the spectator view locally.
    if (view?.role !== "driver") {
      if (input === "q" || key.escape) onLeave();
      return;
    }

    // Driver: translate special keys then forward everything (including q) to
    // the shell. The shell decides whether q navigates back or quits the session.
    let gameKey: string | null = null;
    if (key.upArrow) gameKey = "up";
    else if (key.downArrow) gameKey = "down";
    else if (key.leftArrow) gameKey = "left";
    else if (key.rightArrow) gameKey = "right";
    else if (key.return) gameKey = "enter";
    else if (key.escape) gameKey = "escape";
    else if (key.backspace) gameKey = "backspace";
    else if (key.delete) gameKey = "delete";
    else if (key.tab) gameKey = "tab";
    else if (key.pageUp) gameKey = "pageup";
    else if (key.pageDown) gameKey = "pagedown";
    else if (input) gameKey = input;

    if (gameKey) send?.({ type: "ext.game.input", key: gameKey });
  });

  const tag = view?.role === "driver" ? "你在玩" : "旁觀中";
  const lines = frame ? frame.split("\n") : null;

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold color={tint(undefined, theme)}>{active?.title ?? "遊戲"}</Text>
        <Text {...dimText(theme)}>  {active?.by}  {tag}</Text>
      </Box>
      {lines ? (
        lines.map((ln, i) => <Text key={i} color={tint(undefined, theme)}>{ln || " "}</Text>)
      ) : (
        <Text {...dimText(theme)}>連線中…</Text>
      )}
      <Text {...dimText(theme)}>
        {view?.role === "driver" ? "q 返回 / 離開選單" : "旁觀中  q 離開"}
      </Text>
    </Box>
  );
}
