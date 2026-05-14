import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store.js";
import type { Message } from "@pantry/shared";

function reset() {
  useStore.getState().reset();
}

describe("store", () => {
  beforeEach(reset);

  it("starts in room_input screen", () => {
    expect(useStore.getState().screen).toBe("room_input");
  });

  it("setRoomName advances to identity_select on commit", () => {
    useStore.getState().commitRoomName("lobby");
    expect(useStore.getState().roomName).toBe("lobby");
    expect(useStore.getState().screen).toBe("identity_select");
  });

  it("addMessage appends to messages", () => {
    const m: Message = {
      id: "11111111-1111-1111-1111-111111111111",
      body: "hi",
      createdAt: "2026-05-11T00:00:00Z",
      author: { nickname: "a", discriminator: "abcd" },
    };
    useStore.getState().addMessage(m);
    expect(useStore.getState().messages).toEqual([m]);
  });

  it("prependHistory deduplicates by id and preserves order", () => {
    const a: Message = {
      id: "11111111-1111-1111-1111-111111111111",
      body: "a",
      createdAt: "2026-05-11T00:00:00Z",
      author: { nickname: "u", discriminator: "abcd" },
    };
    const b: Message = {
      id: "22222222-2222-2222-2222-222222222222",
      body: "b",
      createdAt: "2026-05-11T00:00:01Z",
      author: { nickname: "u", discriminator: "abcd" },
    };
    useStore.getState().addMessage(b);
    useStore.getState().prependHistory([a]);
    expect(useStore.getState().messages.map((m) => m.id)).toEqual([a.id, b.id]);
    useStore.getState().prependHistory([a]); // duplicate
    expect(useStore.getState().messages.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("setPresence replaces onlineUsers", () => {
    useStore.getState().setPresence([{ nickname: "x", discriminator: "abcd" }]);
    expect(useStore.getState().onlineUsers).toEqual([
      { nickname: "x", discriminator: "abcd" },
    ]);
  });

  it("setError transitions to error screen", () => {
    useStore.getState().setError("oops");
    expect(useStore.getState().screen).toBe("error");
    expect(useStore.getState().errorMessage).toBe("oops");
  });

  it("setUpdateAvailable stores and clears the latest version", () => {
    useStore.getState().setUpdateAvailable("0.2.0");
    expect(useStore.getState().updateAvailable).toBe("0.2.0");
    useStore.getState().setUpdateAvailable(null);
    expect(useStore.getState().updateAvailable).toBeNull();
  });

  it("openChangelog flips changelogOpen true and resets index to 0", () => {
    useStore.getState().setChangelogIndex(3);
    useStore.getState().openChangelog();
    expect(useStore.getState().changelogOpen).toBe(true);
    expect(useStore.getState().changelogIndex).toBe(0);
  });

  it("closeChangelog flips changelogOpen false (index unchanged)", () => {
    useStore.getState().openChangelog();
    useStore.getState().setChangelogIndex(2);
    useStore.getState().closeChangelog();
    expect(useStore.getState().changelogOpen).toBe(false);
    expect(useStore.getState().changelogIndex).toBe(2);
  });

  it("setChangelogIndex updates the index", () => {
    useStore.getState().setChangelogIndex(5);
    expect(useStore.getState().changelogIndex).toBe(5);
  });
});
