import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../../store.js";
import { tint, dimText } from "../../theme.js";

type Props = {
  onQuit: () => void;
};

export function ExtGameView({ onQuit }: Props): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme);
  const frame = useStore((s) => s.extGameFrame);
  const over = useStore((s) => s.extGameOver);
  const view = useStore((s) => s.extGameView);
  const active = useStore((s) => s.extGameActive);
  const send = useStore((s) => s.extGameSend);

  useInput((input, key) => {
    if (over) {
      if (input === "q" || key.escape) onQuit();
      return;
    }
    if (view?.role !== "driver") {
      if (input === "q" || key.escape) onQuit();
      return;
    }

    // q exits immediately; onQuit (→ onExtGameQuit in Chat) sends "quit" to
    // the backend for session cleanup and calls exitExtGame.
    if (input === "q") { onQuit(); return; }

    // Special keys are translated to the API names; everything else (all
    // printable chars) goes through as-is, so new games never need a frontend
    // change just to add a new letter/symbol key.
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
  // Split on \n but keep the raw line content so ANSI SGR colour codes inside
  // each line are written through to the terminal by Ink unchanged.
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
      {over ? (
        <Text color={tint("yellow", theme)}>
          ──{" "}
          {over.result === "win" ? "獲勝！" : over.result === "loss" ? "失敗了。" : "遊戲結束。"}
          {"  q 離開 ──"}
        </Text>
      ) : (
        <Text {...dimText(theme)}>
          {view?.role === "driver" ? "q 離開遊戲" : "旁觀中  q 離開"}
        </Text>
      )}
    </Box>
  );
}
