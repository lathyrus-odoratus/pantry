import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { runOAuthFlow } from "../auth/oauth.js";

// OSC 8 hyperlink, emitted unconditionally. terminal-link's auto-detection
// fails inside containers (TERM_PROGRAM doesn't propagate through Docker),
// so we send the escape sequence regardless. Modern terminals honor it;
// older ones silently drop the OSC and render only the visible text.
const OSC_PREFIX = "]";
const ST = "\\";
function osc8(text: string, url: string): string {
  return `${OSC_PREFIX}8;;${url}${ST}${text}${OSC_PREFIX}8;;${ST}`;
}

type Props = { backendHttpUrl: string };

export function OAuthWaiting({ backendHttpUrl }: Props): React.JSX.Element {
  const pending = useStore((s) => s.pendingIdentity);
  const setPending = useStore((s) => s.setPendingIdentity);
  const setError = useStore((s) => s.setError);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || pending.kind !== "oauth") return;
    let cancelled = false;
    const provider = pending.provider;
    (async () => {
      try {
        const result = await runOAuthFlow({
          provider,
          backendHttpUrl,
          open: async (u) => {
            if (!cancelled) setAuthUrl(u);
            // Best-effort: still spawn the real browser via the default `open`.
            const open = (await import("open")).default;
            await open(u);
          },
        });
        if (cancelled) return;
        setPending({ kind: "oauth", provider, token: result.token });
        useStore.getState().setScreen("chat");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, backendHttpUrl, setPending, setError]);

  const providerName =
    pending && pending.kind === "oauth" ? pending.provider : "?";

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box marginBottom={1}>
          <Text bold>Sign in with {providerName}</Text>
        </Box>
        {authUrl ? (
          <Box>
            <Text>Open this URL in your browser:</Text>
          </Box>
        ) : (
          <Text dimColor>Preparing authorization request…</Text>
        )}
      </Box>
      {/* URL rendered at column 0 (outside paddingX) so wrap is flush-left.
          Wrapped in OSC 8 escape so terminals that support it (iTerm 3.4+,
          kitty, wezterm, GNOME Terminal, Windows Terminal, VSCode) treat the
          entire visible URL as one hyperlink — Cmd+click any line opens the
          full URL even when display is wrapped. */}
      {authUrl ? (
        <Box marginY={1}>
          <Text color="cyan">{osc8(authUrl, authUrl)}</Text>
        </Box>
      ) : null}
      {authUrl ? (
        <Box paddingX={1} paddingBottom={1}>
          <Text dimColor>Waiting for authorization... (Ctrl+C to cancel)</Text>
        </Box>
      ) : null}
    </Box>
  );
}
