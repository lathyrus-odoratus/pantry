import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { IdentitySelect } from "./IdentitySelect.js";

describe("IdentitySelect", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
  });

  it("renders four options", () => {
    const { lastFrame } = render(<IdentitySelect />);
    expect(lastFrame()).toContain("Anonymous");
    expect(lastFrame()).toContain("GitHub");
    expect(lastFrame()).toContain("Google");
    expect(lastFrame()).toContain("Discord");
  });

  it("selecting Anonymous advances to nickname_input", () => {
    const { stdin } = render(<IdentitySelect />);
    // first option is preselected; Enter chooses it
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("nickname_input");
  });

  it("selecting GitHub stages pending oauth identity and advances", () => {
    const { stdin } = render(<IdentitySelect />);
    stdin.write("[B"); // down arrow
    stdin.write("\r");
    expect(useStore.getState().screen).toBe("oauth_waiting");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("oauth");
    if (id?.kind === "oauth") expect(id.provider).toBe("github");
  });
});
