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

export function formatSystem(event: string, body: string): string {
  return `_${event}_ ${body}`;
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

export function notify(target: WebhookTarget | null, content: string): void {
  if (!target) return;
  void pushToDiscord(target, content);
}
