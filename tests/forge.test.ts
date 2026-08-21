import { describe, expect, it } from "vitest";

import { parseReviewUrl } from "../server/forge.js";

describe("forge URL parsing", () => {
  it("parses bounded GitHub pull request URLs", () => {
    expect(parseReviewUrl("https://github.com/acme/demo/pull/7")).toMatchObject({
      forge: "github", owner: "acme", repo: "demo", number: 7,
    });
  });

  it("parses configured GitLab merge request URLs", () => {
    expect(parseReviewUrl("https://gitlab.com/group/project/-/merge_requests/42")).toMatchObject({
      forge: "gitlab", project: "group/project", number: 42,
    });
  });

  it("rejects arbitrary and lookalike hosts", () => {
    expect(() => parseReviewUrl("https://github.com.attacker.test/acme/demo/pull/7")).toThrow();
    expect(() => parseReviewUrl("http://127.0.0.1/admin")).toThrow();
  });
});
