import { describe, expect, it } from "vitest";

import type { CatalogResponse } from "../client/lib/api.js";
import { installStateFrom, projectLabel, UNKNOWN_INSTALL_STATE } from "../client/lib/usePlaybookInstallState.js";

const catalogue = (skills: string[], commands: string[]): CatalogResponse => ({
  servers: {},
  skills: skills.map((name) => ({ name, description: `${name} description` })),
  commands: commands.map((name) => ({ name })),
  tools: null,
  omitted: { skills: [], commands: [], servers: [] },
  refreshedAt: "2026-08-29T00:00:00Z",
});

describe("projectLabel", () => {
  it("names the project a claim belongs to", () => {
    expect(projectLabel("/Users/x/Documents/Projects/custom-dca-opencode")).toBe("custom-dca-opencode");
    expect(projectLabel("/tmp/mock-project/")).toBe("mock-project");
    // A worktree directory is named after its branch, which is exactly why the
    // label has to be shown rather than assumed to match the repository.
    expect(projectLabel("/Users/x/.local/share/opencode/worktree/abc/curious-nebula")).toBe("curious-nebula");
  });

  it("degrades to the input rather than an empty label", () => {
    expect(projectLabel("standalone")).toBe("standalone");
    expect(projectLabel("")).toBe("");
  });
});

describe("installStateFrom", () => {
  it("reports what the server says is loaded, labelled by project", () => {
    const state = installStateFrom("/tmp/mock-project", catalogue(["grill-me"], ["verify"]));
    expect(state.status).toBe("ready");
    expect(state.directoryLabel).toBe("mock-project");
    expect(state.installedSkills.has("grill-me")).toBe(true);
    expect(state.installedSkills.has("build-waves")).toBe(false);
    expect(state.installedCommands.has("verify")).toBe(true);
  });

  it("states nothing when there is no project", () => {
    // The alternative — an empty "ready" state — would render "Not loaded" for
    // every playbook, which is a claim the app cannot support.
    expect(installStateFrom("", catalogue(["grill-me"], []))).toEqual(UNKNOWN_INSTALL_STATE);
  });

  it("states nothing when the catalogue could not be read", () => {
    expect(installStateFrom("/tmp/mock-project", null)).toEqual(UNKNOWN_INSTALL_STATE);
  });

  it("reports an empty catalogue as ready with nothing loaded", () => {
    // Distinct from the failure case above: here the server answered, and
    // "nothing is installed in this project" is a supportable claim.
    const state = installStateFrom("/tmp/mock-project", catalogue([], []));
    expect(state.status).toBe("ready");
    expect(state.directoryLabel).toBe("mock-project");
    expect(state.installedSkills.size).toBe(0);
  });
});
