import React, { useCallback, useEffect, useRef } from "react";
import { Box, Static, Text } from "ink";
import type { Message } from "@pantry/shared";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { Changelog } from "./components/Changelog.js";
import { Settings } from "./components/Settings.js";
import { WorldPanel } from "./components/WorldPanel.js";
import { GameView } from "./components/GameView.js";
import { GameSpectate } from "./components/GameSpectate.js";
import { ExtGameSelect } from "./components/ExtGameSelect.js";
import { ExtGameView } from "./components/ExtGameView.js";
import { CHANGELOG } from "../changelog.js";
import { HELP_TEXT } from "../help.js";
import { CLIENT_VERSION, compareSemver } from "../version.js";
import { saveAnon } from "../auth/anon.js";
import { linkify } from "../util/links.js";
import { findMaps } from "../util/mapLinks.js";
import { MapGrid } from "./components/MapGrid.js";

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
  // Static items render exactly once; resolve store state at that moment via
  // getState() to avoid subscribing (which would defeat Static).
  const snapshot = useStore.getState();
  const padding = snapshot.prefs.messagePadding;

  // System notices (joins, leaves, renames, local /h help, world.open/end,
  // dice rolls) render as a dim block without the `nick#disc:` prefix. Body
  // may be multi-line.
  if (m.author.discriminator === "sys") {
    return (
      <Box flexDirection="column" marginTop={padding}>
        {m.body.split("\n").map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>
    );
  }
  const label = `${m.author.nickname}#${m.author.discriminator}`;
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
  // A pasted map-editor permalink is unfurled into a full-size map below the
  // message, terminal-side only — the message body stays the raw URL (that's
  // what Discord and other clients see).
  const maps = findMaps(m.body);
  return (
    <Box flexDirection="column" marginTop={padding} marginBottom={isNpc ? 1 : 0}>
      <Box>
        {prefixEmoji ? <Text>{prefixEmoji} </Text> : null}
        <Text color={color} bold>
          {label}
        </Text>
        <Text dimColor>: </Text>
        <Text>{linkify(m.body)}</Text>
      </Box>
      {maps.map((map, i) => (
        <MapGrid key={i} map={map} />
      ))}
    </Box>
  );
}

