import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  const valid = {
    PORT: "8080",
    NODE_ENV: "development",
    PUBLIC_BACKEND_URL: "http://localhost:8080",
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    JWT_SIGNING_KEY: "0123456789abcdef0123456789abcdef",
    GITHUB_CLIENT_ID: "g",
    GITHUB_CLIENT_SECRET: "g",
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    DISCORD_CLIENT_ID: "d",
    DISCORD_CLIENT_SECRET: "d",
  };

  it("parses a valid env", () => {
    const cfg = parseConfig(valid);
    expect(cfg.port).toBe(8080);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.supabase.url).toBe("https://x.supabase.co");
  });

  it("accepts missing GitHub and Google OAuth secrets (Discord-only deploy)", () => {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ...rest } = valid;
    const cfg = parseConfig(rest);
    expect(cfg.oauth.github).toBeUndefined();
    expect(cfg.oauth.google).toBeUndefined();
    expect(cfg.oauth.discord.clientId).toBe("d");
  });

  it("still rejects missing DISCORD_CLIENT_ID", () => {
    const { DISCORD_CLIENT_ID, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow();
  });

  it("rejects missing SUPABASE_URL", () => {
    const { SUPABASE_URL, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow();
  });

  it("rejects short JWT_SIGNING_KEY", () => {
    expect(() => parseConfig({ ...valid, JWT_SIGNING_KEY: "short" })).toThrow();
  });
});
