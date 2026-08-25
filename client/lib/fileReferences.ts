// client/lib/fileReferences.ts
//
// Turning "`scripts/launchd.ts:222`" in a transcript into something clickable.
//
// Two rules shape everything here:
//
//   1. The canonical contract is DATA, not a URL. A reference is a
//      `WorkspaceTarget`, which the drawer consumes directly. Encoding it into
//      a route would change the browser location, and opening a file must not
//      cost the reader their place in the transcript.
//
//   2. A match here grants NOTHING. `server/opencode/workspace.ts` re-runs
//      containment, ignored-file, sensitive-path and symlink checks on every
//      read. This module only decides what is worth *asking* about, so it is
//      free to be conservative: a rejected candidate renders as ordinary text,
//      which is exactly what it renders as today.
//
// Everything is pure and string-in/string-out so the accepted and rejected
// shapes can be enumerated in unit tests rather than driven through a browser.

import type { TranscriptEvent } from "./transcript.js";

/** A place in the workspace a reader asked to look at. */
export interface WorkspaceTarget {
  /** Workspace-relative, POSIX-separated, never absolute. */
  path: string;
  /** 1-based first line to reveal, when the reference named one. */
  startLine?: number;
  /** 1-based last line of an explicit range. Always >= `startLine`. */
  endLine?: number;
}

const MAX_PATH_CHARACTERS = 512;
const MAX_SEGMENTS = 32;
const MAX_LINE = 1_000_000;
/** Ceiling on candidates offered to the validator for one transcript. */
export const MAX_REFERENCE_CANDIDATES = 200;

/**
 * Segment charset.
 *
 * Deliberately narrower than the filesystem allows. Spaces, quotes, brackets
 * and shell metacharacters are how ordinary inline code (`npm test`,
 * `rm -rf *`) looks, and admitting them would turn most code spans into
 * validation traffic for paths that cannot exist.
 */
const SEGMENT = /^[A-Za-z0-9._@+-]+$/;
/** A trailing `.ts`, `.md`, … used to recognise a single-segment file name. */
const FILE_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;
/** Any scheme at all: `https:`, `file:`, `C:` on Windows. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
/** `#L12`, `#L12-L40`, `#L12-40` — the git permalink spelling. */
const HASH_RANGE = /#L(\d+)(?:-L?(\d+))?$/;
/** `:12`, `:12-40` — the compiler/grep spelling. */
const COLON_RANGE = /:(\d+)(?:-(\d+))?$/;

function lineNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_LINE ? value : undefined;
}

/**
 * Normalise one candidate into a target, or reject it.
 *
 * Rejected outright, per the issue's threat list: absolute paths, `~`, `..`,
 * `file://`, UNC and Windows drive paths, query strings, control characters,
 * whitespace, URLs, and fragments that are not a line range.
 */
export function parseWorkspaceReference(raw: string): WorkspaceTarget | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  // The suffix is small and bounded; the cap is on the path itself below.
  if (!value || value.length > MAX_PATH_CHARACTERS + 32) return null;
  // Whitespace and controls: a path containing either is prose, not a target.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.includes("\\")) return null;

  // `[route](file:server/routes/workspace.ts#L20)` is the explicit local-link
  // form. `file://…` is an absolute URL and stays rejected.
  if (/^file:(?!\/\/)/i.test(value)) value = value.slice("file:".length);
  if (SCHEME.test(value)) return null;
  if (value.startsWith("/") || value.startsWith("~") || value.startsWith("#")) return null;
  if (/[?"'<>|*]/.test(value)) return null;

  let startLine: number | undefined;
  let endLine: number | undefined;
  const hash = HASH_RANGE.exec(value);
  const colon = hash ? null : COLON_RANGE.exec(value);
  const match = hash ?? colon;
  if (match) {
    value = value.slice(0, match.index);
    startLine = lineNumber(match[1]);
    endLine = lineNumber(match[2]);
    // A malformed range is dropped rather than failing the whole reference:
    // the file is still the thing the reader asked for.
    if (startLine === undefined) endLine = undefined;
    else if (endLine !== undefined && endLine < startLine) endLine = undefined;
  }
  // A leftover `#` means the fragment was not a line range.
  if (value.includes("#")) return null;

  value = value.replace(/^\.\//, "");
  if (!value || value.length > MAX_PATH_CHARACTERS) return null;

  const segments = value.split("/");
  if (segments.length > MAX_SEGMENTS) return null;
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) return null;
    if (/^\.+$/.test(segment)) return null;
  }
  // Bare words are prose far more often than paths, and the issue rules out
  // inferring links from them. A candidate must look structurally like a file:
  // either it is nested, or its final segment carries an extension.
  if (segments.length === 1 && !FILE_EXTENSION.test(segments[0])) return null;

  return {
    path: segments.join("/"),
    ...(startLine !== undefined ? { startLine } : {}),
    ...(endLine !== undefined ? { endLine } : {}),
  };
}

