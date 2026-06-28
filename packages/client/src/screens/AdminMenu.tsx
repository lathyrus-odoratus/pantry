import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ClientMessage } from "@pantry/shared";
import { useStore } from "../store.js";
import { TransportClient } from "../transport/client.js";
import { clearCredentials } from "../auth/credentials.js";
import { tint, dimText } from "../theme.js";

type Props = { serverUrl: string };

type PromptMode =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "delete-confirm"; roomName: string };

export function AdminMenu({ serverUrl }: Props): React.JSX.Element {
  const pending = useStore((s) => s.pendingIdentity);
  const rooms = useStore((s) => s.adminRooms);
  const setAdminRooms = useStore((s) => s.setAdminRooms);
  const statusLine = useStore((s) => s.adminStatusLine);
  const setStatusLine = useStore((s) => s.setAdminStatusLine);
  const setError = useStore((s) => s.setError);
  const status = useStore((s) => s.status);
  const setStatus = useStore((s) => s.setStatus);
  const theme = useStore((s) => s.prefs.theme);

  const transportRef = useRef<TransportClient | null>(null);
  const [authed, setAuthed] = useState(false);
  const [selected, setSelected] = useState(0);
  const [prompt, setPrompt] = useState<PromptMode>({ kind: "none" });
  const [createInput, setCreateInput] = useState("");
  const { exit } = useApp();

  const send = (msg: ClientMessage) => transportRef.current?.send(msg);
  const refreshRooms = () => send({ type: "admin.rooms.list" });

  useEffect(() => {
    if (!pending || pending.kind !== "oauth") return;
    const client = new TransportClient({
      url: serverUrl,
      onStatus: (s, attempt, detail) => setStatus(s, attempt, detail),
      onMessage: (m) => {
        switch (m.type) {
          case "admin.auth.ok":
            setAuthed(true);
            send({ type: "admin.rooms.list" });
            break;
          case "auth.error":
            // Cached token rejected (expired / signing key rotated / demoted).
            // Wipe the cache so the next launch re-runs the OAuth flow.
            void clearCredentials();
            setError(`Admin auth failed: ${m.reason}`);
            client.close();
            break;
          case "admin.rooms":
            setAdminRooms(m.rooms);
            setSelected((i) => Math.min(i, Math.max(0, m.rooms.length - 1)));
            break;
          case "admin.ok":
            setStatusLine(`✓ ${m.op} ${m.roomName}`);
            send({ type: "admin.rooms.list" });
            break;
          case "admin.error":
            setStatusLine(
              `✗ ${m.op} ${m.code}${m.message ? ` — ${m.message}` : ""}`,
            );
            break;
        }
      },
    });
    transportRef.current = client;
    client.connect();
    return () => {
      client.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, serverUrl]);

  // When transport status flips to connected, send auth.admin once.
  useEffect(() => {
    if (status !== "connected" || authed) return;
    if (!pending || pending.kind !== "oauth") return;
    send({ type: "auth.admin", token: pending.token });
  }, [status, authed, pending]);

  useInput((input, key) => {
    if (prompt.kind !== "none") return;
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.upArrow) {
      setSelected((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((i) => Math.min(rooms.length - 1, i + 1));
      return;
    }
    if (input === "R") {
      refreshRooms();
      setStatusLine("Refreshing…");
      return;
    }
    if (input === "n") {
      setCreateInput("");
      setPrompt({ kind: "create" });
      return;
    }
    const current = rooms[selected];
    if (!current) return;
    if (input === "c") {
      send({ type: "admin.room.close", name: current.name });
      return;
    }
    if (input === "r") {
      send({ type: "admin.room.reopen", name: current.name });
      return;
    }
    if (input === "d") {
      setPrompt({ kind: "delete-confirm", roomName: current.name });
      return;
    }
  });

  if (!pending || pending.kind !== "oauth") {
    return (
      <Box padding={1}>
        <Text color={tint(undefined, theme)}>Admin session lost — restart with --admin.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingTop={1}>
        <Text color={tint(undefined, theme)} bold>Admin · pantry</Text>
        <Text {...dimText(theme)}>  ({status}{authed ? ", authed" : ""})</Text>
      </Box>
      <Box paddingX={1} paddingY={1} flexDirection="column">
        {rooms.length === 0 ? (
          <Text {...dimText(theme)}>
            {authed ? "(no rooms — press n to create)" : "Connecting…"}
          </Text>
        ) : (
          <>
            <Box>
              <Text color={tint(undefined, theme)} bold>
                {"  "}
                {"NAME".padEnd(24)}
                {"STATE".padEnd(8)}
                {"ONLINE".padEnd(8)}
                {"CREATED"}
              </Text>
            </Box>
            {rooms.map((r, i) => {
              const marker = i === selected ? "▶ " : "  ";
              const state = r.closedAt ? "closed" : "open";
              const created = r.createdAt.slice(0, 10);
              return (
                <Box key={r.id}>
                  <Text color={tint(undefined, theme)} inverse={i === selected}>
                    {marker}
                    {r.name.padEnd(24)}
                    {state.padEnd(8)}
                    {String(r.onlineCount).padEnd(8)}
                    {created}
                  </Text>
                </Box>
              );
            })}
          </>
        )}
      </Box>
      {prompt.kind === "create" ? (
        <Box paddingX={1}>
          <Text color={tint(undefined, theme)}>New room name: </Text>
          <TextInput
            value={createInput}
            onChange={setCreateInput}
            onSubmit={(v) => {
              const name = v.trim();
              setPrompt({ kind: "none" });
              if (!name) return;
              send({ type: "admin.room.create", name });
            }}
          />
        </Box>
      ) : prompt.kind === "delete-confirm" ? (
        <Box paddingX={1} flexDirection="column">
          <Text color={tint("red", theme)}>
            Delete &quot;{prompt.roomName}&quot;? This cascades all messages.
          </Text>
          <Text {...dimText(theme)}>Press y to confirm, any other key to cancel.</Text>
          <DeleteConfirm
            roomName={prompt.roomName}
            onConfirm={() => {
              send({ type: "admin.room.delete", name: prompt.roomName });
              setPrompt({ kind: "none" });
            }}
            onCancel={() => setPrompt({ kind: "none" })}
          />
        </Box>
      ) : (
        <Box paddingX={1} flexDirection="column">
          <Text {...dimText(theme)}>
            ↑/↓ select · c close · r reopen · n create · d delete · R refresh · q quit
          </Text>
          {statusLine ? <Text color={tint(undefined, theme)}>{statusLine}</Text> : null}
        </Box>
      )}
    </Box>
  );
}

function DeleteConfirm({
  onConfirm,
  onCancel,
}: {
  roomName: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  useInput((input) => {
    if (input === "y" || input === "Y") onConfirm();
    else onCancel();
  });
  return <Text />;
}
