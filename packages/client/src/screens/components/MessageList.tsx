import React from "react";
import { Box, Text } from "ink";
import type { Message } from "@chat-room/shared";

type Props = { messages: Message[] };

function hashColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const palette = ["cyan", "green", "yellow", "magenta", "blueBright", "redBright"];
  return palette[Math.abs(h) % palette.length] ?? "white";
}

export function MessageList({ messages }: Props): React.JSX.Element {
  if (messages.length === 0) {
    return (
      <Box>
        <Text dimColor>(no messages yet)</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {messages.map((m) => {
        const label = `${m.author.nickname}#${m.author.discriminator}`;
        return (
          <Box key={m.id}>
            <Text color={hashColor(label)} bold>
              {label}
            </Text>
            <Text dimColor>: </Text>
            <Text>{m.body}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
