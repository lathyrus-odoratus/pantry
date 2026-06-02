import type { ExtGameInfo } from "@pantry/shared";

export type SessionStarted = { sessionId: string; frame: string; tick?: number };

export type InputResult =
  | { quit: true }
  | { frame: string; tick?: number; over: boolean; result: string | null };

export type FrameResult = { frame: string; tick?: number };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  const res = await fetch(url, options);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

export async function listGames(baseUrl: string): Promise<ExtGameInfo[]> {
  return (await fetchJson<ExtGameInfo[]>(`${baseUrl}/games`)) ?? [];
}

export async function startSession(
  baseUrl: string,
  gameId: string,
): Promise<SessionStarted | null> {
  return fetchJson<SessionStarted>(`${baseUrl}/games/${encodeURIComponent(gameId)}/sessions`, {
    method: "POST",
  });
}

export async function sendInput(
  baseUrl: string,
  sessionId: string,
  key: string,
): Promise<InputResult | null> {
  return fetchJson<InputResult>(
    `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/input`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    },
  );
}

export async function getFrame(
  baseUrl: string,
  sessionId: string,
): Promise<FrameResult | null> {
  return fetchJson<FrameResult>(
    `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/frame`,
  );
}
