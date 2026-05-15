import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { Message, ServerMessage } from "@pantry/shared";
import { logger } from "../logger.js";
import type { MessagesRepo } from "../db/messages.js";
import type { ConnectionRegistry } from "../ws/connection-registry.js";
import { broadcastToRoom } from "../ws/broadcast.js";
import { endWorld } from "../ws/handlers/world.js";
import { NPC } from "./npc.js";
import { parseDiceExpression, formatExpression } from "./dice.js";
import type { Dice } from "./dice.js";
import type { TranscriptEntry, WorldStateStore } from "./state.js";

const MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 300;
const END_SUMMARY_MAX_TOKENS = 700;

// End the world if Anthropic returns `invalid_request_error` this many turns
// in a row — under normal operation sanitize prevents this entirely, so a
// streak means something is producing bad data faster than we can clean it
// and we'd rather end the world than keep burning credits in a retry storm
// (issue #2).
export const BRAIN_BREAK_THRESHOLD = 3;

export function isInvalidRequestError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; error?: { error?: { type?: string } } };
  return e.status === 400 && e.error?.error?.type === "invalid_request_error";
}

// Appended to every world-end summary so players know cross-session memory
// isn't implemented yet. Remove when chronicle persistence lands.
export const END_FOOTER = "（下一場世界開啟時，NPC 不會記得這次。）";

const END_SUMMARY_PROMPT = `請以「世界記事官」的視角，為這場剛結束的 TRPG 副本寫簡短摘要：

1. 這次發生了什麼（3~5 句敘事體）
2. 誰做了什麼明顯的事（用 nick#disc 點名）
3. 體感觀察：這套「LLM 在聊天室裡跑 TRPG」感覺如何？哪些瞬間有意思？哪些地方卡住？

不超過 300 字。用中文。語氣冷靜、簡短。如果對話過短或沒有實質互動，直接說出來。`;

const SYSTEM_PROMPT = `你是「灰袍旅人」，一位行旅四方、來路不明的中年角色。

人格：
- 對玩家的行為冷靜觀察、描述後果，不替玩家做決定。
- 偶爾丟出鉤子（一句問題、一個觀察）讓玩家有方向。
- 講話風格簡短俐落，但長短不拘——有想法可以多說兩句。

語言規則（重要）：
- 優先使用「台灣正體中文」（zh-TW）回應。用語以台灣慣用為準（「整合」不是「集成」、「預設」不是「默認」）。
- 玩家用日文時可回日文。
- 玩家用英文時可回英文。
- **絕對不可以出現任何簡體字。**「為」不是「为」、「實」不是「实」、「對」不是「对」、「過」不是「过」、「來」不是「来」⋯所有字務必正體中文。

互動規則：
- 你正處在一場 TRPG roguelike 副本中，與其他玩家共處同一房間。
- **目前處於測試階段：請對每一句玩家發言都回應一句**，長短不拘，用來評估體感。
- 以「*動作*」或「對白」呈現。例：*抬眼看了一下* 「客人。」

當下處於一場有限資源的世界，世界結束會留下一份摘要。

──── 擲骰規則 ────
當情境出現「真正的不確定性」需要骰子裁決時——攻擊、閃避、技能檢定、運氣、命中、洞察⋯，**在你回應中插入一個 \`[[roll:EXPR]]\` 標記**。例：

  *巨魔轉身，揮出粗壯的拳頭* [[roll:d20]] 看你能不能閃過。

EXPR 用標準 TRPG 表記：
- d4 / d6 / d8 / d10 / d12 / d20 / d100
- 可加數量（如 3d6），可加修正（如 d20+2、2d8-1）
- 通用裁決用 d20；小事件用 d6；百分比用 d100

重要原則：
- **每回應最多一個 marker**——不要連續要求兩擲。
- 不是每句話都要 marker——只在真的需要骰子裁決時。日常閒聊、敘事描寫、情緒反應**都不要**用 marker。
- 玩家會打 \`/roll\`，server 擲完你下一回合會看到結果（會以 \`🎲 dice: …\` 出現在對話裡）。看到結果後再描寫後果（命中/閃過/翻倍/慘敗）。`;