export function Chat({ serverUrl }: Props): React.JSX.Element | null {
  const messages = useStore((s) => s.messages);
  const onlineUsers = useStore((s) => s.onlineUsers);
  const authedUser = useStore((s) => s.authedUser);
  const status = useStore((s) => s.status);
  const reconnectAttempt = useStore((s) => s.reconnectAttempt);
  const lastDisconnect = useStore((s) => s.lastDisconnect);
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
  const setCurrentGame = useStore((s) => s.setCurrentGame);
  const currentGame = useStore((s) => s.currentGame);
  const cabombView = useStore((s) => s.cabombView);
  const cabombActive = useStore((s) => s.cabombActive);
  const extGameView = useStore((s) => s.extGameView);
  const extGameActive = useStore((s) => s.extGameActive);
  const extGameSelecting = useStore((s) => s.extGameSelecting);
  const extGames = useStore((s) => s.extGames);
  const setError = useStore((s) => s.setError);

  const transportRef = useRef<TransportClient | null>(null);

  useEffect(() => {
    if (!pending) return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt, detail) => setStatus(s, attempt, detail),
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
            useStore.getState().setCabombActive(
              m.activeGame ? { by: m.activeGame.by } : null,
            );
            useStore.getState().setExtGameActive(m.extGame ?? null);
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
          case "game.state":
            setCurrentGame(m);
            break;
          case "game.over": {
            setCurrentGame(null);
            const label = `${m.playerNickname}#${m.playerDiscriminator}`;
            const body =
              m.result === "win"
                ? `── 🎮 ${label} 消滅了所有敵人！ ──`
                : m.result === "loss"
                  ? `── 💀 ${label} 被炸了。 ──`
                  : `── ${label} 離開了遊戲。 ──`;
            addMessage({
              id: `game-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              body,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "sys" },
            });
            break;
          }
          case "game.error":
            break;
          case "cabomb.started": {
            useStore.getState().setCabombActive({ by: m.by });
            const me = useStore.getState().authedUser;
            const myName = me ? `${me.nickname}#${me.discriminator}` : null;
            if (m.by !== myName) {
              addMessage({
                id: `cabomb-start-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
                body: `── 🎮 ${m.by} 開了一場 CA-bomb，輸入 /watch 旁觀（/watch bw 黑白）──`,
                createdAt: new Date().toISOString(),
                author: { nickname: "·", discriminator: "sys" },
              });
            }
            break;
          }
          case "cabomb.state":
            useStore.getState().setCabombState(m);
            break;
          case "cabomb.pong":
            useStore.getState().setCabombLatency(Date.now() - m.t);
            break;
          case "ext.games":
            useStore.getState().setExtGames(m.games);
            break;
          case "ext.game.started": {
            useStore.getState().setExtGameActive({ by: m.by, gameId: m.gameId, title: m.title });
            const me = useStore.getState().authedUser;
            const myName = me ? `${me.nickname}#${me.discriminator}` : null;
            if (m.by === myName) {
              useStore.getState().enterExtGameDriver();
            } else {
              addMessage({
                id: `extgame-start-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
                body: `── 🎮 ${m.by} 開始玩 ${m.title}，輸入 /watch 旁觀 ──`,
                createdAt: new Date().toISOString(),
                author: { nickname: "·", discriminator: "sys" },
              });
            }
            break;
          }
          case "ext.game.frame":
            useStore.getState().setExtGameFrame(m.frame);
            break;
          case "ext.game.over": {
            useStore.getState().setExtGameActive(null);
            const isParticipant = useStore.getState().extGameView !== null;
            if (isParticipant) {
              useStore.getState().setExtGameOver({ result: m.result });
            } else {
              const txt =
                m.result === "win"
                  ? `🎮 ${m.by} 完成了 ${m.title}！`
                  : m.result === "loss"
                    ? `💀 ${m.by} 在 ${m.title} 失敗了。`
                    : `${m.by} 結束了 ${m.title}。`;
              addMessage({
                id: `extgame-over-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
                body: `── ${txt} ──`,
                createdAt: new Date().toISOString(),
                author: { nickname: "·", discriminator: "sys" },
              });
            }
            break;
          }
          case "ext.game.error": {
            const reason = m.reason;
            if (reason === "already_active") {
              addMessage({
                id: `extgame-err-${Date.now()}`,
                body: "── 房間內已有遊戲進行中 ──",
                createdAt: new Date().toISOString(),
                author: { nickname: "·", discriminator: "sys" },
              });
            } else if (reason === "api_error" || reason === "game_not_found") {
              addMessage({
                id: `extgame-err-${Date.now()}`,
                body: "── 遊戲服務暫時無法使用 ──",
                createdAt: new Date().toISOString(),
                author: { nickname: "·", discriminator: "sys" },
              });
            }
            useStore.getState().cancelExtGameSelect();
            // Only force-exit if this user was actually in the game view.
            // Calling exitExtGame unconditionally would clear extGameActive for
            // bystanders who got an already_active/api_error on a start attempt,
            // breaking the /watch hint and command until the next reconnect.
            if (useStore.getState().extGameView !== null) {
              useStore.getState().exitExtGame();
            }
            break;
          }
          case "cabomb.over": {
            useStore.getState().setCabombResult(m);
            useStore.getState().setCabombActive(null);
            const body =
              m.result === "win"
                ? `🎮 ${m.by} 清光了敵人！`
                : m.result === "loss"
                  ? `💀 ${m.by} 被炸飛了。`
                  : `${m.by} 結束了 CA-bomb。`;
            addMessage({
              id: `cabomb-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              body: m.summary ? `── ${body} ──\n${m.summary}` : `── ${body} ──`,
              createdAt: new Date().toISOString(),
              author: { nickname: "·", discriminator: "sys" },
            });
            break;
          }
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
    useStore.getState().setCabombSend((msg) => client.send(msg));
    useStore.getState().setExtGameSend((msg) => client.send(msg));
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
      useStore.getState().setCabombSend(null);
      useStore.getState().setExtGameSend(null);
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
  const onDiceRoll = useCallback(() => {
    transportRef.current?.send({ type: "dice.roll" });
  }, []);
  const onGameStart = useCallback(() => {
    transportRef.current?.send({ type: "game.start" });
  }, []);
  const onGameInput = useCallback(
    (key: "w" | "a" | "s" | "d" | "bomb" | "quit") => {
      transportRef.current?.send({ type: "game.input", key });
    },
    [],
  );
  const onCabomb = useCallback(() => {
    transportRef.current?.send({ type: "cabomb.start" });
    useStore.getState().enterCabomb({ role: "driver", mono: false });
  }, []);
  const onWatch = useCallback((mono: boolean) => {
    const state = useStore.getState();
    if (state.cabombActive) {
      transportRef.current?.send({ type: "cabomb.watch" });
      state.enterCabomb({ role: "spectator", mono });
    } else if (state.extGameActive) {
      transportRef.current?.send({ type: "ext.game.watch" });
      state.enterExtGameSpectator();
    }
  }, []);
  const onExtGame = useCallback(() => {
    useStore.getState().startExtGameSelect();
    transportRef.current?.send({ type: "ext.game.list" });
  }, []);

  const worldActive = useStore((s) => s.worldActive);
  const worldCreditUsed = useStore((s) => s.worldCreditUsed);
  const worldCreditTotal = useStore((s) => s.worldCreditTotal);

  const changelogOpen = useStore((s) => s.changelogOpen);
  const changelogIndex = useStore((s) => s.changelogIndex);
  const openChangelog = useStore((s) => s.openChangelog);
  const closeChangelog = useStore((s) => s.closeChangelog);
  const setChangelogIndex = useStore((s) => s.setChangelogIndex);

  const settingsOpen = useStore((s) => s.settingsOpen);
  const openSettings = useStore((s) => s.openSettings);
  const closeSettings = useStore((s) => s.closeSettings);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);

  const onlineSummary =
    onlineUsers.length === 0
      ? "no one"
      : onlineUsers.map((u) => `${u.nickname}#${u.discriminator}`).join(", ");

  // While in the full-screen CA-bomb view, render nothing: the CabombOverlay
  // owns the terminal. Hooks above still run, so the WS connection (and the
  // message→store dispatch that feeds the overlay) stays alive.
  if (cabombView) return null;

  const onExtGameSelect = (gameId: string) => {
    useStore.getState().cancelExtGameSelect();
    transportRef.current?.send({ type: "ext.game.start", gameId });
  };
  const onExtGameQuit = () => {
    useStore.getState().extGameSend?.({ type: "ext.game.input", key: "quit" });
    useStore.getState().exitExtGame();
  };

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
        {extGameView ? (
          <ExtGameView onQuit={onExtGameQuit} />
        ) : extGameSelecting ? (
          <ExtGameSelect
            games={extGames}
            onSelect={onExtGameSelect}
            onCancel={() => useStore.getState().cancelExtGameSelect()}
          />
        ) : currentGame && authedUser &&
        currentGame.playerNickname === authedUser.nickname &&
        currentGame.playerDiscriminator === authedUser.discriminator ? (
          <GameView game={currentGame} onInput={onGameInput} />
        ) : changelogOpen ? (
          <Changelog
            entries={CHANGELOG}
            index={changelogIndex}
            onIndexChange={setChangelogIndex}
            onClose={closeChangelog}
          />
        ) : settingsOpen ? (
          <Settings
            prefs={prefs}
            onPrefsChange={setPrefs}
            onClose={closeSettings}
          />
        ) : (
          <>
            {worldActive ? (
              <WorldPanel
                creditUsed={worldCreditUsed}
                creditTotal={worldCreditTotal}
              />
            ) : null}
            {currentGame ? <GameSpectate game={currentGame} /> : null}
            <InputBar
              onSend={onSend}
              onNick={onNick}
              onColor={onColor}
              onChangelog={openChangelog}
              onSettings={openSettings}
              onHelp={onHelp}
              onWorldOpen={onWorldOpen}
              onDiceRoll={onDiceRoll}
              onGameStart={onGameStart}
              onCabomb={onCabomb}
              onWatch={onWatch}
              onExtGame={onExtGame}
            />
            <StatusBar
              status={status}
              reconnectAttempt={reconnectAttempt}
              updateAvailable={updateAvailable}
              lastDisconnect={lastDisconnect}
              cabombActive={cabombActive}
              extGameActive={extGameActive}
            />
          </>
        )}
      </Box>
    </>
  );
}
