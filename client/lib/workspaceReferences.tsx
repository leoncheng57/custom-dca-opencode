// client/lib/workspaceReferences.tsx
//
// The bridge between "this transcript mentions some paths" and "this span is a
// button". Two responsibilities, deliberately split from rendering:
//
//   - batching. Candidates are collected from the frozen TranscriptEvent list
//     (see fileReferences.ts), deduplicated, and validated in chunks. Rendering
//     never issues a request, so a streaming turn cannot turn into a request
//     storm, and an unvalidated span simply renders the way it does today.
//
//   - scope. The resolver reaches components through context rather than props,
//     because the markdown renderer is shared with untrusted forge content that
//     must never gain workspace affordances. No provider means no buttons.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { WORKSPACE_REFERENCE_BATCH, api } from "./api.js";
import { parseWorkspaceReference, workspaceRelativePath, type WorkspaceTarget } from "./fileReferences.js";

interface WorkspaceReferenceIndex {
  /** Project the paths are relative to; attachments arrive absolute. */
  directory: string;
  /** Canonical path for a verified candidate, or undefined while unverified. */
  resolved: ReadonlyMap<string, string>;
  open: (target: WorkspaceTarget) => void;
}

const WorkspaceReferenceContext = createContext<WorkspaceReferenceIndex | null>(null);

/**
 * Validate every unseen candidate, in server-sized chunks.
 *
 * A candidate is remembered as asked-about even when the request fails, so a
 * failing workspace degrades to plain text once instead of retrying on every
 * poll of a live transcript.
 */
export function useWorkspaceReferences(directory: string, candidates: string[]): ReadonlyMap<string, string> {
  const [resolved, setResolved] = useState<ReadonlyMap<string, string>>(() => new Map());
  const asked = useRef<{ directory: string; paths: Set<string> }>({ directory, paths: new Set() });

  useEffect(() => {
    if (!directory) return;
    if (asked.current.directory !== directory) {
      asked.current = { directory, paths: new Set() };
      setResolved(new Map());
    }
    const pending = candidates.filter((path) => !asked.current.paths.has(path));
    if (pending.length === 0) return;
    for (const path of pending) asked.current.paths.add(path);

    const controller = new AbortController();
    void (async () => {
      for (let index = 0; index < pending.length; index += WORKSPACE_REFERENCE_BATCH) {
        const chunk = pending.slice(index, index + WORKSPACE_REFERENCE_BATCH);
        try {
          const result = await api.workspaceReferences(directory, chunk, controller.signal);
          if (controller.signal.aborted) return;
          setResolved((previous) => {
            const next = new Map(previous);
            for (const reference of result.references) {
              if (reference.status === "file") next.set(reference.path, reference.resolvedPath ?? reference.path);
            }
            return next;
          });
        } catch {
          // Unverified stays inert. There is nothing useful to show a reader
          // here, and a banner per unreachable path would be worse than none.
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [candidates, directory]);

  return resolved;
}

export function WorkspaceReferenceProvider({
  directory,
  resolved,
  onOpen,
  children,
}: {
  directory: string;
  resolved: ReadonlyMap<string, string>;
  onOpen: (target: WorkspaceTarget) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ directory, resolved, open: onOpen }), [directory, resolved, onOpen]);
  return <WorkspaceReferenceContext.Provider value={value}>{children}</WorkspaceReferenceContext.Provider>;
}

/**
 * Resolve one candidate string to an openable target.
 *
 * Returns null unless a provider is present *and* the workspace confirmed the
 * path is a readable file. The canonical path from the server replaces the
 * candidate, so a symlink alias cannot be re-resolved to a different target.
 */
export function useWorkspaceReference(
  candidate: string,
): { target: WorkspaceTarget; open: () => void } | null {
  const index = useContext(WorkspaceReferenceContext);
  return useMemo(() => {
    if (!index) return null;
    const parsed = parseWorkspaceReference(candidate);
    if (!parsed) return null;
    const path = index.resolved.get(parsed.path);
    if (!path) return null;
    const target = { ...parsed, path };
    return { target, open: () => index.open(target) };
  }, [candidate, index]);
}

/**
 * The same lookup for a structured attachment, whose path arrives absolute.
 *
 * Relativising here rather than in the adapter keeps `Attachment.path` as the
 * backend states it, so no row component has to learn what an OpenCode file
 * part looks like.
 */
export function useWorkspaceAttachmentReference(
  absolutePath: string | undefined,
): { target: WorkspaceTarget; open: () => void } | null {
  const index = useContext(WorkspaceReferenceContext);
  return useMemo(() => {
    if (!index || !absolutePath) return null;
    const relative = workspaceRelativePath(absolutePath, index.directory);
    if (!relative) return null;
    const parsed = parseWorkspaceReference(relative);
    if (!parsed) return null;
    const path = index.resolved.get(parsed.path);
    if (!path) return null;
    const target = { ...parsed, path };
    return { target, open: () => index.open(target) };
  }, [absolutePath, index]);
}
