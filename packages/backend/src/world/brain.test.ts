import { describe, it, expect } from "vitest";
import {
  buildAnthropicMessages,
  shouldTriggerNpc,
  extractRollMarker,
  stripLoneSurrogates,
  isInvalidRequestError,
} from "./brain.js";
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

describe("stripLoneSurrogates", () => {
  it("passes through plain ASCII", () => {
    expect(stripLoneSurrogates("hello")).toBe("hello");
  });

  it("passes through CJK BMP characters", () => {
    expect(stripLoneSurrogates("灰袍旅人")).toBe("灰袍旅人");
  });

  it("passes through complete surrogate pairs (emoji)", () => {
    expect(stripLoneSurrogates("🎲 d20")).toBe("🎲 d20");
    expect(stripLoneSurrogates("🏂")).toBe("🏂");
  });

  it("replaces a lone high surrogate with U+FFFD", () => {
    const bad = `pre${String.fromCharCode(0xd83c)}post`;
    expect(stripLoneSurrogates(bad)).toBe("pre�post");
  });

  it("replaces a lone low surrogate with U+FFFD", () => {
    const bad = `pre${String.fromCharCode(0xdfb2)}post`;
    expect(stripLoneSurrogates(bad)).toBe("pre�post");
  });

  it("replaces split surrogates from a truncated emoji", () => {
    // 🏂 = U+1F3C2 = surrogate pair (D83C DFC2). Take only the high half.
    const truncated = "name" + String.fromCharCode(0xd83c);
    expect(stripLoneSurrogates(truncated)).toBe("name�");
  });

  it("leaves valid output safe for JSON.stringify (no lone-surrogate escapes)", () => {
    const bad = `a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xdfff)}c`;
    const cleaned = stripLoneSurrogates(bad);
    const json = JSON.stringify(cleaned);
    expect(json).not.toMatch(/\\u[dD][89aAbB][0-9a-fA-F]{2}/);
    expect(json).not.toMatch(/\\u[dD][c-fC-F][0-9a-fA-F]{2}/);
  });
});

describe("isInvalidRequestError", () => {
  it("returns true for Anthropic 400 invalid_request_error shape", () => {
    const err = {
      status: 400,
      error: { type: "error", error: { type: "invalid_request_error", message: "..." } },
    };
    expect(isInvalidRequestError(err)).toBe(true);
  });

  it("returns false for a 400 with a different error.type", () => {
    const err = {
      status: 400,
      error: { type: "error", error: { type: "overloaded_error" } },
    };
    expect(isInvalidRequestError(err)).toBe(false);
  });

  it("returns false for a 429 / 5xx", () => {
    expect(
      isInvalidRequestError({
        status: 429,
        error: { error: { type: "invalid_request_error" } },
      }),
    ).toBe(false);
  });

  it("returns false for plain JS errors and null/undefined", () => {
    expect(isInvalidRequestError(new Error("boom"))).toBe(false);
    expect(isInvalidRequestError(null)).toBe(false);
    expect(isInvalidRequestError(undefined)).toBe(false);
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
