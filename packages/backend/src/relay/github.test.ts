import { describe, it, expect } from "vitest";
import { buildEmbed } from "./github.js";

describe("buildEmbed", () => {
  it("builds a push embed with branch, compare url and commit lines", () => {
    const embed = buildEmbed("push", {
      ref: "refs/heads/main",
      compare: "https://github.com/o/r/compare/a...b",
      repository: { full_name: "o/r" },
      pusher: { name: "alice" },
      commits: [
        { id: "abc1234def", message: "fix: thing\n\ndetails", author: { username: "bob" } },
        { id: "0987654", message: "chore: bump" },
      ],
    });
    expect(embed).not.toBeNull();
    expect(embed?.title).toBe("[o/r:main] 2 new commits");
    expect(embed?.url).toBe("https://github.com/o/r/compare/a...b");
    expect(embed?.description).toContain("`abc1234` fix: thing — bob");
    expect(embed?.description).toContain("`0987654` chore: bump — alice");
    expect(embed?.description).not.toContain("details");
  });

  it("singularizes the push title for one commit", () => {
    const embed = buildEmbed("push", {
      ref: "refs/heads/dev",
      repository: { full_name: "o/r" },
      pusher: { name: "alice" },
      commits: [{ id: "1111111", message: "one" }],
    });
    expect(embed?.title).toBe("[o/r:dev] 1 new commit");
  });

  it("builds an opened PR embed", () => {
    const embed = buildEmbed("pull_request", {
      action: "opened",
      number: 42,
      pull_request: {
        title: "Add feature",
        html_url: "https://github.com/o/r/pull/42",
        user: { login: "carol" },
      },
      repository: { full_name: "o/r" },
    });
    expect(embed?.title).toBe("[o/r] PR #42 opened: Add feature");
    expect(embed?.url).toBe("https://github.com/o/r/pull/42");
    expect(embed?.description).toBe("by carol");
  });

  it("reports a merged PR distinctly from a plain close", () => {
    const merged = buildEmbed("pull_request", {
      action: "closed",
      number: 7,
      pull_request: { title: "X", html_url: "https://github.com/o/r/pull/7", merged: true },
      repository: { full_name: "o/r" },
    });
    expect(merged?.title).toBe("[o/r] PR #7 merged: X");

    const closed = buildEmbed("pull_request", {
      action: "closed",
      number: 8,
      pull_request: { title: "Y", html_url: "https://github.com/o/r/pull/8", merged: false },
      repository: { full_name: "o/r" },
    });
    expect(closed?.title).toBe("[o/r] PR #8 closed: Y");
  });

  it("skips low-signal PR actions", () => {
    expect(
      buildEmbed("pull_request", {
        action: "synchronize",
        number: 1,
        pull_request: { title: "X" },
        repository: { full_name: "o/r" },
      }),
    ).toBeNull();
  });

  it("builds an issues embed", () => {
    const embed = buildEmbed("issues", {
      action: "opened",
      issue: {
        title: "Bug here",
        html_url: "https://github.com/o/r/issues/3",
        number: 3,
        user: { login: "dave" },
      },
      repository: { full_name: "o/r" },
    });
    expect(embed?.title).toBe("[o/r] Issue #3 opened: Bug here");
    expect(embed?.url).toBe("https://github.com/o/r/issues/3");
  });

  it("returns null for ping and unknown events", () => {
    expect(buildEmbed("ping", { zen: "hi" })).toBeNull();
    expect(buildEmbed("star", {})).toBeNull();
  });

  it("omits a non-http url rather than emitting an invalid embed", () => {
    const embed = buildEmbed("push", {
      ref: "refs/heads/main",
      compare: "not-a-url",
      repository: { full_name: "o/r" },
      pusher: { name: "alice" },
      commits: [],
    });
    expect(embed?.url).toBeUndefined();
    expect(embed?.description).toBe("Pushed by alice");
  });
});