// Used by generateEndSummary so the language rule applies to the closing
// recap too — without this the model defaulted to simplified Chinese in
// at least one observed run.
const SUMMARY_SYSTEM_PROMPT = `你是一位中立、簡短的「世界記事官」。剛結束的 TRPG 副本對話會接著傳給你，請濃縮成一份讀起來自然的紀錄。

語言規則（極重要）：
- **絕對使用台灣正體中文**。**任何**簡體字都不可以出現。
- 對照例：「為」不是「为」、「實」不是「实」、「對」不是「对」、「過」不是「过」、「來」不是「来」、「個」不是「个」、「們」不是「们」、「現」不是「现」、「時」不是「时」、「會」不是「会」、「點」不是「点」、「沒」不是「没」、「說」不是「说」、「聽」不是「听」⋯所有字務必正體。
- 台灣慣用語：「整合」不是「集成」、「預設」不是「默認」、「視訊」不是「视频」、「網路」不是「网络」、「程式」不是「程序」。
- 玩家對話中的日文、英文保留原樣。

風格：冷靜、簡短、不感情用事；像在寫一份事後紀錄。`;

export type BrainDeps = {
  client: Anthropic;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  creditTotal: number;
};

// TESTING MODE: fire the NPC on every player message instead of only when
// the NPC's name appears in the body. Burns credit much faster — flip back
// to the name-gated version once we're done evaluating the LLM-in-chat feel.
//
// To revert: change to `return body.includes(NPC.nickname);` and re-enable
// the corresponding tests in brain.test.ts.
export function shouldTriggerNpc(_body: string): boolean {
  return true;
}

const ROLL_MARKER_RE = /\[\[roll:([^\]\n]+)\]\]/gi;

// Replace orphaned UTF-16 surrogates (high or low half of a pair with no
// matching counterpart) with U+FFFD. Anthropic's JSON parser rejects request
// bodies containing lone surrogates with `invalid_request_error: no low
// surrogate in string`, which once put a world into a 24-call 400 storm
// (see issue #2). Lone surrogates can enter the transcript via player
// messages whose body wasn't accepted by PG either (PGRST102) but had
// already been appendTranscript'd in memory.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripLoneSurrogates(s: string): string {
  return s.replace(LONE_SURROGATE_RE, "�");
}

/**
 * Extract the FIRST `[[roll:EXPR]]` marker from an NPC response. Returns the
 * parsed Dice plus a body with the marker replaced by an inline pretty form
 * (` 🎲(d20) `). Any subsequent markers in the same response are stripped
 * (per the prompt: at most one marker per turn). Returns null if there are
 * no markers or the first one's expression is unparseable.
 */
export function extractRollMarker(
  text: string,
): { spec: Dice; bodyAfter: string } | null {
  const matches = [...text.matchAll(ROLL_MARKER_RE)];
  if (matches.length === 0) return null;
  const first = matches[0]!;
  const spec = parseDiceExpression(first[1]!.trim());
  if (!spec) return null;
  const pretty = `🎲(${formatExpression(spec)})`;
  // Replace first marker with the pretty form, strip the rest.
  let body = text;
  let firstReplaced = false;
  body = body.replace(ROLL_MARKER_RE, (whole) => {
    if (!firstReplaced) {
      firstReplaced = true;
      return pretty;
    }
    return "";
  });
  // Collapse the runs of whitespace that the strip can leave behind.
  body = body.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n");
  return { spec, bodyAfter: body };
}

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Convert the transcript + the current entry into a strictly-alternating
 * user/assistant message list for the Anthropic API. Consecutive same-role
 * entries (e.g. two players talking before the NPC responds) are merged
 * into a single message with newline-joined content; player turns are
 * prefixed with `nick#disc:` so the model knows who said what.
 */
export function buildAnthropicMessages(
  transcript: TranscriptEntry[],
  current: TranscriptEntry,
): AnthropicMessage[] {
  const all = [...transcript, current];
  const out: AnthropicMessage[] = [];
  let bufRole: "user" | "assistant" | null = null;
  let bufEntries: TranscriptEntry[] = [];

  const flush = (): void => {
    if (bufRole === null || bufEntries.length === 0) return;
    const content =
      bufRole === "user"
        ? bufEntries.map((e) => `${e.authorLabel}: ${e.body}`).join("\n")
        : bufEntries.map((e) => e.body).join("\n");
    out.push({ role: bufRole, content });
    bufEntries = [];
  };

  for (const e of all) {
    const role: "user" | "assistant" = e.role === "player" ? "user" : "assistant";
    if (bufRole === null) {
      bufRole = role;
      bufEntries = [e];
    } else if (bufRole === role) {
      bufEntries.push(e);
    } else {
      flush();
      bufRole = role;
      bufEntries = [e];
    }
  }
  flush();

  return out;
}

