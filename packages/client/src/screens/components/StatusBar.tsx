import React from "react";
import { Box, Text } from "ink";
import type { ConnStatus } from "../../store.js";

type Props = {
  status: ConnStatus;
  reconnectAttempt: number;
  updateAvailable?: string | null;
};

const LABELS: Record<ConnStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

const COLORS: Record<ConnStatus, string | undefined> = {
  idle: undefined,
  connecting: "yellow",
  connected: "green",
  reconnecting: "yellow",
  disconnected: "red",
};

export function StatusBar({
  status,
  reconnectAttempt,
  updateAvailable,
}: Props): React.JSX.Element {
  const extra =
    status === "reconnecting" && reconnectAttempt > 0
      ? ` (attempt ${reconnectAttempt})`
      : "";
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={COLORS[status]} bold>
          {LABELS[status]}
          {extra}
        </Text>
        <Text dimColor> · Ctrl+C to quit</Text>
        {updateAvailable ? (
          <Text color="cyan">
            {" "}
            · ↑ {updateAvailable} available (run `npx @lathyrus-odoratus/pantry@latest`)
          </Text>
        ) : null}
      </Box>
      <Box>
        <Text dimColor>/h · /changelog · /nick · /color · /the-world</Text>
      </Box>
    </Box>
  );
}
