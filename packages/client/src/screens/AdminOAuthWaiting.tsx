import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useStore } from "../store.js";
import { runOAuthFlow } from "../auth/oauth.js";
import { loadCredentials, saveCredentials } from "../auth/credentials.js";

const OSC_PREFIX = "]";
const ST = "\\";
function osc8(text: string, url: string): string {
  return `${OSC_PREFIX}8;;${url}${ST}${text}${OSC_PREFIX}8;;${ST}`;
}

type Props = { backendHttpUrl: string };

export function AdminOAuthWaiting({ backendHttpUrl }: Props): React.JSX.Element {
  const setPending = useStore((s) => s.setPendingIdentity);
  const setScreen = useStore((s) => s.setScreen);
  const setError = useStore((s) => s.setError);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reuse a previously saved Discord token if one exists. The backend will
      // re-validate on auth.admin — if expired or the user has been demoted,
      // AdminMenu clears it and we end up back here.
      const cached = await loadCredentials();
      if (cancelled) return;
      if (cached && cached.provider === "discord") {
        setPending({ kind: "oauth", provider: "discord", token: cached.token });
        setScreen("admin_menu");
        return;
      }
      try {
        const result = await runOAuthFlow({
          provider: "discord",
          backendHttpUrl,
          open: async (u) => {
            if (!cancelled) setAuthUrl(u);
            const open = (await import("open")).default;
            await open(u);
          },
        });
        if (cancelled) return;
        await saveCredentials({
          token: result.token,
          provider: "discord",
          savedAt: new Date().toISOString(),
        });
        setPending({ kind: "oauth", provider: "discord", token: result.token });
        setScreen("admin_menu");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendHttpUrl, setPending, setScreen, setError]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box marginBottom={1}>
          <Text bold>Admin mode — sign in with Discord</Text>
        </Box>
        {authUrl ? (
          <Text>Open this URL in your browser:</Text>
        ) : (
          <Text dimColor>Preparing authorization request…</Text>
        )}
      </Box>
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
