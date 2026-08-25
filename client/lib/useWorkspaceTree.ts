// client/lib/useWorkspaceTree.ts
//
// Directory state for the Files tab.
//
// Lazy by directory, because `GET /workspace/tree` lists one level and every
// listed path costs the BFF a containment check. Eagerly walking a repository
// to render a tree would spend hundreds of upstream calls to show three rows.
//
// A directory is fetched at most once per project unless a caller forces a
// reload, and a failed fetch is forgotten so opening the row can retry.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type WorkspaceNode } from "./api.js";

export const WORKSPACE_TREE_ROOT = "";

export interface WorkspaceTree {
  /** Listed children by directory path. Absent means "not fetched yet". */
  children: ReadonlyMap<string, WorkspaceNode[]>;
  expanded: ReadonlySet<string>;
  loading: ReadonlySet<string>;
  errors: ReadonlyMap<string, string>;
  toggle: (path: string) => void;
  /** Expand every ancestor of a file path and load them in order. */
  reveal: (filePath: string) => Promise<void>;
  retry: (path: string) => void;
}

/** `"a/b/c.ts"` → `["", "a", "a/b"]`. */
export function ancestorDirectories(filePath: string): string[] {
  const segments = filePath.split("/").filter(Boolean).slice(0, -1);
  const ancestors = [WORKSPACE_TREE_ROOT];
  let prefix = "";
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    ancestors.push(prefix);
  }
  return ancestors;
}

export function useWorkspaceTree(directory: string): WorkspaceTree {
  const [children, setChildren] = useState<ReadonlyMap<string, WorkspaceNode[]>>(() => new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([WORKSPACE_TREE_ROOT]));
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  const requested = useRef(new Set<string>());
  // Bumped on every project switch so a late response cannot repopulate the
  // tree of a project the reader already left.
  const generation = useRef(0);

  const load = useCallback(
    async (path: string, force = false) => {
      if (!directory) return;
      if (!force && requested.current.has(path)) return;
      requested.current.add(path);
      const mine = generation.current;
      setLoading((previous) => new Set(previous).add(path));
      try {
        const tree = await api.workspaceTree(directory, path);
        if (generation.current !== mine) return;
        setChildren((previous) => new Map(previous).set(path, [...tree.dirs, ...tree.files]));
        setErrors((previous) => {
          if (!previous.has(path)) return previous;
          const next = new Map(previous);
          next.delete(path);
          return next;
        });
      } catch (error) {
        if (generation.current !== mine) return;
        // Forget the attempt so the row can be opened again to retry.
        requested.current.delete(path);
        setErrors((previous) =>
          new Map(previous).set(path, error instanceof Error ? error.message : String(error)),
        );
      } finally {
        if (generation.current === mine) {
          setLoading((previous) => {
            const next = new Set(previous);
            next.delete(path);
            return next;
          });
        }
      }
    },
    [directory],
  );

  useEffect(() => {
    generation.current += 1;
    requested.current = new Set();
    setChildren(new Map());
    setExpanded(new Set([WORKSPACE_TREE_ROOT]));
    setLoading(new Set());
    setErrors(new Map());
    void load(WORKSPACE_TREE_ROOT);
  }, [load]);

  const toggle = useCallback(
    (path: string) => {
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      void load(path);
    },
    [load],
  );

  const reveal = useCallback(
    async (filePath: string) => {
      const ancestors = ancestorDirectories(filePath);
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const ancestor of ancestors) next.add(ancestor);
        return next;
      });
      // Sequential: a child directory cannot be listed before its parent has
      // told us it exists, and the depth here is small.
      for (const ancestor of ancestors) await load(ancestor);
    },
    [load],
  );

  const retry = useCallback((path: string) => void load(path, true), [load]);

  return useMemo(
    () => ({ children, expanded, loading, errors, toggle, reveal, retry }),
    [children, errors, expanded, loading, retry, reveal, toggle],
  );
}
