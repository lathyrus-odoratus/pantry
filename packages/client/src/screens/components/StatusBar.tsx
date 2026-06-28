import React from "react";
import { Box, Text } from "ink";
import type { ConnStatus } from "../../store.js";
import type { DisconnectDetail } from "../../transport/client.js";
import { tint, dimText, type Theme } from "../../theme.js";

type Props = {
  status: ConnStatus;
  reconnectAttempt: number;
  updateAvailable?: string | null;
  lastDisconnect?: DisconnectDetail | null;
  cabombActive?: { by: string } | null;
  extGameActive?: { by: string; gameId: string; title: string } | null;
  theme?: Theme;
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
  cabombActive,
  extGameActive,
  theme = "default",
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
        <Text color={tint(COLORS[status], theme)} bold>
          {LABELS[status]}
          {extra}
        </Text>
        {detailStr ? (
          <Text {...dimText(theme)}> · last: {detailStr}</Text>
        ) : null}
        <Text {...dimText(theme)}> · Ctrl+C to quit</Text>
        {updateAvailable ? (
          <Text color={tint("cyan", theme)}>
            {" "}
            · ↑ {updateAvailable} available (run `npx @lathyrus-odoratus/pantry@latest`)
          </Text>
        ) : null}
      </Box>
      {cabombActive ? (
        <Box>
          <Text color={tint("magenta", theme)}>
            🎮 {cabombActive.by} 進行中 · /watch 旁觀（/watch bw 黑白）
          </Text>
        </Box>
      ) : null}
      {extGameActive ? (
        <Box>
          <Text color={tint("cyan", theme)}>
            🕹 {extGameActive.by} 玩 {extGameActive.title} · /watch 旁觀
          </Text>
        </Box>
      ) : null}
      <Box>
        <Text {...dimText(theme)}>
          /h · /changelog · /settings · /nick · /color · /the-world · /roll · /game · /ca-bomb
        </Text>
      </Box>
    </Box>
  );
}
