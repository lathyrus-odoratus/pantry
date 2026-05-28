import { z } from "zod";

export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
};

const COLOR_PUSH = 0x2ecc71;
const COLOR_PR_OPEN = 0x3498db;
const COLOR_PR_MERGED = 0x6f42c1;
const COLOR_PR_CLOSED = 0x95a5a6;
const COLOR_ISSUE = 0xe67e22;

const MAX_TITLE = 256;
const MAX_DESC = 4000;
const MAX_COMMITS = 10;

// pull_request fires for many low-signal actions (labeled, synchronize,
// assigned…). Only forward the ones worth a thread notification.
const PR_ACTIONS = new Set(["opened", "closed", "reopened", "ready_for_review"]);
const ISSUE_ACTIONS = new Set(["opened", "closed", "reopened"]);

function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function httpUrl(s: string | undefined): string | undefined {
  return s && /^https?:\/\//.test(s) ? s : undefined;
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/(heads|tags)\//, "");
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

const PushSchema = z.object({
  ref: z.string().optional(),
  compare: z.string().optional(),
  repository: z.object({ full_name: z.string().optional() }).optional(),
  pusher: z.object({ name: z.string().optional() }).optional(),
  sender: z.object({ login: z.string().optional() }).optional(),
  commits: z
    .array(
      z.object({
        id: z.string().optional(),
        message: z.string().optional(),
        author: z
          .object({ name: z.string().optional(), username: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
});

function buildPush(payload: unknown): DiscordEmbed | null {
  const parsed = PushSchema.safeParse(payload);
  if (!parsed.success) return null;
  const d = parsed.data;
  const repo = d.repository?.full_name ?? "unknown";
  const branch = d.ref ? branchFromRef(d.ref) : "?";
  const pusher = d.pusher?.name ?? d.sender?.login ?? "someone";
  const commits = d.commits ?? [];
  const n = commits.length;

  const lines = commits.slice(0, MAX_COMMITS).map((c) => {
    const sha = (c.id ?? "").slice(0, 7);
    const msg = firstLine(c.message ?? "");
    const author = c.author?.username ?? c.author?.name ?? pusher;
    return `\`${sha}\` ${msg} — ${author}`;
  });
  if (n > MAX_COMMITS) lines.push(`…and ${n - MAX_COMMITS} more`);
  const description = lines.length > 0 ? lines.join("\n") : `Pushed by ${pusher}`;

  return {
    title: clamp(`[${repo}:${branch}] ${n} new commit${n === 1 ? "" : "s"}`, MAX_TITLE),
    url: httpUrl(d.compare),
    description: clamp(description, MAX_DESC),
    color: COLOR_PUSH,
  };
}

const PrSchema = z.object({
  action: z.string().optional(),
  number: z.number().optional(),
  pull_request: z
    .object({
      title: z.string().optional(),
      html_url: z.string().optional(),
      merged: z.boolean().optional(),
      number: z.number().optional(),
      user: z.object({ login: z.string().optional() }).optional(),
    })
    .optional(),
  repository: z.object({ full_name: z.string().optional() }).optional(),
  sender: z.object({ login: z.string().optional() }).optional(),
});

function buildPullRequest(payload: unknown): DiscordEmbed | null {
  const parsed = PrSchema.safeParse(payload);
  if (!parsed.success) return null;
  const d = parsed.data;
  const rawAction = d.action ?? "";
  if (!PR_ACTIONS.has(rawAction)) return null;

  const pr = d.pull_request;
  const repo = d.repository?.full_name ?? "unknown";
  const num = d.number ?? pr?.number;
  const merged = pr?.merged === true;
  const action = rawAction === "closed" && merged ? "merged" : rawAction;
  const actor = pr?.user?.login ?? d.sender?.login ?? "someone";
  const color =
    action === "merged"
      ? COLOR_PR_MERGED
      : action === "closed"
        ? COLOR_PR_CLOSED
        : COLOR_PR_OPEN;

  return {
    title: clamp(`[${repo}] PR #${num ?? "?"} ${action}: ${pr?.title ?? ""}`.trim(), MAX_TITLE),
    url: httpUrl(pr?.html_url),
    description: `by ${actor}`,
    color,
  };
}

const IssuesSchema = z.object({
  action: z.string().optional(),
  issue: z
    .object({
      title: z.string().optional(),
      html_url: z.string().optional(),
      number: z.number().optional(),
      user: z.object({ login: z.string().optional() }).optional(),
    })
    .optional(),
  repository: z.object({ full_name: z.string().optional() }).optional(),
  sender: z.object({ login: z.string().optional() }).optional(),
});

function buildIssues(payload: unknown): DiscordEmbed | null {
  const parsed = IssuesSchema.safeParse(payload);
  if (!parsed.success) return null;
  const d = parsed.data;
  const action = d.action ?? "";
  if (!ISSUE_ACTIONS.has(action)) return null;

  const issue = d.issue;
  const repo = d.repository?.full_name ?? "unknown";
  const actor = issue?.user?.login ?? d.sender?.login ?? "someone";

  return {
    title: clamp(
      `[${repo}] Issue #${issue?.number ?? "?"} ${action}: ${issue?.title ?? ""}`.trim(),
      MAX_TITLE,
    ),
    url: httpUrl(issue?.html_url),
    description: `by ${actor}`,
    color: COLOR_ISSUE,
  };
}

// Returns null for events/actions we don't forward (ping, unsupported types,
// low-signal PR/issue actions); the route turns null into a 204.
export function buildEmbed(event: string, payload: unknown): DiscordEmbed | null {
  switch (event) {
    case "push":
      return buildPush(payload);
    case "pull_request":
      return buildPullRequest(payload);
    case "issues":
      return buildIssues(payload);
    default:
      return null;
  }
}
