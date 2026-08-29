// client/lib/projectPath.ts
//
// Splits a discovered project's relativePath into its project and workspace
// halves, using the same "<project>.worktrees/<name>" convention project
// discovery itself produces for a git worktree sibling directory (see
// server/projects.ts and the "Git worktrees" convention in AGENTS.md). This
// is a manually-created git worktree sibling, distinct from the in-app
// "Isolated workspace" feature tracked separately via GET /api/worktrees —
// both happen to share the same naming convention.

const WORKTREE_MARKER = ".worktrees/";

export interface ProjectWorkspacePath {
  project: string;
  /** Present only when relativePath contains the .worktrees/ marker. */
  workspace?: string;
}

export function splitProjectWorkspace(relativePath: string): ProjectWorkspacePath {
  const index = relativePath.indexOf(WORKTREE_MARKER);
  if (index === -1) return { project: relativePath };
  return {
    project: relativePath.slice(0, index),
    workspace: relativePath.slice(index + WORKTREE_MARKER.length),
  };
}
