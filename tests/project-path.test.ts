import { describe, expect, it } from "vitest";

import { splitProjectWorkspace } from "../client/lib/projectPath.js";

describe("splitProjectWorkspace", () => {
  it("returns just the project when there is no worktree marker", () => {
    expect(splitProjectWorkspace("custom-dca-opencode")).toEqual({ project: "custom-dca-opencode" });
  });

  it("splits a project and its worktree sibling", () => {
    expect(splitProjectWorkspace("custom-dca-opencode.worktrees/plan-build-toggle")).toEqual({
      project: "custom-dca-opencode",
      workspace: "plan-build-toggle",
    });
  });

  it("handles a nested workspace path", () => {
    expect(splitProjectWorkspace("custom-dca-opencode.worktrees/nested/deep")).toEqual({
      project: "custom-dca-opencode",
      workspace: "nested/deep",
    });
  });

  it("only splits on the first marker occurrence", () => {
    expect(splitProjectWorkspace("a.worktrees/b.worktrees/c")).toEqual({
      project: "a",
      workspace: "b.worktrees/c",
    });
  });
});
