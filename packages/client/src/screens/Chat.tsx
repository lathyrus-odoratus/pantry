import React, { useCallback, useEffect, useRef } from "react";
import { Box, Static, Text } from "ink";
import type { Message } from "@pantry/shared";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { Changelog } from "./components/Changelog.js";
import { WorldPanel } from "./components/WorldPanel.js";
import { CHANGELOG } from "../changelog.js";
import { HELP_TEXT } from "../help.js";
import { CLIENT_VERSION, compareSemver } from "../version.js";
import { saveAnon } from "../auth/anon.js";

type Props = { serverUrl: string };

function hashColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const palette = ["cyan", "green", "yellow", "magenta", "blueBright", "redBright"];
  return palette[Math.abs(h) % palette.length] ?? "white";
}

// While a world is active, render an emoji in front of each speaker's nick
// — 🌫 for the NPC traveler, 🎲 for players (easter egg / TRPG cast marker).
// NPC is detected by nickname match (only one NPC in V1; revisit when
// multiple personas land — likely via a `kind` field in UserSchema).
const NPC_NICKNAME = "灰袍旅人";
const NPC_EMOJI = "🌫";
const PLAYER_WORLD_EMOJI = "🎲";

function MessageRow({ m }: { m: Message }): React.JSX.Element {
  // System notices (joins, leaves, renames, local /h help, world.open/end,
  // dice rolls) render as a dim block without the `nick#disc:` prefix. Body
  // may be multi-line.
  if (m.author.discriminator === "sys") {
    return (
      <Box flexDirection="column">
        {m.body.split("\n").map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>
    );
  }
  const label = `${m.author.nickname}#${m.author.discriminator}`;
  // Static items render exactly once; resolve the author's current color and
  // world-active state at that moment via getState() to avoid subscribing
  // (which would defeat Static).
  const snapshot = useStore.getState();
  const author = snapshot.onlineUsers.find(
    (u) =>
      u.nickname === m.author.nickname &&
      u.discriminator === m.author.discriminator,
  );
  const color = author?.color ?? hashColor(label);
  const isNpc = m.author.nickname === NPC_NICKNAME;
  const prefixEmoji = isNpc
    ? NPC_EMOJI
    : snapshot.worldActive
      ? PLAYER_WORLD_EMOJI
      : null;
  return (
    <Box>
      {prefixEmoji ? <Text>{prefixEmoji} </Text> : null}
      <Text color={color} bold>
        {label}
      </Text>
      <Text dimColor>: </Text>
      <Text>{m.body}</Text>
    </Box>
  );
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
  const setWorldState = useStore((s) => s.setWorldState);
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
            if (pending.kind === "anon") {
              void saveAnon({ subject: pending.subject, nickname: m.user.nickname });
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
          case "system": {
            // Single-line notices (join/leave/rename/announce/world.open) get
            // the visual `── … ──` brackets. Multi-line bodies (world.end with
            // the LLM summary) render as-is — bracketing a paragraph block
            // looks broken.
            const isMultiline = m.body.includes("\n");
            addMessage({
              id: `sys-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              body: isMultiline ? m.body : `── ${m.body} ──`,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "sys" },
            });
            break;
          }
          case "presence":
            setPresence(m.onlineUsers);
            break;
          case "world.state":
            setWorldState({
              active: m.active,
              creditUsed: m.creditUsed,
              creditTotal: m.creditTotal,
            });
            break;
          case "history":
            // Static renders new items at the bottom regardless of array
            // position, so prepending historical messages would visually
            // confuse the order. History loading is intentionally disabled
            // in the Static-based layout; users can use their terminal's
            // own scrollback to read older messages.
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
            subject: pending.subject,
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
  }, [pending, roomName, serverUrl, setStatus, onAuthOk, setSnapshot, addMessage, setPresence, setUpdateAvailable, setWorldState, setError]);

  const onSend = useCallback((body: string) => {
    transportRef.current?.send({ type: "message.send", body });
  }, []);
  const onNick = useCallback((newNickname: string) => {
    transportRef.current?.send({ type: "nick.change", newNickname });
  }, []);
  const onColor = useCallback((color: string | null) => {
    transportRef.current?.send({ type: "color.change", color });
  }, []);
  const onHelp = useCallback(() => {
    addMessage({
      id: `help-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      body: HELP_TEXT,
      createdAt: new Date().toISOString(),
      author: { nickname: "·", discriminator: "sys" },
    });
  }, [addMessage]);
  const onWorldOpen = useCallback(() => {
    transportRef.current?.send({ type: "world.open" });
  }, []);
  const onDiceRoll = useCallback((expression: string) => {
    transportRef.current?.send({ type: "dice.roll", expression });
  }, []);

  const worldActive = useStore((s) => s.worldActive);
  const worldCreditUsed = useStore((s) => s.worldCreditUsed);
  const worldCreditTotal = useStore((s) => s.worldCreditTotal);

  const changelogOpen = useStore((s) => s.changelogOpen);
  const changelogIndex = useStore((s) => s.changelogIndex);
  const openChangelog = useStore((s) => s.openChangelog);
  const closeChangelog = useStore((s) => s.closeChangelog);
  const setChangelogIndex = useStore((s) => s.setChangelogIndex);

  const onlineSummary =
    onlineUsers.length === 0
      ? "no one"
      : onlineUsers.map((u) => `${u.nickname}#${u.discriminator}`).join(", ");

  // Messages are rendered via <Static>: each item writes to terminal
  // scrollback exactly once, then is never redrawn. This keeps the live
  // Ink frame tiny (header + online + input + status) so keystrokes don't
  // flicker the message history.
  return (
    <>
      <Static items={messages}>
        {(m) => <MessageRow key={m.id} m={m} />}
      </Static>
      <Box flexDirection="column">
        <Box>
          <Text bold>Room: {roomName}</Text>
          {authedUser ? (
            <Text dimColor>
              {" "}
              (you are {authedUser.nickname}#{authedUser.discriminator})
            </Text>
          ) : null}
        </Box>
        <Box>
          <Text dimColor>Online ({onlineUsers.length}): </Text>
          <Text>{onlineSummary}</Text>
        </Box>
        {changelogOpen ? (
          <Changelog
            entries={CHANGELOG}
            index={changelogIndex}
            onIndexChange={setChangelogIndex}
            onClose={closeChangelog}
          />
        ) : (
          <>
            {worldActive ? (
              <WorldPanel
                creditUsed={worldCreditUsed}
                creditTotal={worldCreditTotal}
              />
            ) : null}
            <InputBar
              onSend={onSend}
              onNick={onNick}
              onColor={onColor}
              onChangelog={openChangelog}
              onHelp={onHelp}
              onWorldOpen={onWorldOpen}
              onDiceRoll={onDiceRoll}
            />
            <StatusBar
              status={status}
              reconnectAttempt={reconnectAttempt}
              updateAvailable={updateAvailable}
            />
          </>
        )}
      </Box>
    </>
  );
}
