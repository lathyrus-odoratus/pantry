import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Message } from "@pantry/shared";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { MessageList } from "./components/MessageList.js";
import { OnlineList } from "./components/OnlineList.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { CLIENT_VERSION, compareSemver } from "../version.js";

type Props = { serverUrl: string };

const ONLINE_LIST_WIDTH = 22;
// Reserved rows: header (1) + InputBar (1) + StatusBar (1) + slack (1).
const RESERVED_ROWS = 4;

function useTerminalSize(): { rows: number; cols: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    rows: stdout?.rows ?? 24,
    cols: stdout?.columns ?? 80,
  });
  useEffect(() => {
    if (!stdout) return;
    const onResize = () =>
      setSize({ rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}

/**
 * Pick the most recent messages that fit within `maxRows` of vertical space,
 * accounting for body wraps at `width` columns. Slicing keeps the message
 * column from overflowing — otherwise the flex row's intrinsic height pushes
 * the OnlineList off-screen and Ink ends up redrawing more than the terminal
 * can keep up with (visible flicker on every keystroke).
 */
function sliceToFit(messages: Message[], maxRows: number, width: number): Message[] {
  if (maxRows <= 0 || messages.length === 0) return [];
  const usableWidth = Math.max(1, width);
  let used = 0;
  const result: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    const labelLen =
      msg.author.nickname.length + msg.author.discriminator.length + 3; // '#' + ': '
    const rowsNeeded = Math.max(
      1,
      Math.ceil((labelLen + msg.body.length) / usableWidth),
    );
    if (used + rowsNeeded > maxRows && result.length > 0) break;
    result.unshift(msg);
    used += rowsNeeded;
    if (used >= maxRows) break;
  }
  return result;
}

export function Chat({ serverUrl }: Props): React.JSX.Element {
  const messages = useStore((s) => s.messages);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const authedUser = useStore((s) => s.authedUser);
  const status = useStore((s) => s.status);
  const reconnectAttempt = useStore((s) => s.reconnectAttempt);
  const pending = useStore((s) => s.pendingIdentity);
  const roomName = useStore((s) => s.roomName);
  const updateAvailable = useStore((s) => s.updateAvailable);
  const setStatus = useStore((s) => s.setStatus);
  const onAuthOk = useStore((s) => s.onAuthOk);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const addMessage = useStore((s) => s.addMessage);
  const setPresence = useStore((s) => s.setPresence);
  const setUpdateAvailable = useStore((s) => s.setUpdateAvailable);
  const setError = useStore((s) => s.setError);

  const transportRef = useRef<TransportClient | null>(null);

  useEffect(() => {
    if (!pending) return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt) => setStatus(s, attempt),
      onMessage: (m) => {
        switch (m.type) {
          case "auth.ok": {
            onAuthOk(m.user, "");
            const latest = m.latestClientVersion;
            if (latest && compareSemver(latest, CLIENT_VERSION) > 0) {
              setUpdateAvailable(latest);
            }
            break;
          }
          case "auth.error":
            setError(`Auth failed: ${m.reason}`);
            client.close();
            break;
          case "room.snapshot":
            setSnapshot(m.room.id, m.messages, m.onlineUsers);
            break;
          case "message":
            addMessage(m.data);
            break;
          case "system":
            addMessage({
              id: `sys-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              body: `── ${m.body} ──`,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "sys" },
            });
            break;
          case "presence":
            setPresence(m.onlineUsers);
            break;
          case "history":
            useStore.getState().prependHistory(m.messages, m.hasMore);
            break;
          case "error":
            break;
        }
      },
    });
    transportRef.current = client;
    client.connect();
    const unsub = useStore.subscribe((state, prev) => {
      if (state.status === "connected" && prev.status !== "connected") {
        if (pending.kind === "anon") {
          client.send({
            type: "auth.anon",
            nickname: pending.nickname,
            roomName,
            clientVersion: CLIENT_VERSION,
          });
        } else {
          client.send({
            type: "auth.oauth",
            token: pending.token,
            roomName,
            clientVersion: CLIENT_VERSION,
          });
        }
      }
    });
    return () => {
      unsub();
      client.close();
      transportRef.current = null;
    };
  }, [pending, roomName, serverUrl, setStatus, onAuthOk, setSnapshot, addMessage, setPresence, setUpdateAvailable, setError]);

  const onSend = (body: string) => {
    transportRef.current?.send({ type: "message.send", body });
  };
  const onNick = (newNickname: string) => {
    transportRef.current?.send({ type: "nick.change", newNickname });
  };

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useInput((_input, key) => {
    if (!(key.pageUp ?? false)) return;
    const list = messagesRef.current;
    const oldest = list[0];
    if (!oldest) return;
    if (!useStore.getState().historyHasMore) return;
    transportRef.current?.send({
      type: "history.load",
      beforeId: oldest.id,
      limit: 50,
    });
  });

  const { rows: termRows, cols: termCols } = useTerminalSize();
  const messageAreaRows = Math.max(3, termRows - RESERVED_ROWS);
  const messageAreaCols = Math.max(20, termCols - ONLINE_LIST_WIDTH - 2);
  const visibleMessages = sliceToFit(messages, messageAreaRows, messageAreaCols);

  return (
    <Box flexDirection="column" height={termRows}>
      <Box flexDirection="row" flexGrow={1} flexShrink={1}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>Room: {roomName}</Text>
            {authedUser ? (
              <Text dimColor>
                {" "}
                (you are {authedUser.nickname}#{authedUser.discriminator})
              </Text>
            ) : null}
          </Box>
          <MessageList messages={visibleMessages} />
        </Box>
        <OnlineList users={onlineUsers} />
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        <InputBar onSend={onSend} onNick={onNick} />
        <StatusBar status={status} reconnectAttempt={reconnectAttempt} updateAvailable={updateAvailable} />
      </Box>
    </Box>
  );
}
