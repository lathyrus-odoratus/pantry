import { logger } from "../logger.js";

export type WebhookTarget = {
  url: string;
  threadId: string | null;
};

export type RoomWebhook = {
  url: string | null;
  threadId: string | null;
};

export function targetFromRoom(room: RoomWebhook): WebhookTarget | null {
  if (!room.url) return null;
  return { url: room.url, threadId: room.threadId };
}

const MAX_DISCORD_CONTENT = 2000;

export function formatChat(
  author: { nickname: string; discriminator: string },
  body: string,
): string {
  const label = `**${author.nickname}#${author.discriminator}**`;
  const content = `${label}: ${body}`;
  return content.length <= MAX_DISCORD_CONTENT
    ? content
    : `${content.slice(0, MAX_DISCORD_CONTENT - 1)}…`;
}

export function formatSystem(_event: string, body: string): string {
  return `> ${body}`;
}

function buildUrl(target: WebhookTarget): string {
  if (!target.threadId) return target.url;
  const sep = target.url.includes("?") ? "&" : "?";
  return `${target.url}${sep}thread_id=${encodeURIComponent(target.threadId)}`;
}

export async function pushToDiscord(
  target: WebhookTarget,
  content: string,
): Promise<void> {
  try {
    const res = await fetch(buildUrl(target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 500) },
        "discord webhook non-2xx",
      );
    }
  } catch (err) {
    logger.warn({ err }, "discord webhook fetch failed");
  }
}

// ─── Batching ────────────────────────────────────────────────────────────────
// Discord allows 30 POSTs/min per webhook URL. notify() accumulates lines per
// (url, threadId) target; a global 10s tick flushes each non-empty queue as a
// single POST (split into multiple POSTs only when a single batch exceeds
// MAX_DISCORD_CONTENT). Worst case: 6 POSTs/min per webhook — well under 30.

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE_LINES = 500;

type QueueEntry = { lines: string[]; target: WebhookTarget };
const queues = new Map<string, QueueEntry>();
let flushTimer: NodeJS.Timeout | null = null;

function queueKey(target: WebhookTarget): string {
  return `${target.url}|${target.threadId ?? ""}`;
}

function packChunks(lines: string[]): string[] {
  const chunks: string[] = [];
  let buf = "";
  for (const raw of lines) {
    const line =
      raw.length <= MAX_DISCORD_CONTENT
        ? raw
        : `${raw.slice(0, MAX_DISCORD_CONTENT - 1)}…`;
    if (buf.length === 0) {
      buf = line;
      continue;
    }
    if (buf.length + 1 + line.length > MAX_DISCORD_CONTENT) {
      chunks.push(buf);
      buf = line;
    } else {
      buf += `\n${line}`;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export async function flushWebhookQueues(): Promise<void> {
  if (queues.size === 0) return;
  const entries = Array.from(queues.values());
  queues.clear();
  await Promise.all(
    entries.map(async (e) => {
      for (const chunk of packChunks(e.lines)) {
        await pushToDiscord(e.target, chunk);
      }
    }),
  );
}

function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushWebhookQueues();
  }, FLUSH_INTERVAL_MS);
  // Don't keep the event loop alive on its own — tests and shutdown paths
  // shouldn't have to clear this explicitly.
  flushTimer.unref();
}

export function notify(target: WebhookTarget | null, content: string): void {
  if (!target) return;
  ensureFlushTimer();
  const key = queueKey(target);
  let q = queues.get(key);
  if (!q) {
    q = { lines: [], target };
    queues.set(key, q);
  }
  q.lines.push(content);
  if (q.lines.length > MAX_QUEUE_LINES) {
    const overflow = q.lines.length - MAX_QUEUE_LINES;
    q.lines.splice(0, overflow);
    logger.warn(
      { url: target.url, dropped: overflow },
      "discord webhook queue overflow; dropped oldest",
    );
  }
}

export function _resetWebhookBatching(): void {
  queues.clear();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
