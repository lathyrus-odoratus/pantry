import React, { useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { MessageList } from "./components/MessageList.js";
import { OnlineList } from "./components/OnlineList.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";

type Props = { serverUrl: string };

export function Chat({ serverUrl }: Props): React.JSX.Element {
  const messages = useStore((s) => s.messages);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const authedUser = useStore((s) => s.authedUser);
  const status = useStore((s) => s.status);
  const reconnectAttempt = useStore((s) => s.reconnectAttempt);
  const pending = useStore((s) => s.pendingIdentity);
  const roomName = useStore((s) => s.roomName);
  const setStatus = useStore((s) => s.setStatus);
  const onAuthOk = useStore((s) => s.onAuthOk);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const addMessage = useStore((s) => s.addMessage);
  const setPresence = useStore((s) => s.setPresence);
  const setError = useStore((s) => s.setError);

  const transportRef = useRef<TransportClient | null>(null);

  useEffect(() => {
    if (!pending) return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt) => setStatus(s, attempt),
      onMessage: (m) => {
        switch (m.type) {
          case "auth.ok":
            onAuthOk(m.user, "");
            break;
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
          });
        } else {
          client.send({
            type: "auth.oauth",
            token: pending.token,
            roomName,
          });
        }
      }
    });
    return () => {
      unsub();
      client.close();
      transportRef.current = null;
    };
  }, [pending, roomName, serverUrl, setStatus, onAuthOk, setSnapshot, addMessage, setPresence, setError]);

  const onSend = (body: string) => {
    transportRef.current?.send({ type: "message.send", body });
  };
  const onNick = (newNickname: string) => {
    transportRef.current?.send({ type: "nick.change", newNickname });
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>Room: {roomName}</Text>
            {authedUser ? (
              <Text dimColor>
                {" "}
                (you are {authedUser.nickname}#{authedUser.discriminator})
              </Text>
            ) : null}
          </Box>
          <MessageList messages={messages} />
        </Box>
        <OnlineList users={onlineUsers} />
      </Box>
      <Box flexDirection="column">
        <InputBar onSend={onSend} onNick={onNick} />
        <StatusBar status={status} reconnectAttempt={reconnectAttempt} />
      </Box>
    </Box>
  );
}
