export type TuiSessionStarted = { sessionId: string; frame: string; tick: number };
export type TuiInputResult = { quit: true } | { frame: string; tick: number };
export type TuiFrameResult = { frame: string; tick: number };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  const res = await fetch(url, options);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

export async function startTuiSession(
  baseUrl: string,
  nickname: string,
): Promise<TuiSessionStarted | null> {
  return fetchJson<TuiSessionStarted>(`${baseUrl}/tui/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
}

export async function sendTuiInput(
  baseUrl: string,
  sessionId: string,
  key: string,
): Promise<TuiInputResult | null> {
  return fetchJson<TuiInputResult>(
    `${baseUrl}/tui/sessions/${encodeURIComponent(sessionId)}/input`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    },
  );
}

export async function getTuiFrame(
  baseUrl: string,
  sessionId: string,
): Promise<TuiFrameResult | null> {
  return fetchJson<TuiFrameResult>(
    `${baseUrl}/tui/sessions/${encodeURIComponent(sessionId)}/frame`,
  );
}

export async function deleteTuiSession(baseUrl: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/tui/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  } catch {
    // fire-and-forget cleanup; errors are non-fatal
  }
}
