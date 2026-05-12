import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import terminalLink from "terminal-link";
import { useStore } from "../store.js";
import { runOAuthFlow } from "../auth/oauth.js";

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
      {/* URL is rendered at column 0 (outside paddingX) so wrap doesn't insert
          leading whitespace. OSC 8 hyperlink (via terminal-link) lets terminals
          like iTerm 3.4+ treat the whole wrapped URL as one Cmd+clickable link;
          plain-URL fallback for terminals without OSC 8 support. */}
      {authUrl ? (
        <Box marginY={1}>
          <Text color="cyan">{terminalLink(authUrl, authUrl)}</Text>
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
