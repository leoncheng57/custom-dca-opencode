// server/reminders/repository-identity.ts — resolve "which repository is this
// directory?" for reminder scoping (issue #165).
//
// Every failure mode here must HIDE a scoped reminder rather than show it, so
// this module returns `null` for anything it cannot prove: no remote, several
// remotes, a non-GitHub host, an unparseable URL, a timeout, a directory that
// is not a git repository at all. A scoped reminder is only ever revealed on a
// positive, exact, three-field match.
//
// Identity comes from git, never from the path. Worktree directories are named
// after branches and can be renamed, and two unrelated repositories can share a
// basename — this very checkout lives in a directory called `curious-nebula`.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Matches the discipline of the other git call sites: no shell, bounded. */
const GIT_TIMEOUT_MS = 5_000;

/** GitHub's own limits, anchored so a hostile remote cannot widen them. */
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/;

export interface RepositoryIdentity {
  owner: string;
  repo: string;
}

/**
 * Parse a git remote URL into an identity, or null when it is not an
 * unambiguous GitHub remote.
 *
 * Compared as three separately-parsed, exactly-equal fields (host, owner,
 * repo). A substring match would let `https://evil.test/leoncheng57/x` or a
 * repo named `x-fork` impersonate the scoped identity.
 */
export function parseGitHubRemote(remote: string): RepositoryIdentity | null {
  const value = remote.trim();
  if (value === "") return null;

  let host: string;
  let pathname: string;
  const scp = /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9._-]+):(?!\/)(.+)$/.exec(value);
  if (scp) {
    // git@github.com:owner/repo.git
    host = scp[2];
    pathname = scp[3];
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
    host = url.hostname;
    pathname = url.pathname;
  }

  if (host.toLowerCase() !== "github.com") return null;

  const segments = pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (segments.length !== 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  // `.` and `..` would pass REPO_RE's character class.
  if (repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** `owner/repo`, lowercased, for comparison and for scope metadata. */
export function formatIdentity(identity: RepositoryIdentity): string {
  return `${identity.owner.toLowerCase()}/${identity.repo.toLowerCase()}`;
}

/**
 * Resolve the canonical GitHub identity of a directory from its `origin`
 * remote, or null when it cannot be proven.
 *
 * Deliberately only `origin`. A repository may have several remotes or a
 * renamed one; picking "whichever remote happens to match" would let any
 * checkout opt itself in by adding a second remote.
 */
export async function resolveRepositoryIdentity(directory: string): Promise<RepositoryIdentity | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", directory, "config", "--get", "remote.origin.url"],
      { timeout: GIT_TIMEOUT_MS, encoding: "utf8" },
    );
    return parseGitHubRemote(stdout);
  } catch {
    // Not a repository, no origin, git missing, or timed out. All of these mean
    // "unknown", and unknown hides.
    return null;
  }
}
