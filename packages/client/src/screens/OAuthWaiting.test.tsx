import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { useStore } from "../store.js";
import { OAuthWaiting } from "./OAuthWaiting.js";
import * as oauth from "../auth/oauth.js";

// vi.mock is hoisted and intercepts the module before OAuthWaiting imports it,
// ensuring runOAuthFlow inside the component is the mocked version.
vi.mock("../auth/oauth.js", () => ({
  runOAuthFlow: vi.fn(),
}));

describe("OAuthWaiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.getState().reset();
    useStore.getState().commitRoomName("lobby");
    useStore.getState().setPendingIdentity({
      kind: "oauth",
      provider: "github",
      token: "",
    });
    useStore.getState().setScreen("oauth_waiting");
    vi.mocked(oauth.runOAuthFlow).mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // Helper: trigger React's useEffect by running the scheduler and unmounting.
  // Unmounting causes React to flush pending passive effects before teardown.
  // Then we flush promise microtasks so async mock results propagate.
  async function triggerAndFlush(): Promise<void> {
    vi.runAllTimers(); // fire React scheduler (setImmediate) → queues passive effects
    cleanup();         // unmount → React flushes queued passive effects (useEffect runs)
    await Promise.resolve(); // let runOAuthFlow promise resolve
    await Promise.resolve();
    await Promise.resolve();
    vi.clearAllTimers();
  }

  it("invokes runOAuthFlow and updates pendingIdentity on success", async () => {
    vi.mocked(oauth.runOAuthFlow).mockResolvedValue({ token: "tok-xyz" });
    const { lastFrame } = render(
      <OAuthWaiting backendHttpUrl="http://localhost:8080" />,
    );
    expect(lastFrame()).toMatch(/Sign in/i);

    await triggerAndFlush();

    expect(oauth.runOAuthFlow).toHaveBeenCalled();
    const id = useStore.getState().pendingIdentity;
    expect(id?.kind).toBe("oauth");
    if (id?.kind === "oauth") expect(id.token).toBe("tok-xyz");
    expect(useStore.getState().screen).toBe("chat");
  });

  it("sets error state on flow failure", async () => {
    vi.mocked(oauth.runOAuthFlow).mockRejectedValue(new Error("boom"));
    render(<OAuthWaiting backendHttpUrl="http://localhost:8080" />);

    await triggerAndFlush();

    expect(useStore.getState().screen).toBe("error");
    expect(useStore.getState().errorMessage).toMatch(/boom/);
  });
});
