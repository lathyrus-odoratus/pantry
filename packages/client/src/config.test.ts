import { describe, it, expect } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("uses the compiled-in default when no override", () => {
    const cfg = resolveConfig({ argv: [], env: {} });
    expect(cfg.serverUrl).toBe("wss://pantry.miao-bao.cc/ws");
    expect(cfg.backendHttpUrl).toBe("https://pantry.miao-bao.cc");
  });

  it("--server overrides default", () => {
    const cfg = resolveConfig({
      argv: ["--server", "wss://example.com/ws"],
      env: {},
    });
    expect(cfg.serverUrl).toBe("wss://example.com/ws");
    expect(cfg.backendHttpUrl).toBe("https://example.com");
  });

  it("PANTRY_SERVER env overrides default but loses to CLI", () => {
    const fromEnv = resolveConfig({
      argv: [],
      env: { PANTRY_SERVER: "wss://env.example.com/ws" },
    });
    expect(fromEnv.serverUrl).toBe("wss://env.example.com/ws");

    const fromCli = resolveConfig({
      argv: ["--server", "wss://cli.example.com/ws"],
      env: { PANTRY_SERVER: "wss://env.example.com/ws" },
    });
    expect(fromCli.serverUrl).toBe("wss://cli.example.com/ws");
  });

  it("--room captures initial room name", () => {
    const cfg = resolveConfig({ argv: ["--room", "lobby"], env: {} });
    expect(cfg.initialRoom).toBe("lobby");
  });

  it("returns undefined initialRoom when not provided", () => {
    const cfg = resolveConfig({ argv: [], env: {} });
    expect(cfg.initialRoom).toBeUndefined();
  });

  it("derives http url from wss", () => {
    const cfg = resolveConfig({
      argv: ["--server", "wss://x.com/ws"],
      env: {},
    });
    expect(cfg.backendHttpUrl).toBe("https://x.com");
  });

  it("derives http url from ws", () => {
    const cfg = resolveConfig({
      argv: ["--server", "ws://1.2.3.4:9000/ws"],
      env: {},
    });
    expect(cfg.backendHttpUrl).toBe("http://1.2.3.4:9000");
  });

  it("--map captures a permalink, with PANTRY_MAP env fallback", () => {
    const fromCli = resolveConfig({ argv: ["--map", "https://e.x/#m=1;a;1;1;.;."], env: {} });
    expect(fromCli.mapUrl).toBe("https://e.x/#m=1;a;1;1;.;.");

    const fromEnv = resolveConfig({ argv: [], env: { PANTRY_MAP: "#m=1;a;1;1;.;." } });
    expect(fromEnv.mapUrl).toBe("#m=1;a;1;1;.;.");

    expect(resolveConfig({ argv: [], env: {} }).mapUrl).toBeUndefined();
  });
});
