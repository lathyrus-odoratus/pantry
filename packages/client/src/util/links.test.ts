import { describe, it, expect } from "vitest";
import { shortenUrlLabel, linkify } from "./links.js";

const LONG_DISCORD_URL =
  "https://cdn.discordapp.com/attachments/1504664060870787112/1509416110502707211/image.png?ex=6a1e10b48ddc5de22f44bc&is=abc&hm=deadbeef";

describe("shortenUrlLabel", () => {
  it("renders host + last path segment for a deep URL", () => {
    expect(shortenUrlLabel(LONG_DISCORD_URL)).toBe(
      "cdn.discordapp.com/…/image.png",
    );
  });

  it("decodes percent-encoded filenames", () => {
    expect(
      shortenUrlLabel("https://example.com/files/my%20file.pdf?token=x"),
    ).toBe("example.com/…/my file.pdf");
  });

  it("falls back to host when there is no path", () => {
    expect(shortenUrlLabel("https://example.com/?a=1")).toBe("example.com");
  });

  it("truncates very long labels", () => {
    const label = shortenUrlLabel(
      `https://example.com/${"a".repeat(120)}.png`,
    );
    expect(label.length).toBeLessThanOrEqual(48);
    expect(label.endsWith("…")).toBe(true);
  });

  it("truncates an unparseable string", () => {
    const label = shortenUrlLabel(`http://${"x".repeat(80)}`);
    expect(label.length).toBeLessThanOrEqual(48);
  });
});

describe("linkify", () => {
  it("leaves text without URLs untouched", () => {
    expect(linkify("just a plain message <:emoji:123>")).toBe(
      "just a plain message <:emoji:123>",
    );
  });

  it("leaves short URLs untouched", () => {
    const body = "see https://asciiart.website/art/1871 for the cat";
    expect(linkify(body)).toBe(body);
  });

  it("always keeps the full URL recoverable for long URLs", () => {
    // In a non-hyperlink env the fallback returns the raw URL; with hyperlinks
    // it is embedded in the OSC 8 escape. Either way the URL is present.
    expect(linkify(`pic: ${LONG_DISCORD_URL}`)).toContain(LONG_DISCORD_URL);
  });
});