/** Strip fenced blocks so a documented path stays documentation. */
function withoutFencedCode(source: string): string {
  return source.replace(/(^|\n)(```|~~~)[\s\S]*?(\n\2[ \t]*(?=\n|$)|$)/g, "$1");
}

const INLINE_CODE = /`([^`\n]+)`/g;
const MARKDOWN_LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g;

/**
 * Candidate strings from one markdown body.
 *
 * Only two node shapes are read: inline code spans and explicit links. Bare
 * prose is never scanned — "see the workspace route" must not become a button,
 * and neither must a path inside a fenced example.
 */
export function collectMarkdownReferences(source: string): string[] {
  if (!source) return [];
  const prose = withoutFencedCode(source);
  const found: string[] = [];
  for (const [, code] of prose.matchAll(INLINE_CODE)) found.push(code.trim());
  for (const [, href] of prose.matchAll(MARKDOWN_LINK)) found.push(href.trim());
  return found;
}

/**
 * Re-express an attachment's absolute path relative to the project.
 *
 * OpenCode file parts carry absolute paths. The transcript contract keeps them
 * that way (`Attachment.path`), so this conversion lives in the UI layer and
 * takes plain strings — no component learns anything about OpenCode shapes.
 */
export function workspaceRelativePath(absolute: string, directory: string): string | null {
  if (!absolute || !directory) return null;
  const root = directory.replace(/\/+$/, "");
  if (!absolute.startsWith("/")) return absolute;
  if (absolute === root) return null;
  return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : null;
}

/**
 * Every path in a transcript worth asking the workspace about, deduplicated.
 *
 * Derived from `TranscriptEvent` rather than from rendering, so validation is
 * one bounded batch per transcript instead of one request per rendered span,
 * and so the set is testable without a DOM.
 */
export function referenceCandidatesFromEvents(
  events: readonly TranscriptEvent[],
  directory: string,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | undefined | null) => {
    if (!candidate || paths.length >= MAX_REFERENCE_CANDIDATES) return;
    const target = parseWorkspaceReference(candidate);
    if (!target || seen.has(target.path)) return;
    seen.add(target.path);
    paths.push(target.path);
  };

  for (const event of events) {
    if (event.kind === "agent") {
      for (const candidate of collectMarkdownReferences(event.text)) add(candidate);
    }
    if (event.kind === "user" || event.kind === "tool") {
      for (const attachment of event.attachments) {
        add(attachment.path ? workspaceRelativePath(attachment.path, directory) : null);
      }
    }
  }
  return paths;
}

/** Human-readable suffix for accessible names and breadcrumbs. */
export function describeLineRange(target: WorkspaceTarget): string {
  if (target.startLine === undefined) return "";
  if (target.endLine === undefined || target.endLine === target.startLine) {
    return ` line ${target.startLine}`;
  }
  return ` lines ${target.startLine} to ${target.endLine}`;
}
