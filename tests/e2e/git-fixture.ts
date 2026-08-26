import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface GitFixtureOptions {
  directory: string;
  files: Record<string, string | Buffer>;
  trackedFiles: string[];
  commitSubject: string;
}

function git(directory: string, args: string[]): string {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function succeeds(directory: string, args: string[]): boolean {
  try {
    execFileSync("git", ["-C", directory, ...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fixturePath(directory: string, relative: string): string {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Fixture path must be relative: ${relative}`);
  const resolved = path.resolve(directory, relative);
  if (resolved === directory || !resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Fixture path escapes its directory: ${relative}`);
  }
  return resolved;
}

function hasLocalRepository(directory: string): boolean {
  try {
    const metadata = lstatSync(path.join(directory, ".git"));
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return false;
    return realpathSync(git(directory, ["rev-parse", "--show-toplevel"])) === realpathSync(directory);
  } catch {
    return false;
  }
}

/** Repairs one trusted E2E fixture without inspecting or changing sibling directories. */
export function ensureGitFixture(options: GitFixtureOptions): void {
  const directory = path.resolve(options.directory);
  if (options.trackedFiles.length === 0) throw new Error("A Git fixture needs at least one tracked file");

  mkdirSync(directory, { recursive: true });
  for (const [relative, content] of Object.entries(options.files)) {
    const target = fixturePath(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const trackedFiles = options.trackedFiles.map((relative) => {
    fixturePath(directory, relative);
    if (!(relative in options.files)) throw new Error(`Tracked fixture file has no deterministic content: ${relative}`);
    return relative;
  });

  if (!hasLocalRepository(directory)) {
    rmSync(path.join(directory, ".git"), { recursive: true, force: true });
    execFileSync("git", ["init", "-q", directory]);
  }

  const hasHead = succeeds(directory, ["rev-parse", "--verify", "-q", "HEAD"]);
  const hasExpectedSubject = hasHead && git(directory, ["log", "-1", "--format=%s"]) === options.commitSubject;
  const hasExpectedBaseline = hasHead && git(directory, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...trackedFiles]) === "";
  if (hasExpectedSubject && hasExpectedBaseline) return;

  execFileSync("git", ["-C", directory, "add", "--", ...trackedFiles]);
  execFileSync("git", [
    "-C", directory,
    "-c", "user.name=E2E",
    "-c", "user.email=e2e@example.test",
    "commit", "--only", "--allow-empty", "-qm", options.commitSubject,
    "--", ...trackedFiles,
  ]);
}
