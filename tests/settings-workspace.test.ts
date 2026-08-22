import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { publicSettings, validateSettingsPatch } from "../server/opencode/config.js";
import { parseCommits } from "../server/opencode/workspace.js";
import { requireProjectDirectory, requireReadableWorkspacePath, requireRelativePath } from "../server/paths.js";
import { parseAllowedPorts } from "../server/routes/preview.js";

describe("public settings", () => {
  it("allow-lists fields and never returns secrets", () => {
    expect(publicSettings({
      model: "anthropic/opus",
      provider: { token: "secret" },
      mcp: { private: { url: "secret" } },
      compaction: { auto: true, reserved: 1000, future: "ignored" },
    })).toEqual({ model: "anthropic/opus", compaction: { auto: true, reserved: 1000 } });
  });

  it("rejects unsupported and invalid patches", () => {
    expect(() => validateSettingsPatch({ provider: {} })).toThrow("unsupported setting");
    expect(() => validateSettingsPatch({ subagent_depth: 3 })).toThrow("unsupported setting");
    expect(() => validateSettingsPatch({ compaction: { reserved: 1.5 } })).toThrow("non-negative integer");
  });
});

describe("workspace paths", () => {
  it("accepts a canonical child and rejects a symlink escape", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-root-"));
    const project = path.join(root, "project");
    const outside = await mkdtemp(path.join(os.tmpdir(), "dca-outside-"));
    await mkdir(project);
    expect(await requireProjectDirectory(project, root)).toBe(await realpath(project));
    await symlink(outside, path.join(root, "escape"));
    await expect(requireProjectDirectory(path.join(root, "escape"), root)).rejects.toMatchObject({ status: 403 });
  });

  it("rejects traversal and absolute file paths", () => {
    expect(requireRelativePath("src/index.ts")).toBe("src/index.ts");
    expect(() => requireRelativePath("../secret")).toThrow("must not traverse");
    expect(() => requireRelativePath("/etc/passwd")).toThrow("workspace-relative");
  });

  it("rejects sensitive children and symlinks that escape a valid project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-root-"));
    const project = path.join(root, "project");
    const outside = await mkdtemp(path.join(os.tmpdir(), "dca-secret-"));
    await mkdir(project);
    await symlink(outside, path.join(project, "leak"));
    await expect(requireReadableWorkspacePath(project, "leak")).rejects.toMatchObject({ status: 403 });
    await expect(requireReadableWorkspacePath(project, ".env")).rejects.toMatchObject({ status: 403 });
  });
});

describe("workspace derivations", () => {
  it("parses NUL-delimited git log records", () => {
    const commits = parseCommits("abc\x00abc123\x00Subject\x00Ada\x002026-01-01T00:00:00Z\x1e");
    expect(commits).toEqual([{ sha: "abc", shortSha: "abc123", subject: "Subject", author: "Ada", authoredAt: "2026-01-01T00:00:00Z" }]);
  });

  it("allowlists ports and always drops forbidden listeners", () => {
    expect([...parseAllowedPorts("5173, 4173,garbage,4096", [4096])]).toEqual([5173, 4173]);
    expect(parseAllowedPorts(undefined).size).toBe(0);
  });
});
