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
  replyTo?: {
    author: { nickname: string; discriminator: string };
    body: string;
  },
): string {
  const label = `**${author.nickname}#${author.discriminator}**`;
  const quoted = replyTo
    ? `> ${replyTo.author.nickname}#${replyTo.author.discriminator}: ${replyTo.body.replace(/\n/g, "\n> ")}\n`
    : "";
  const content = `${quoted}${label}: ${body}`;
  return content.length <= MAX_DISCORD_CONTENT
    ? content
    : `${content.slice(0, MAX_DISCORD_CONTENT - 1)}…`;
}

function truncate(content: string): string {
  return content.length <= MAX_DISCORD_CONTENT
    ? content
    : `${content.slice(0, MAX_DISCORD_CONTENT - 1)}…`;
}

/**
 * Webhook username for a chat author, or null when Discord would reject it
 * (names follow the nickname rules: 1–80 chars, no "clyde"/"discord").
 */
export function chatUsername(author: {
  nickname: string;
  discriminator: string;
}): string | null {
  const name = `${author.nickname}#${author.discriminator}`;
  if (name.length > 80 || /clyde|discord/i.test(name)) return null;
  return name;
}

export type ChatPost = {
  /** Sent with `username` set to the author, so no inline label. */
  content: string;
  /** Labeled form, sent under the bot's own name if the username is unusable. */
  fallback: string;
  username: string | null;
};

export function formatChatPost(
  author: { nickname: string; discriminator: string },
  body: string,
  replyTo?: {
    author: { nickname: string; discriminator: string };
    body: string;
  },
): ChatPost {
  const fallback = formatChat(author, body, replyTo);
  const username = chatUsername(author);
  if (!username) return { content: fallback, fallback, username: null };
  const quoted = replyTo
    ? `> ${replyTo.author.nickname}#${replyTo.author.discriminator}: ${replyTo.body.replace(/\n/g, "\n> ")}\n`
    : "";
  return { content: truncate(`${quoted}${body}`), fallback, username };
}

export function formatSystem(_event: string, body: string): string {
  return `> ${body}`;
}

function buildUrl(target: WebhookTarget): string {
  if (!target.threadId) return target.url;
  const sep = target.url.includes("?") ? "&" : "?";
  return `${target.url}${sep}thread_id=${encodeURIComponent(target.threadId)}`;
}

/** Webhook id for logs. The URL itself carries the token and must not be logged. */
function webhookId(target: WebhookTarget): string | null {
  return /\/webhooks\/(\d+)\//.exec(target.url)?.[1] ?? null;
}

/**
 * POST one message. Never throws; returns the HTTP status, or null when the
 * request itself failed. Failed messages are dropped (logged, not retried).
 */
export async function pushToDiscord(
  target: WebhookTarget,
  content: string,
  username?: string | null,
): Promise<number | null> {
  const where = { webhookId: webhookId(target), threadId: target.threadId };
  try {
    const res = await fetch(buildUrl(target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        ...(username ? { username } : {}),
        allowed_mentions: { parse: [] },
      }),
    });
    if (res.status === 429) {
      // No rate limiting on our side yet; this event is how we find out we need it.
      const body = (await res.json().catch(() => ({}))) as {
        retry_after?: number;
        global?: boolean;
      };
      logger.warn(
        {
          event: "discord.rate_limited",
          ...where,
          retryAfterSec: body.retry_after ?? null,
          global: body.global ?? false,
          scope: res.headers.get("x-ratelimit-scope"),
          bucket: res.headers.get("x-ratelimit-bucket"),
          contentLength: content.length,
        },
        "discord webhook rate limited; message dropped",
      );
    } else if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { ...where, status: res.status, username: username ?? null, body: text.slice(0, 500) },
        "discord webhook non-2xx",
      );
    }
    return res.status;
  } catch (err) {
    logger.warn({ ...where, err }, "discord webhook fetch failed");
    return null;
  }
}

// ─── Batching ────────────────────────────────────────────────────────────────
// Discord allows 30 POSTs/min per webhook URL. notify() accumulates lines per
// (url, threadId) target; a global 10s tick flushes each non-empty queue as a
// single POST (split into multiple POSTs only when a single batch exceeds
// MAX_DISCORD_CONTENT). Worst case: 6 POSTs/min per webhook — well under 30.

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE_LINES = 500;

type QueueItem = ChatPost;
type QueueEntry = { lines: QueueItem[]; target: WebhookTarget };
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

/** Split into runs of consecutive items with the same username, keeping order. */
function splitRuns(items: QueueItem[]): QueueItem[][] {
  const runs: QueueItem[][] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last && last[0]!.username === item.username) last.push(item);
    else runs.push([item]);
  }
  return runs;
}

async function sendRun(target: WebhookTarget, run: QueueItem[]): Promise<void> {
  const username = run[0]!.username;
  const chunks = packChunks(run.map((i) => i.content));
  for (const [i, chunk] of chunks.entries()) {
    const status = await pushToDiscord(target, chunk, username);
    if (i === 0 && username && status === 400) {
      // Discord rejected the username (it has unlisted name rules): resend the
      // whole run under the bot's name with inline labels.
      for (const fb of packChunks(run.map((r) => r.fallback))) {
        await pushToDiscord(target, fb);
      }
      return;
    }
  }
}

export async function flushWebhookQueues(): Promise<void> {
  if (queues.size === 0) return;
  const entries = Array.from(queues.values());
  queues.clear();
  await Promise.all(
    entries.map(async (e) => {
      for (const run of splitRuns(e.lines)) {
        await sendRun(e.target, run);
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

/** Queue a system line, sent under the bot's own name. */
export function notify(target: WebhookTarget | null, content: string): void {
  enqueue(target, { content, fallback: content, username: null });
}

/** Queue a chat message, sent under the author's name. */
export function notifyChat(target: WebhookTarget | null, post: ChatPost): void {
  enqueue(target, post);
}

function enqueue(target: WebhookTarget | null, item: QueueItem): void {
  if (!target) return;
  ensureFlushTimer();
  const key = queueKey(target);
  let q = queues.get(key);
  if (!q) {
    q = { lines: [], target };
    queues.set(key, q);
  }
  q.lines.push(item);
  if (q.lines.length > MAX_QUEUE_LINES) {
    const overflow = q.lines.length - MAX_QUEUE_LINES;
    q.lines.splice(0, overflow);
    logger.warn(
      { webhookId: webhookId(target), threadId: target.threadId, dropped: overflow },
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
