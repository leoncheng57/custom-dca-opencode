import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { request, type OpencodeConfig } from "./client.js";
import {
  PathError,
  isSensitiveWorkspacePath,
  requireReadableWorkspacePath,
  requireRelativePath,
} from "../paths.js";

const execFileAsync = promisify(execFile);

export interface WorkspaceNode {
  name: string;
  path: string;
  type: "file" | "directory";
  ignored: boolean;
}

export interface WorkspaceFile {
  path: string;
  type: "text" | "binary";
  content: string;
  encoding?: "base64";
  mimeType?: string;
}

export interface VcsFileDiff {
  file: string;
  patch?: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified";
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  authoredAt: string;
}

interface RawFileNode {
  name?: string;
  path?: string;
  absolute?: string;
  type?: string;
  ignored?: boolean;
}

export async function listWorkspace(
  config: OpencodeConfig,
  directory: string,
  relativePath: string,
): Promise<{ path: string; dirs: WorkspaceNode[]; files: WorkspaceNode[]; nextPageId: null }> {
  const raw = await request<RawFileNode[]>(config, "/file", {
    directory,
    query: { path: relativePath },
  });
  const nodes = raw.map((node) => ({
    name: node.name ?? (node.path?.split("/").pop() || ""),
    path: node.path ?? node.name ?? "",
    type: node.type === "directory" ? ("directory" as const) : ("file" as const),
    ignored: node.ignored === true,
  })).filter((node) => !node.ignored && !isSensitiveWorkspacePath(node.path));
  return {
    path: relativePath,
    dirs: nodes.filter((node) => node.type === "directory").sort((a, b) => a.name.localeCompare(b.name)),
    files: nodes.filter((node) => node.type === "file").sort((a, b) => a.name.localeCompare(b.name)),
    nextPageId: null,
  };
}

export async function readWorkspaceFile(
  config: OpencodeConfig,
  directory: string,
  relativePath: string,
): Promise<WorkspaceFile> {
  const file = await request<Omit<WorkspaceFile, "path">>(config, "/file/content", {
    directory,
    query: { path: relativePath },
  });
  return { path: relativePath, ...file };
}

export function listChanges(
  config: OpencodeConfig,
  directory: string,
  mode: "git" | "branch",
  context: number,
): Promise<VcsFileDiff[]> {
  return request<VcsFileDiff[]>(config, "/vcs/diff", {
    directory,
    query: { mode, context },
  }).then((changes) => changes.filter((change) => !isSensitiveWorkspacePath(change.file)));
}

// ── Reference validation ────────────────────────────────────────────────────
//
// The transcript renders a file reference as an interactive control only after
// the workspace confirms the target is a readable file. The check runs here,
// through the very same `requireReadableWorkspacePath` the read routes use, so
// a client-side match can never widen what is reachable: traversal, symlink
// escapes, ignored files and sensitive names are still rejected by one
// authority. A caller that skipped this endpoint would gain nothing — the read
// route re-runs every check anyway.
//
// Batching exists because a single assistant turn can cite a dozen paths and
// each check costs a `realpath` pair plus a `git check-ignore` process. One
// request per code span would spawn processes per keystroke of streamed prose.

export type WorkspaceReferenceStatus =
  /** A readable regular file. The only status the UI makes interactive. */
  | "file"
  /** Readable, but a directory: there is nothing for the viewer to show. */
  | "directory"
  /** Rejected before the filesystem was consulted (traversal, absolute, …). */
  | "invalid"
  /** Inside the workspace but withheld: ignored, sensitive, or escaping. */
  | "forbidden"
  /** Nothing resolves at that path. */
  | "missing";

export interface WorkspaceReference {
  /** Echo of the requested candidate, so a client can key its cache by it. */
  path: string;
  status: WorkspaceReferenceStatus;
  /**
   * Canonical workspace-relative path, present only for `file`.
   *
   * Callers must forward this rather than their own candidate: the candidate
   * may be a symlink alias, and re-resolving it later would validate a
   * different target than the one that passed.
   */
  resolvedPath?: string;
}

export const WORKSPACE_REFERENCE_LIMITS = {
  /** Paths accepted per request. A larger batch is a client bug, not a hint. */
  batchSize: 64,
  pathCharacters: 512,
  /** Each check spawns `git check-ignore`; this bounds concurrent processes. */
  concurrency: 8,
} as const;

async function classify(directory: string, candidate: unknown): Promise<WorkspaceReference> {
  const value = typeof candidate === "string" ? candidate : "";
  const reference = { path: value };
  if (!value || value.length > WORKSPACE_REFERENCE_LIMITS.pathCharacters) {
    return { ...reference, status: "invalid" };
  }
  let relative: string;
  try {
    relative = requireRelativePath(value);
  } catch {
    return { ...reference, status: "invalid" };
  }
  if (!relative) return { ...reference, status: "invalid" };

  let resolvedPath: string;
  try {
    resolvedPath = await requireReadableWorkspacePath(directory, relative);
  } catch (error) {
    if (error instanceof PathError) {
      return { ...reference, status: error.status === 404 ? "missing" : "forbidden" };
    }
    throw error;
  }
  const target = await stat(path.join(directory, resolvedPath)).catch(() => null);
  if (!target) return { ...reference, status: "missing" };
  if (target.isDirectory()) return { ...reference, status: "directory" };
  if (!target.isFile()) return { ...reference, status: "forbidden" };
  return { ...reference, status: "file", resolvedPath };
}

/**
 * Classify workspace-relative candidates, preserving request order.
 *
 * Duplicates are collapsed before any filesystem work and re-expanded in the
 * response, so a transcript citing one file twenty times costs one check.
 */
export async function validateWorkspaceReferences(
  directory: string,
  paths: readonly unknown[],
): Promise<WorkspaceReference[]> {
  const unique: unknown[] = [];
  const seen = new Set<unknown>();
  for (const candidate of paths) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }

  const results = new Map<unknown, WorkspaceReference>();
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(WORKSPACE_REFERENCE_LIMITS.concurrency, unique.length) },
    async () => {
      while (cursor < unique.length) {
        const candidate = unique[cursor++];
        results.set(candidate, await classify(directory, candidate));
      }
    },
  );
  await Promise.all(workers);
  return paths.map(
    (candidate) => results.get(candidate) ?? { path: typeof candidate === "string" ? candidate : "", status: "invalid" },
  );
}

export function parseCommits(value: string): GitCommit[] {
  return value
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", shortSha = "", subject = "", author = "", authoredAt = ""] = record.split("\x00");
      return { sha, shortSha, subject, author, authoredAt };
    });
}

export async function listCommits(directory: string, limit: number): Promise<GitCommit[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
  const { stdout } = await execFileAsync(
    "git",
    ["-C", directory, "log", "-n", String(safeLimit), "--date=iso-strict", "--pretty=format:%H%x00%h%x00%s%x00%an%x00%aI%x1e"],
    { timeout: 10_000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" },
  );
  return parseCommits(stdout);
}
