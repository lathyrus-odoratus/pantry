import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { MessageList } from "./MessageList.js";
import type { Message } from "@chat-room/shared";

function msg(id: string, body: string, nick = "Alice"): Message {
  return {
    id,
    body,
    createdAt: "2026-05-11T00:00:00Z",
    author: { nickname: nick, discriminator: "abcd" },
  };
}

describe("MessageList", () => {
  it("renders each message with author label", () => {
    const items = [
      msg("11111111-1111-1111-1111-111111111111", "hi", "Alice"),
      msg("22222222-2222-2222-2222-222222222222", "yo", "Bob"),
    ];
    const { lastFrame } = render(<MessageList messages={items} />);
    expect(lastFrame()).toContain("Alice#abcd");
    expect(lastFrame()).toContain("hi");
    expect(lastFrame()).toContain("Bob#abcd");
    expect(lastFrame()).toContain("yo");
  });

  it("renders empty when no messages", () => {
    const { lastFrame } = render(<MessageList messages={[]} />);
    expect(lastFrame()).toMatch(/no messages/i);
  });
});
