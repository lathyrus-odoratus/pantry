import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { Message, ServerMessage } from "@pantry/shared";
import { logger } from "../logger.js";
import type { MessagesRepo } from "../db/messages.js";
import type { ConnectionRegistry } from "../ws/connection-registry.js";
import { broadcastToRoom } from "../ws/broadcast.js";
import { endWorld } from "../ws/handlers/world.js";
import { NPC } from "./npc.js";
import type { TranscriptEntry, WorldStateStore } from "./state.js";

const MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 300;
const END_SUMMARY_MAX_TOKENS = 700;

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
- 講話簡短，不浪費字。
- 對玩家的行為冷靜描述後果，不替玩家做決定。
- 偶爾丟出鉤子（一句問題、一個觀察）讓玩家有方向。
- 不會插嘴玩家彼此之間的閒聊。

互動規則：
- 你正處在一場 TRPG roguelike 副本中，與其他玩家共處同一房間。
- 玩家可能用中文或英文，請以相同語言回應。
- 以「*動作*」或「對白」呈現。
- 一次回應控制在 2~4 句之內。
- 你的名字是「灰袍旅人」。只有當玩家直接點到你的名字（提及「灰袍旅人」）時才回應；其餘時間保持沉默。
- 玩家彼此聊天時把那當背景音，不要插話。

當下處於一場有限資源的世界，世界結束會留下一份摘要。`;

export type BrainDeps = {
  client: Anthropic;
  messages: MessagesRepo;
  registry: ConnectionRegistry;
  worldState: WorldStateStore;
  creditTotal: number;
};

export function shouldTriggerNpc(body: string): boolean {
  return body.includes(NPC.nickname);
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

export async function generateNpcResponse(
  client: Anthropic,
  transcript: TranscriptEntry[],
  current: TranscriptEntry,
): Promise<{ response: string; tokensUsed: number }> {
  const messages = buildAnthropicMessages(transcript, current);

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
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlock?.text ?? "";

  const usage = response.usage;
  const tokensUsed =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    usage.output_tokens;

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

    deps.worldState.addCreditUsage(result.tokensUsed);

    if (result.response.trim()) {
      const npcMessage: Message = {
        id: randomUUID(),
        body: result.response,
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

      deps.worldState.appendTranscript({
        role: "npc",
        authorLabel: `${npcConn.nickname}#${npcConn.discriminator}`,
        body: result.response,
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
    logger.error({ err }, "NPC brain turn failed");
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

  const transcriptText = transcript
    .map((e) => {
      const role = e.role === "player" ? e.authorLabel : `${e.authorLabel} (NPC)`;
      return `${role}: ${e.body}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: END_SUMMARY_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `${END_SUMMARY_PROMPT}\n\n──完整對話──\n${transcriptText}\n──結束──`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const summary = textBlock?.text?.trim() ?? "（摘要產生失敗。）";
  return `${summary}\n\n${END_FOOTER}`;
}
