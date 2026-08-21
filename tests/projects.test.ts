import { mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverProjects,
  normalizeProjectPins,
  PROJECT_PINS_MAX,
  PROJECT_SCAN_MAX_DEPTH,
  ProjectPinStore,
} from "../server/projects.js";

describe("project discovery", () => {
  it("includes immediate directories and only deeper git roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const app = path.join(root, "app");
    const nestedRepo = path.join(app, "packages", "nested");
    await mkdir(path.join(app, ".git"), { recursive: true });
    await mkdir(path.join(root, "notes"));
    await mkdir(path.join(nestedRepo, ".git"), { recursive: true });
    await mkdir(path.join(app, "packages", "plain"));

    const result = await discoverProjects({ root, excludedWorktreesRoot: path.join(root, "worktrees") });
    expect(result.projects.map(({ relativePath, kind }) => [relativePath, kind])).toEqual([
      ["app", "repository"],
      ["app/packages/nested", "repository"],
      ["notes", "directory"],
    ]);
  });

  it("skips hidden, generated, symlink, worktree, and too-deep repositories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "dca-outside-"));
    await mkdir(path.join(outside, ".git"));
    await symlink(outside, path.join(root, "linked"));
    await mkdir(path.join(root, ".hidden", "repo", ".git"), { recursive: true });
    await mkdir(path.join(root, "host", "node_modules", "repo", ".git"), { recursive: true });
    const worktrees = path.join(root, "worktrees");
    await mkdir(path.join(worktrees, "repo", ".git"), { recursive: true });
    const tooDeep = path.join(root, "host", ...Array.from({ length: PROJECT_SCAN_MAX_DEPTH }, (_, index) => `d${index}`));
    await mkdir(path.join(tooDeep, ".git"), { recursive: true });

    const result = await discoverProjects({ root, excludedWorktreesRoot: worktrees });
    expect(result.projects.map((project) => project.relativePath)).toEqual(["host"]);
  });

  it("reports a missing root as a configuration error", async () => {
    await expect(discoverProjects({ root: path.join(os.tmpdir(), "missing-project-root") })).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("PROJECTS_DIR"),
    });
  });
});

describe("project pins", () => {
  it("canonicalizes, deduplicates, and rejects paths outside the project root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const project = path.join(root, "group", "project");
    const outside = await mkdtemp(path.join(os.tmpdir(), "dca-outside-"));
    await mkdir(project, { recursive: true });
    const canonicalProject = await realpath(project);
    expect(await normalizeProjectPins({ directories: [project, project] }, root)).toEqual([canonicalProject]);
    await expect(normalizeProjectPins({ directories: [outside] }, root)).rejects.toMatchObject({ status: 403 });
    await expect(normalizeProjectPins({ directories: "nope" }, root)).rejects.toMatchObject({ status: 400 });
    await expect(normalizeProjectPins({ directories: Array(PROJECT_PINS_MAX + 1).fill(project) }, root))
      .rejects.toMatchObject({ status: 400 });
  });

  it("atomically persists ordered pins with private permissions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    await Promise.all([mkdir(first), mkdir(second)]);
    const file = path.join(root, "state", "pins.json");
    const store = new ProjectPinStore(file, root);
    const canonicalFirst = await realpath(first);
    const canonicalSecond = await realpath(second);
    expect(await store.read()).toEqual([]);
    expect(await store.write({ directories: [second, first] })).toEqual([canonicalSecond, canonicalFirst]);
    expect(await store.read()).toEqual([canonicalSecond, canonicalFirst]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, directories: [canonicalSecond, canonicalFirst] });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("drops stale pins on read and rejects malformed state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const project = path.join(root, "project");
    await mkdir(project);
    const file = path.join(root, "pins.json");
    const store = new ProjectPinStore(file, root);
    await writeFile(file, JSON.stringify({ directories: [project, path.join(root, "gone")] }));
    expect(await store.read()).toEqual([await realpath(project)]);
    await writeFile(file, "not json");
    await expect(store.read()).rejects.toThrow("could not be read");
  });
});
