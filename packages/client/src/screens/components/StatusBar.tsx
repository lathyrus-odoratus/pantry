import React from "react";
import { Box, Text } from "ink";
import type { ConnStatus } from "../../store.js";
import type { DisconnectDetail } from "../../transport/client.js";

type Props = {
  status: ConnStatus;
  reconnectAttempt: number;
  updateAvailable?: string | null;
  lastDisconnect?: DisconnectDetail | null;
};

function formatDisconnect(d: DisconnectDetail): string {
  const parts: string[] = [];
  if (typeof d.code === "number") parts.push(String(d.code));
  if (d.reason) parts.push(d.reason);
  const codeReason = parts.join(" ");
  if (codeReason && d.error) return `${codeReason} (${d.error})`;
  if (codeReason) return codeReason;
  if (d.error) return d.error;
  return "";
}

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
  lastDisconnect,
}: Props): React.JSX.Element {
  const extra =
    status === "reconnecting" && reconnectAttempt > 0
      ? ` (attempt ${reconnectAttempt})`
      : "";
  const detailStr =
    (status === "reconnecting" || status === "disconnected") && lastDisconnect
      ? formatDisconnect(lastDisconnect)
      : "";
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={COLORS[status]} bold>
          {LABELS[status]}
          {extra}
        </Text>
        {detailStr ? (
          <Text dimColor> · last: {detailStr}</Text>
        ) : null}
        <Text dimColor> · Ctrl+C to quit</Text>
        {updateAvailable ? (
          <Text color="cyan">
            {" "}
            · ↑ {updateAvailable} available (run `npx @lathyrus-odoratus/pantry@latest`)
          </Text>
        ) : null}
      </Box>
      <Box>
        <Text dimColor>/h · /changelog · /settings · /nick · /color · /the-world · /roll</Text>
      </Box>
    </Box>
  );
}
