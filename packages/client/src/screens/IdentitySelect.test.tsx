import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { useStore } from "../store.js";
import { loadAnon } from "../auth/anon.js";
import { IdentitySelect } from "./IdentitySelect.js";

// Stub loadAnon so the saved-identity branch is driven by the test, not by the
// host's real ~/.pantry/anon.json (which otherwise makes "anon → chat" leak in
// on any machine that has used pantry).
vi.mock("../auth/anon.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/anon.js")>()),
  loadAnon: vi.fn(),
}));
const mockLoadAnon = vi.mocked(loadAnon);

// Wait for ink's useEffect-based useInput hook to register stdin listeners.
async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

describe("IdentitySelect", () => {
  beforeEach(() => {
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    mockLoadAnon.mockReset();
    mockLoadAnon.mockResolvedValue(null);
  });

  it("renders four options", () => {
    const { lastFrame } = render(<IdentitySelect />);
    expect(lastFrame()).toContain("Anonymous");
    expect(lastFrame()).toContain("GitHub");
    expect(lastFrame()).toContain("Google");
    expect(lastFrame()).toContain("Discord");
  });

  it("selecting Anonymous with no saved identity advances to nickname_input", async () => {
    mockLoadAnon.mockResolvedValue(null);
    const { stdin } = render(<IdentitySelect />);
    await flush();
    stdin.write("\r"); // first option preselected; Enter selects it
    await flush();
    expect(useStore.getState().screen).toBe("nickname_input");
  });

  it("selecting Anonymous with a saved identity continues straight to chat", async () => {
    mockLoadAnon.mockResolvedValue({ subject: "anon:test-uuid", nickname: "Saved" });
    const { stdin } = render(<IdentitySelect />);
    await flush();
    stdin.write("\r");
    await flush();
    expect(useStore.getState().screen).toBe("chat");
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("anon");
    if (id?.kind === "anon") {
      expect(id.nickname).toBe("Saved");
      expect(id.subject).toBe("anon:test-uuid");
    }
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
