import { describe, it, expect } from "vitest";
import { buildAnthropicMessages, shouldTriggerNpc } from "./brain.js";
import type { TranscriptEntry } from "./state.js";

function p(label: string, body: string, at = 0): TranscriptEntry {
  return { role: "player", authorLabel: label, body, at };
}
function n(label: string, body: string, at = 0): TranscriptEntry {
  return { role: "npc", authorLabel: label, body, at };
}

describe("buildAnthropicMessages", () => {
  it("single player message → one user message", () => {
    const out = buildAnthropicMessages([], p("alice#ab12", "我推開門"));
    expect(out).toEqual([{ role: "user", content: "alice#ab12: 我推開門" }]);
  });

  it("alternating turns yield strictly alternating user/assistant messages", () => {
    const transcript = [
      p("alice#ab12", "@灰袍旅人 你好", 1),
      n("灰袍旅人#wx99", "*抬眼* 客人。", 2),
    ];
    const current = p("alice#ab12", "有酒嗎", 3);
    const out = buildAnthropicMessages(transcript, current);
    expect(out).toEqual([
      { role: "user", content: "alice#ab12: @灰袍旅人 你好" },
      { role: "assistant", content: "*抬眼* 客人。" },
      { role: "user", content: "alice#ab12: 有酒嗎" },
    ]);
  });

  it("consecutive player messages between NPC responses are merged into one user message", () => {
    const transcript = [
      p("alice#ab12", "進酒館", 1),
      p("bob#cd34", "我跟著進去", 2),
      p("alice#ab12", "@灰袍旅人 有酒嗎", 3),
    ];
    const current = n("灰袍旅人#wx99", "*點頭*", 4);
    // builds messages from transcript+current; only the input is grouped
    const out = buildAnthropicMessages(transcript.slice(0, -1), transcript[2]!);
    expect(out).toEqual([
      {
        role: "user",
        content:
          "alice#ab12: 進酒館\nbob#cd34: 我跟著進去\nalice#ab12: @灰袍旅人 有酒嗎",
      },
    ]);
  });

  it("consecutive NPC turns (rare) are merged into one assistant message", () => {
    const transcript = [
      p("alice#ab12", "?", 1),
      n("灰袍旅人#wx99", "嗯。", 2),
      n("灰袍旅人#wx99", "*繼續沉默*", 3),
    ];
    const current = p("alice#ab12", "你說啊", 4);
    const out = buildAnthropicMessages(transcript, current);
    expect(out).toEqual([
      { role: "user", content: "alice#ab12: ?" },
      { role: "assistant", content: "嗯。\n*繼續沉默*" },
      { role: "user", content: "alice#ab12: 你說啊" },
    ]);
  });
});

describe("shouldTriggerNpc", () => {
  it("triggers on bare name mention", () => {
    expect(shouldTriggerNpc("灰袍旅人 你好")).toBe(true);
  });

  it("triggers on @-mention form", () => {
    expect(shouldTriggerNpc("@灰袍旅人 在嗎")).toBe(true);
  });

  it("does not trigger on unrelated chitchat", () => {
    expect(shouldTriggerNpc("我們去探險吧")).toBe(false);
  });

  it("does not trigger on partial-name fragments", () => {
    // "灰袍" alone shouldn't trigger; full name "灰袍旅人" required
    expect(shouldTriggerNpc("灰袍披風的人")).toBe(false);
  });
});
