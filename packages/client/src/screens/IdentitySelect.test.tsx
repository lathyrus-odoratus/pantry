import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { IdentitySelect } from "./IdentitySelect.js";

// Wait for ink's useEffect-based useInput hook to register stdin listeners.
async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

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

  it("selecting Anonymous advances to nickname_input", async () => {
    const { stdin } = render(<IdentitySelect />);
    await flush();
    stdin.write("\r"); // first option preselected; Enter selects it
    await flush();
    expect(useStore.getState().screen).toBe("nickname_input");
  });

  it("selecting GitHub stages pending oauth identity and advances", async () => {
    const { stdin } = render(<IdentitySelect />);
    await flush();
    stdin.write("\x1b[B"); // down arrow: full ESC sequence
    await flush();
    stdin.write("\r");
    await flush();
    expect(useStore.getState().screen).toBe("oauth_waiting");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("oauth");
    if (id?.kind === "oauth") expect(id.provider).toBe("github");
  });
});
