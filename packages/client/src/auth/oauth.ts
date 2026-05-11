import openDefault from "open";

export type OAuthProvider = "github" | "google" | "discord";

export type RunOAuthInput = {
  provider: OAuthProvider;
  backendHttpUrl: string;
  /** Replace in tests with a stub that records the URL. */
  open?: (url: string) => Promise<void> | void;
  pollIntervalMs?: number;
  /** Aborts the polling loop. */
  signal?: AbortSignal;
};

export type OAuthResult = { token: string };

type StartResponse = {
  authUrl: string;
  pollUrl: string;
  state: string;
};

type PollResponse =
  | { status: "ready"; token: string }
  | { status: "pending" }
  | { status: "not_found" };

export async function runOAuthFlow(input: RunOAuthInput): Promise<OAuthResult> {
  const open = input.open ?? ((u: string) => openDefault(u));
  const interval = input.pollIntervalMs ?? 1000;

  const startRes = await fetch(`${input.backendHttpUrl}/auth/oauth/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: input.provider }),
  });
  if (!startRes.ok) {
    throw new Error(`oauth start failed (${startRes.status})`);
  }
  const start = (await startRes.json()) as StartResponse;

  await open(start.authUrl);

  const pollUrl = start.pollUrl.startsWith("http")
    ? start.pollUrl
    : `${input.backendHttpUrl}${start.pollUrl}`;

  while (true) {
    if (input.signal?.aborted) {
      throw new Error("oauth flow aborted");
    }
    await new Promise((r) => setTimeout(r, interval));
    const res = await fetch(pollUrl);
    if (res.status === 404) {
      throw new Error("oauth state expired or not found");
    }
    if (!res.ok) {
      // transient — keep trying
      continue;
    }
    const body = (await res.json()) as PollResponse;
    if (body.status === "ready") return { token: body.token };
    if (body.status === "pending") continue;
    throw new Error("oauth state not found");
  }
}
