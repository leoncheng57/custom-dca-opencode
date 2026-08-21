import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { request, type OpencodeConfig } from "./client.js";
import { isSensitiveWorkspacePath } from "../paths.js";

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
