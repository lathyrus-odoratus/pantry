import React from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../../store.js";

type Props = {
  onQuit: () => void;
};

export function ExtGameView({ onQuit }: Props): React.JSX.Element {
  const frame = useStore((s) => s.extGameFrame);
  const over = useStore((s) => s.extGameOver);
  const view = useStore((s) => s.extGameView);
  const active = useStore((s) => s.extGameActive);
  const send = useStore((s) => s.extGameSend);

  useInput((input, key) => {
    if (input === "q" || key.escape) { onQuit(); return; }
    if (over || view?.role !== "driver") return;

    let gameKey: string | null = null;
    if (key.upArrow) gameKey = "up";
    else if (key.downArrow) gameKey = "down";
    else if (key.leftArrow) gameKey = "left";
    else if (key.rightArrow) gameKey = "right";
    else if (key.return) gameKey = "enter";
    else if (key.backspace) gameKey = "backspace";
    else if (input) gameKey = input;

    if (gameKey) send?.({ type: "ext.game.input", key: gameKey });
  });

  const tag = view?.role === "driver" ? "你在玩" : "旁觀中";
  const lines = frame ? frame.split("\n") : null;

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold>{active?.title ?? "遊戲"}</Text>
        <Text dimColor>  {active?.by}  {tag}</Text>
      </Box>
      {lines ? (
        lines.map((ln, i) => <Text key={i}>{ln || " "}</Text>)
      ) : (
        <Text dimColor>連線中…</Text>
      )}
      {over ? (
        <Text color="yellow">
          ──{" "}
          {over.result === "win" ? "獲勝！" : over.result === "loss" ? "失敗了。" : "遊戲結束。"}
          {"  q 離開 ──"}
        </Text>
      ) : (
        <Text dimColor>
          {view?.role === "driver" ? "q 離開遊戲" : "旁觀中  q 離開"}
        </Text>
      )}
    </Box>
  );
}