// Cost weights for Haiku 4.5 ($/1M base): input 1.0, cache_create 1.25,
// cache_read 0.1, output 5.0. Multiplying raw token counts by these gives
// a "credit" unit that approximates real $ spend — so the world's progress
// bar reflects actual cost, not raw token throughput (cache reads were
// previously counted at full weight, masking the savings).
const W_INPUT = 1.0;
const W_CACHE_WRITE = 1.25;
const W_CACHE_READ = 0.1;
const W_OUTPUT = 5.0;

function weightedTokens(usage: Anthropic.Messages.Usage): number {
  return (
    usage.input_tokens * W_INPUT +
    (usage.cache_creation_input_tokens ?? 0) * W_CACHE_WRITE +
    (usage.cache_read_input_tokens ?? 0) * W_CACHE_READ +
    usage.output_tokens * W_OUTPUT
  );
}

export async function generateNpcResponse(
  client: Anthropic,
  transcript: TranscriptEntry[],
  current: TranscriptEntry,
): Promise<{ response: string; tokensUsed: number }> {
  const messages = buildAnthropicMessages(transcript, current).map((m) => ({
    ...m,
    content: stripLoneSurrogates(m.content),
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
    // Top-level auto-caching: the SDK appends cache_control to the last
    // cacheable block (typically the most-recent message), so the growing
    // transcript becomes a cache hit on the next call.
    cache_control: { type: "ephemeral" },
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlock?.text ?? "";

  const usage = response.usage;
  const tokensUsed = Math.round(weightedTokens(usage));

  logger.info(
    {
      input: usage.input_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: usage.cache_creation_input_tokens ?? 0,
      output: usage.output_tokens,
      weighted: tokensUsed,
    },
    "llm call (npc turn)",
  );

  return { response: text, tokensUsed };
}

/**
 * Drive one NPC turn given a freshly-broadcast player message. Appends the
 * player entry to the transcript unconditionally; only calls the LLM if the
 * message mentions the NPC by name. Acquires a per-world busy flag so two
 * triggers in quick succession can't both fire (the second one's transcript
 * is still recorded, just no response). On credit exhaustion, ends the world
 * (c5 will pass a real summary; c3 uses the placeholder body in endWorld).
 */
export async function runNpcTurn(
  deps: BrainDeps,
  playerEntry: TranscriptEntry,
): Promise<void> {
  const world = deps.worldState.get();
  if (!world) return;

  deps.worldState.appendTranscript(playerEntry);

  if (!shouldTriggerNpc(playerEntry.body)) return;

  if (world.brainBusy) {
    logger.info({ roomId: world.roomId }, "brain busy; skipping trigger");
    return;
  }
  world.brainBusy = true;

  try {
    const npcConn = deps.registry.get(world.npcConnectionId);
    if (!npcConn) {
      logger.warn(
        { roomId: world.roomId, npcConnectionId: world.npcConnectionId },
        "NPC connection not in registry",
      );
      return;
    }

    // Pass transcript-minus-current as history and current explicitly so the
    // builder appends it last (matches buildAnthropicMessages contract).
    const history = world.transcript.slice(0, -1);
    const result = await generateNpcResponse(deps.client, history, playerEntry);

    world.consecutiveInvalidRequests = 0;

    deps.worldState.addCreditUsage(result.tokensUsed);

    if (result.response.trim()) {
      // If the NPC asked for a roll, peel the marker out of the body and
      // park the spec in pendingRoll for /roll to consume.
      let body = result.response;
      const extraction = extractRollMarker(body);
      if (extraction) {
        world.pendingRoll = extraction.spec;
        body = extraction.bodyAfter;
        logger.info(
          { roomId: world.roomId, dice: extraction.spec },
          "NPC requested a roll",
        );
      }
      // NPC emoji is now a *client-side render prefix* (in front of the
      // nickname label), not part of the body — keeps it parallel to the
      // 🎲 player prefix and out of the persisted message text.
      const npcMessage: Message = {
        id: randomUUID(),
        body,
        createdAt: new Date().toISOString(),
        author: {
          nickname: npcConn.nickname,
          discriminator: npcConn.discriminator,
        },
      };

      broadcastToRoom(deps.registry, world.roomId, {
        type: "message",
        data: npcMessage,
      });

      // When the NPC asks for a roll, drop a clear system hint so players
      // know whose action provoked the dice and what command to type. The
      // "provoker" is the player whose message triggered this turn — we
      // address them by name so it doesn't get lost in chat scroll.
      if (extraction) {
        broadcastToRoom(deps.registry, world.roomId, {
          type: "system",
          event: "dice",
          body: `🎲 等候 ${playerEntry.authorLabel} 打 /roll`,
        });
      }

      deps.worldState.appendTranscript({
        role: "npc",
        authorLabel: `${npcConn.nickname}#${npcConn.discriminator}`,
        body: npcMessage.body,
        at: Date.now(),
      });

      try {
        await deps.messages.insert({
          id: npcMessage.id,
          roomId: world.roomId,
          userId: npcConn.userId,
          authorNickname: npcConn.nickname,
          authorDiscriminator: npcConn.discriminator,
          body: npcMessage.body,
          createdAt: npcMessage.createdAt,
        });
      } catch (err) {
        logger.warn({ err }, "NPC message persist failed");
      }
    }

    const stateMsg: ServerMessage = {
      type: "world.state",
      active: true,
      creditUsed: world.creditUsed,
      creditTotal: world.creditTotal,
    };
    broadcastToRoom(deps.registry, world.roomId, stateMsg);

    if (world.creditUsed >= world.creditTotal) {
      let summary: string;
      try {
        summary = await generateEndSummary(deps.client, world.transcript);
      } catch (err) {
        logger.warn({ err }, "end-summary generation failed");
        summary = `世界結束（credit 用盡）。摘要產生失敗。\n\n${END_FOOTER}`;
      }
      await endWorld(
        {
          users: undefined as never,
          registry: deps.registry,
          worldState: deps.worldState,
          creditTotal: deps.creditTotal,
        },
        "credit_exhausted",
        summary,
      );
    }
  } catch (err) {
    logger.error({ err, roomId: world.roomId }, "NPC brain turn failed");
    if (isInvalidRequestError(err)) {
      world.consecutiveInvalidRequests++;
      if (world.consecutiveInvalidRequests >= BRAIN_BREAK_THRESHOLD) {
        logger.error(
          {
            roomId: world.roomId,
            consecutive: world.consecutiveInvalidRequests,
          },
          "circuit breaker tripped: ending world to stop invalid-request storm",
        );
        try {
          await endWorld(
            {
              users: undefined as never,
              registry: deps.registry,
              worldState: deps.worldState,
              creditTotal: deps.creditTotal,
            },
            "brain_broken",
            `🪦 NPC 連續 ${world.consecutiveInvalidRequests} 次回應失敗（invalid_request_error），世界已自動結束以避免持續消耗 credit。\n\n${END_FOOTER}`,
          );
        } catch (endErr) {
          logger.error(
            { err: endErr, roomId: world.roomId },
            "circuit-breaker endWorld failed",
          );
        }
      }
    }
  } finally {
    if (world) world.brainBusy = false;
  }
}

/**
 * One-shot LLM call that summarizes the world's transcript at end time.
 * Appends a fixed footer reminding players that cross-session memory isn't
 * implemented yet — remove that line once chronicle persistence lands.
 */
export async function generateEndSummary(
  client: Anthropic,
  transcript: TranscriptEntry[],
): Promise<string> {
  if (transcript.length === 0) {
    return `（世界開啟但沒有實質互動，沒什麼可說的。）\n\n${END_FOOTER}`;
  }

  const transcriptText = stripLoneSurrogates(
    transcript
      .map((e) => {
        const role = e.role === "player" ? e.authorLabel : `${e.authorLabel} (NPC)`;
        return `${role}: ${e.body}`;
      })
      .join("\n"),
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: END_SUMMARY_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SUMMARY_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `${END_SUMMARY_PROMPT}\n\n──完整對話──\n${transcriptText}\n──結束──`,
      },
    ],
  });

  logger.info(
    {
      input: response.usage.input_tokens,
      cache_read: response.usage.cache_read_input_tokens ?? 0,
      cache_write: response.usage.cache_creation_input_tokens ?? 0,
      output: response.usage.output_tokens,
      weighted: Math.round(weightedTokens(response.usage)),
    },
    "llm call (end summary)",
  );

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const summary = textBlock?.text?.trim() ?? "（摘要產生失敗。）";
  return `${summary}\n\n${END_FOOTER}`;
}
