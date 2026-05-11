import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { NicknameInput } from "./NicknameInput.js";

describe("NicknameInput", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    useStore.getState().setScreen("nickname_input");
  });

  it("renders prompt", () => {
    const { lastFrame } = render(<NicknameInput />);
    expect(lastFrame()).toMatch(/Nickname/i);
  });

  it("stores anon identity on submit and advances to chat", () => {
    const { stdin } = render(<NicknameInput />);
    stdin.write("Alice");
    stdin.write("\r");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("anon");
    if (id?.kind === "anon") expect(id.nickname).toBe("Alice");
    expect(useStore.getState().screen).toBe("chat");
  });

  it("ignores empty submission", () => {
    const { stdin } = render(<NicknameInput />);
    stdin.write("\r");
    expect(useStore.getState().pendingIdentity).toBeNull();
  });
});
