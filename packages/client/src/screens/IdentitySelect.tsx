import React, { useState, useRef, useLayoutEffect, useCallback } from "react";
import { Box, Text, useStdin } from "ink";
import { useStore } from "../store.js";

type ItemValue = "anon" | "github" | "google" | "discord";

const items: { label: string; value: ItemValue }[] = [
  { label: "Anonymous (just a nickname)", value: "anon" },
  { label: "Sign in with GitHub", value: "github" },
  { label: "Sign in with Google", value: "google" },
  { label: "Sign in with Discord", value: "discord" },
];

export function IdentitySelect(): React.JSX.Element {
  const roomName = useStore((s) => s.roomName);
  const setScreen = useStore((s) => s.setScreen);
  const setPending = useStore((s) => s.setPendingIdentity);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);

  // Access ink internals for synchronous listener registration
  const { setRawMode, internal_eventEmitter } = useStdin() as any;

  const handleInput = useCallback(
    (data: string) => {
      // Handle down arrow: raw ESC sequence "\x1b[B" OR bare "[B" from tests
      const isDown =
        data === "\x1b[B" || data === "[B" || data === "j" || data === "\x1b[b";
      const isUp =
        data === "\x1b[A" || data === "[A" || data === "k" || data === "\x1b[a";
      const isReturn = data === "\r" || data === "\n";

      if (isDown) {
        const next = (selectedIndexRef.current + 1) % items.length;
        selectedIndexRef.current = next;
        setSelectedIndex(next);
      } else if (isUp) {
        const next = (selectedIndexRef.current - 1 + items.length) % items.length;
        selectedIndexRef.current = next;
        setSelectedIndex(next);
      } else if (isReturn) {
        const item = items[selectedIndexRef.current];
        if (!item) return;
        if (item.value === "anon") {
          setPending(null);
          setScreen("nickname_input");
        } else {
          setPending({ kind: "oauth", provider: item.value, token: "" });
          setScreen("oauth_waiting");
        }
      }
    },
    [setPending, setScreen],
  );

  // Use useLayoutEffect (synchronous, runs during commit phase) instead of
  // useEffect (asynchronous, deferred via setImmediate) so the listener is
  // registered before any stdin.write() calls in tests.
  useLayoutEffect(() => {
    setRawMode(true);
    internal_eventEmitter?.on("input", handleInput);
    return () => {
      internal_eventEmitter?.removeListener("input", handleInput);
      setRawMode(false);
    };
  }, [setRawMode, internal_eventEmitter, handleInput]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>
          Room: <Text bold>{roomName}</Text>
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>How do you want to join?</Text>
      </Box>
      <Box flexDirection="column">
        {items.map((item, index) => (
          <Box key={item.value}>
            <Text>{index === selectedIndex ? "> " : "  "}</Text>
            <Text bold={index === selectedIndex}>{item.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
