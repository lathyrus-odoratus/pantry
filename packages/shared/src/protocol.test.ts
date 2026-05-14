import { describe, it, expect } from "vitest";
import { ClientMessageSchema, ServerMessageSchema } from "./protocol.js";
import { MessageSchema, UserSchema } from "./models.js";

describe("forward-compat: Message.createdAt accepts both UTC and offset formats", () => {
  const base = {
    id: "00000000-0000-0000-0000-000000000001",
    body: "hi",
    author: { nickname: "a", discriminator: "1234" },
  };

  it("parses Z-suffixed timestamp (server-generated live message)", () => {
    const r = MessageSchema.parse({ ...base, createdAt: "2026-05-12T17:50:11.979Z" });
    expect(r.createdAt).toBe("2026-05-12T17:50:11.979Z");
  });

  it("parses +00:00 offset timestamp (Postgres timestamptz from snapshot)", () => {
    const r = MessageSchema.parse({ ...base, createdAt: "2026-05-12T17:50:11.979+00:00" });
    expect(r.createdAt).toBe("2026-05-12T17:50:11.979+00:00");
  });

  it("parses non-UTC offset timestamp", () => {
    const r = MessageSchema.parse({ ...base, createdAt: "2026-05-12T17:50:11.979+08:00" });
    expect(r.createdAt).toBe("2026-05-12T17:50:11.979+08:00");
  });
});

describe("forward-compat: optional version fields", () => {
  it("parses auth.anon WITHOUT clientVersion (old client)", () => {
    const result = ClientMessageSchema.parse({
      type: "auth.anon",
      nickname: "alice",
      roomName: "lobby",
    });
    expect(result.type).toBe("auth.anon");
  });

  it("parses auth.anon WITH clientVersion (new client)", () => {
    const result = ClientMessageSchema.parse({
      type: "auth.anon",
      nickname: "alice",
      roomName: "lobby",
      clientVersion: "0.1.0",
    });
    expect((result as { clientVersion?: string }).clientVersion).toBe("0.1.0");
  });

  it("parses auth.oauth WITH clientVersion", () => {
    const result = ClientMessageSchema.parse({
      type: "auth.oauth",
      token: "t",
      roomName: "lobby",
      clientVersion: "0.2.0",
    });
    expect((result as { clientVersion?: string }).clientVersion).toBe("0.2.0");
  });

  it("parses auth.ok WITHOUT latestClientVersion (old server)", () => {
    const result = ServerMessageSchema.parse({
      type: "auth.ok",
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        nickname: "a",
        discriminator: "1234",
      },
    });
    expect(result.type).toBe("auth.ok");
  });

  it("parses auth.ok WITH latestClientVersion (new server)", () => {
    const result = ServerMessageSchema.parse({
      type: "auth.ok",
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        nickname: "a",
        discriminator: "1234",
      },
      latestClientVersion: "0.3.0",
    });
    expect(
      (result as { latestClientVersion?: string }).latestClientVersion,
    ).toBe("0.3.0");
  });
});

describe("color.change client message", () => {
  it("accepts uppercase hex with #", () => {
    const r = ClientMessageSchema.parse({ type: "color.change", color: "#FF6B6B" });
    expect(r.type).toBe("color.change");
    expect((r as { color: string | null }).color).toBe("#FF6B6B");
  });

  it("accepts lowercase hex with #", () => {
    const r = ClientMessageSchema.parse({ type: "color.change", color: "#ff6b6b" });
    expect((r as { color: string | null }).color).toBe("#ff6b6b");
  });

  it("accepts hex without #", () => {
    const r = ClientMessageSchema.parse({ type: "color.change", color: "ff6b6b" });
    expect((r as { color: string | null }).color).toBe("ff6b6b");
  });

  it("accepts mixed-case hex without #", () => {
    const r = ClientMessageSchema.parse({ type: "color.change", color: "Ff6B6b" });
    expect((r as { color: string | null }).color).toBe("Ff6B6b");
  });

  it("accepts null (reset)", () => {
    const r = ClientMessageSchema.parse({ type: "color.change", color: null });
    expect((r as { color: string | null }).color).toBeNull();
  });

  it("rejects color name 'red'", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "color.change", color: "red" }),
    ).toThrow();
  });

  it("rejects 3-digit hex shorthand", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "color.change", color: "#fff" }),
    ).toThrow();
  });

  it("rejects 8-digit hex (alpha channel)", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "color.change", color: "#ff6b6bff" }),
    ).toThrow();
  });

  it("rejects non-hex characters", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "color.change", color: "#gghhii" }),
    ).toThrow();
  });

  it("rejects empty string", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "color.change", color: "" }),
    ).toThrow();
  });
});

describe("UserSchema with optional color (forward-compat)", () => {
  it("parses user WITHOUT color (old server)", () => {
    const u = UserSchema.parse({ nickname: "alice", discriminator: "ab12" });
    expect(u.nickname).toBe("alice");
    expect((u as { color?: string | null }).color).toBeUndefined();
  });

  it("parses user WITH color hex", () => {
    const u = UserSchema.parse({
      nickname: "alice",
      discriminator: "ab12",
      color: "#FF6B6B",
    });
    expect((u as { color?: string | null }).color).toBe("#FF6B6B");
  });

  it("parses user WITH color null (explicit reset)", () => {
    const u = UserSchema.parse({
      nickname: "alice",
      discriminator: "ab12",
      color: null,
    });
    expect((u as { color?: string | null }).color).toBeNull();
  });
});
