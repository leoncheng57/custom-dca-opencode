import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_REFERENCE_LIMITS,
  validateWorkspaceReferences,
} from "../server/opencode/workspace.js";

/**
 * A real repository, because the containment checks under test are real:
 * `git check-ignore` needs a git directory and symlink escapes need a symlink.
 */
async function workspace(): Promise<{ directory: string; outside: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dca-refs-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "dca-outside-"));
  execFileSync("git", ["init", "-q", directory]);
  await mkdir(path.join(directory, "src", "deep"), { recursive: true });
  await writeFile(path.join(directory, ".gitignore"), "generated.txt\n");
  await writeFile(path.join(directory, ".env"), "SECRET=1\n");
  await writeFile(path.join(directory, "generated.txt"), "built\n");
  await writeFile(path.join(directory, "README.md"), "# fixture\n");
  await writeFile(path.join(directory, "src", "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(directory, "src", "deep", "nested.ts"), "export const nested = true;\n");
  await writeFile(path.join(outside, "secret.txt"), "nope\n");
  await symlink(path.join(outside, "secret.txt"), path.join(directory, "escape.txt"));
  await symlink(path.join(directory, "src", "index.ts"), path.join(directory, "alias.ts"));
  return { directory, outside };
}

const status = (references: Awaited<ReturnType<typeof validateWorkspaceReferences>>) =>
  Object.fromEntries(references.map((reference) => [reference.path, reference.status]));

describe("workspace reference validation", () => {
  it("only reports readable regular files as files", async () => {
    const { directory } = await workspace();
    const references = await validateWorkspaceReferences(directory, [
      "README.md",
      "src/index.ts",
      "src/deep/nested.ts",
      "src",
      "src/missing.ts",
    ]);
    expect(status(references)).toEqual({
      "README.md": "file",
      "src/index.ts": "file",
      "src/deep/nested.ts": "file",
      src: "directory",
      "src/missing.ts": "missing",
    });
    expect(references[0].resolvedPath).toBe("README.md");
    // A directory is readable but has nothing to show, so it carries no target.
    expect(references[3].resolvedPath).toBeUndefined();
  });

  it("keeps the read routes' protections: traversal, secrets, ignores, symlink escapes", async () => {
    const { directory } = await workspace();
    const references = await validateWorkspaceReferences(directory, [
      "../escape.txt",
      "/etc/passwd",
      "",
      ".env",
      ".git/config",
      "generated.txt",
      "escape.txt",
    ]);
    expect(status(references)).toEqual({
      "../escape.txt": "invalid",
      "/etc/passwd": "invalid",
      "": "invalid",
      ".env": "forbidden",
      ".git/config": "forbidden",
      "generated.txt": "forbidden",
      "escape.txt": "forbidden",
    });
  });

  it("returns the canonical target for a symlinked alias, not the alias", async () => {
    const { directory } = await workspace();
    const [alias] = await validateWorkspaceReferences(directory, ["alias.ts"]);
    // Forwarding the alias would let the link be swapped after validation.
    expect(alias).toEqual({ path: "alias.ts", status: "file", resolvedPath: "src/index.ts" });
  });

  it("answers every request slot exactly once, including repeats", async () => {
    const { directory } = await workspace();
    const requested = ["src/index.ts", "src/index.ts", "README.md", "src/index.ts"];
    const references = await validateWorkspaceReferences(directory, requested);
    expect(references.map((reference) => reference.path)).toEqual(requested);
    expect(references.every((reference) => reference.status === "file")).toBe(true);
  });

  it("treats non-string entries as invalid rather than throwing", async () => {
    const { directory } = await workspace();
    const references = await validateWorkspaceReferences(directory, [null, 42, { path: "x" }, "README.md"]);
    expect(references.map((reference) => reference.status)).toEqual([
      "invalid",
      "invalid",
      "invalid",
      "file",
    ]);
  });

  it("handles a full batch without exceeding it", async () => {
    const { directory } = await workspace();
    const paths = Array.from({ length: WORKSPACE_REFERENCE_LIMITS.batchSize }, (_, index) =>
      index === 0 ? "README.md" : `src/missing-${index}.ts`,
    );
    const references = await validateWorkspaceReferences(directory, paths);
    expect(references).toHaveLength(WORKSPACE_REFERENCE_LIMITS.batchSize);
    expect(references[0].status).toBe("file");
    expect(references.slice(1).every((reference) => reference.status === "missing")).toBe(true);
  });
});
