import { describe, it, expect } from "vitest";
import { buildAnthropicMessages, shouldTriggerNpc, extractRollMarker } from "./brain.js";
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

describe("extractRollMarker", () => {
  it("returns null when no marker is present", () => {
    expect(extractRollMarker("*點點頭* 客人。")).toBeNull();
  });

  it("returns null for an unparseable expression", () => {
    expect(extractRollMarker("試試 [[roll:d7]] 看看")).toBeNull();
  });

  it("extracts a d20 spec and replaces the marker with 🎲(d20) inline", () => {
    const out = extractRollMarker("*揮拳* [[roll:d20]] 看你能不能閃過。");
    expect(out).not.toBeNull();
    expect(out!.spec).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(out!.bodyAfter).toBe("*揮拳* 🎲(d20) 看你能不能閃過。");
  });

  it("extracts a complex spec (3d6+2) and pretty-prints it", () => {
    const out = extractRollMarker("[[roll:3d6+2]] 看傷害");
    expect(out).not.toBeNull();
    expect(out!.spec).toEqual({ count: 3, sides: 6, modifier: 2 });
    expect(out!.bodyAfter).toBe("🎲(3d6+2) 看傷害");
  });

  it("keeps only the first marker; strips any subsequent ones", () => {
    const out = extractRollMarker(
      "先 [[roll:d20]] 看命中再 [[roll:2d6]] 看傷害",
    );
    expect(out).not.toBeNull();
    expect(out!.spec).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(out!.bodyAfter).toBe("先 🎲(d20) 看命中再 看傷害");
  });

  it("is case-insensitive on the roll keyword", () => {
    const out = extractRollMarker("[[ROLL:d10]] OK");
    expect(out!.spec.sides).toBe(10);
  });
});

describe("shouldTriggerNpc (testing mode — always returns true)", () => {
  // The codebase is currently in testing mode (every player message fires the
  // NPC). When name-gating is restored, swap these for the original assertions
  // (trigger on "灰袍旅人" mention, not on unrelated chitchat).
  it("triggers on bare name mention", () => {
    expect(shouldTriggerNpc("灰袍旅人 你好")).toBe(true);
  });

  it("triggers on @-mention form", () => {
    expect(shouldTriggerNpc("@灰袍旅人 在嗎")).toBe(true);
  });

  it("triggers on chitchat (testing mode)", () => {
    expect(shouldTriggerNpc("我們去探險吧")).toBe(true);
  });

  it("triggers on partial-name fragments (testing mode)", () => {
    expect(shouldTriggerNpc("灰袍披風的人")).toBe(true);
  });
});
