import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureGitFixture, type GitFixtureOptions } from "./e2e/git-fixture.js";

const roots: string[] = [];

function fixture(): GitFixtureOptions {
  const directory = mkdtempSync(path.join(tmpdir(), "custom-dca-git-fixture-"));
  roots.push(directory);
  return {
    directory,
    files: {
      "README.md": "# Fixture\n",
      "src/index.ts": "export const fixture = true;\n",
    },
    trackedFiles: ["README.md", "src/index.ts"],
    commitSubject: "fixture baseline",
  };
}

function git(directory: string, args: string[]): string {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("E2E Git fixture repair", () => {
  it("leaves a healthy fixture unchanged", () => {
    const options = fixture();
    ensureGitFixture(options);
    const head = git(options.directory, ["rev-parse", "HEAD"]);

    ensureGitFixture(options);

    expect(git(options.directory, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(options.directory, ["status", "--porcelain"])).toBe("");
  });

  it("repairs a .git directory whose HEAD is missing", () => {
    const options = fixture();
    ensureGitFixture(options);
    unlinkSync(path.join(options.directory, ".git", "HEAD"));

    ensureGitFixture(options);

    expect(git(options.directory, ["log", "-1", "--format=%s"])).toBe(options.commitSubject);
    expect(readFileSync(path.join(options.directory, "README.md"), "utf8")).toBe("# Fixture\n");
  });

  it("replaces malformed Git metadata", () => {
    const options = fixture();
    writeFileSync(path.join(options.directory, ".git"), "not git metadata\n");

    ensureGitFixture(options);

    expect(git(options.directory, ["rev-parse", "--is-inside-work-tree"])).toBe("true");
    expect(git(options.directory, ["log", "-1", "--format=%s"])).toBe(options.commitSubject);
  });

  it("restores missing and incorrect required files", () => {
    const options = fixture();
    ensureGitFixture(options);
    unlinkSync(path.join(options.directory, "README.md"));
    writeFileSync(path.join(options.directory, "src", "index.ts"), "wrong\n");

    ensureGitFixture(options);

    expect(readFileSync(path.join(options.directory, "README.md"), "utf8")).toBe("# Fixture\n");
    expect(readFileSync(path.join(options.directory, "src", "index.ts"), "utf8")).toBe("export const fixture = true;\n");
    expect(git(options.directory, ["status", "--porcelain", "--", ...options.trackedFiles])).toBe("");
  });

  it("restores the expected latest subject and baseline", () => {
    const options = fixture();
    ensureGitFixture(options);
    writeFileSync(path.join(options.directory, "README.md"), "changed\n");
    execFileSync("git", ["-C", options.directory, "add", "README.md"]);
    execFileSync("git", [
      "-C", options.directory,
      "-c", "user.name=E2E",
      "-c", "user.email=e2e@example.test",
      "commit", "-qm", "unexpected commit",
    ]);

    ensureGitFixture(options);

    expect(git(options.directory, ["log", "-1", "--format=%s"])).toBe(options.commitSubject);
    expect(git(options.directory, ["show", "HEAD:README.md"])).toBe("# Fixture");
    expect(git(options.directory, ["status", "--porcelain"])).toBe("");
  });

  it("repairs only the named directory and preserves a sibling", () => {
    const options = fixture();
    const sibling = path.join(path.dirname(options.directory), `${path.basename(options.directory)}-sibling`);
    roots.push(sibling);
    mkdirSync(path.join(sibling, ".git"), { recursive: true });
    writeFileSync(path.join(sibling, ".git", "sentinel"), "keep metadata\n");
    writeFileSync(path.join(sibling, "README.md"), "keep content\n");

    ensureGitFixture(options);

    expect(readFileSync(path.join(sibling, ".git", "sentinel"), "utf8")).toBe("keep metadata\n");
    expect(readFileSync(path.join(sibling, "README.md"), "utf8")).toBe("keep content\n");
  });
});
