import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { RoomInput } from "./RoomInput.js";

describe("RoomInput", () => {
  beforeEach(() => useStore.getState().reset());

  it("renders the prompt", () => {
    const { lastFrame } = render(<RoomInput />);
    expect(lastFrame()).toContain("Room name");
  });

  it("commits the typed name on Enter and advances screen", () => {
    const { stdin } = render(<RoomInput />);
    stdin.write("lobby");
    stdin.write("\r"); // Enter
    expect(useStore.getState().roomName).toBe("lobby");
    expect(useStore.getState().screen).toBe("identity_select");
  });

  it("ignores empty submissions", () => {
    const { stdin } = render(<RoomInput />);
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("room_input");
  });
});
