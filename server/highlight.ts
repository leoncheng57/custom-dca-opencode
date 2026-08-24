// server/highlight.ts
//
// Syntax highlighting for the read-only file viewer, performed here rather than
// in the browser.
//
// WHY SERVER-SIDE. The client bundle carries no highlighter and no design-system
// dependency was willing to grow by one: Shiki's own published figures put the
// full browser bundle at ~1.3 MB gzipped and even `shiki/core` at ~34 KB plus a
// WASM engine. Rendering here costs the browser zero bytes and still produces
// VS Code-grade grammars, which matters more on a phone over Tailscale than on
// the desktop.
//
// WHY ONE PAYLOAD SERVES BOTH THEMES. `defaultColor: false` makes Shiki emit
// only `--shiki-light` / `--shiki-dark` custom properties and never a literal
// `color` or `background-color`. The theme switch is therefore pure CSS
// (`.dark` in client/theme/tokens.css), so a cached entry is valid for both
// appearances and no inline style fights the design tokens. This is the one
// place raw hex reaches the DOM, and it arrives as generated grammar colours
// from a named theme rather than authored component styling.
//
// WHY THE CACHE IS KEYED BY CONTENT HASH. There is no mtime, etag or revision
// anywhere on the OpenCode file API — a scan of the 1.18.21 `/doc` for
// `mtime|etag|revision|lock|checksum` matches no schema property. Hashing the
// content we already hold needs no extra syscall and, unlike a timestamp,
// cannot go stale or collide across two projects that share a path.

import { createHash } from "node:crypto";
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from "shiki";

const THEMES = { light: "github-light", dark: "github-dark" } as const;

/**
 * Highlighting is linear in input size and synchronous once started, so an
 * oversized file would stall the event loop for every other request and inflate
 * a mobile payload for no benefit. Past either cap the viewer falls back to
 * plain text and says so.
 */
export const MAX_HIGHLIGHT_BYTES = 512 * 1024;
export const MAX_HIGHLIGHT_LINES = 20_000;

/** Entries are whole highlighted files, so this is bounded by count, not bytes. */
const CACHE_LIMIT = 64;

export type HighlightSkipReason = "too-large" | "unsupported-language" | "unavailable";

export interface Highlighted {
  /** A complete `<pre class="shiki">` whose only colours are CSS variables. */
  html: string;
  language: string;
}

export interface HighlightSkipped {
  skipped: HighlightSkipReason;
}

export type HighlightOutcome = Highlighted | HighlightSkipped;

export function isHighlighted(outcome: HighlightOutcome): outcome is Highlighted {
  return !("skipped" in outcome);
}

/**
 * Extension to Shiki grammar id. Deliberately a curated list rather than
 * Shiki's full 346-grammar bundle: every entry here is a language this project
 * or its neighbours actually contain, and an unmapped extension degrades to
 * readable plain text rather than to a wrong grammar.
 */
const EXTENSION_LANGUAGES: Record<string, string> = {
  astro: "astro",
  bash: "shellscript",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  dart: "dart",
  diff: "diff",
  ex: "elixir",
  exs: "elixir",
  fish: "fish",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "c",
  hcl: "hcl",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  less: "less",
  lua: "lua",
  markdown: "markdown",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  patch: "diff",
  php: "php",
  pl: "perl",
  proto: "proto",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scala: "scala",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  svelte: "svelte",
  svg: "xml",
  swift: "swift",
  tf: "terraform",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shellscript",
};

/**
 * Extensionless or dot-prefixed files that still have a known grammar.
 *
 * `.gitignore` and friends are absent on purpose: Shiki bundles no `ignore`
 * grammar, and plain text reads better than a grammar chosen for looking
 * approximately right.
 */
const FILENAME_LANGUAGES: Record<string, string> = {
  ".bashrc": "shellscript",
  ".editorconfig": "ini",
  ".npmrc": "ini",
  ".profile": "shellscript",
  ".zshrc": "shellscript",
  "cmakelists.txt": "cmake",
  dockerfile: "docker",
  gemfile: "ruby",
  makefile: "make",
  rakefile: "ruby",
};

function supported(language: string | undefined): string | null {
  if (!language) return null;
  return language in bundledLanguages ? language : null;
}

/**
 * Test seam. `supported()` already stops an unbundled id from reaching
 * loadLanguage, but it does so by silently returning plain text — so a typo
 * like "typscript" would disable a mapping with no error anywhere. Exposing
 * the tables lets a test assert every entry still resolves.
 */
export function mappedLanguages(): string[] {
  return [...new Set([...Object.values(EXTENSION_LANGUAGES), ...Object.values(FILENAME_LANGUAGES)])];
}

export function isBundledLanguage(language: string): boolean {
  return language in bundledLanguages;
}

/**
 * Resolve a Shiki grammar for a workspace-relative path, or null when the file
 * should render as plain text.
 */
export function detectLanguage(relativePath: string): string | null {
  const base = relativePath.split("/").pop()?.toLowerCase() ?? "";
  if (!base) return null;

  const byName = supported(FILENAME_LANGUAGES[base]);
  if (byName) return byName;

  // A dotfile such as ".gitignore" has its only dot at index 0 and is named
  // above; treating that as an extension would look up "gitignore".
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return supported(EXTENSION_LANGUAGES[base.slice(dot + 1)]);
}

const cache = new Map<string, Highlighted>();

function cacheKey(content: string, language: string): string {
  return `${language}:${createHash("sha256").update(content).digest("hex")}`;
}

let highlighterPromise: Promise<Highlighter> | null = null;

function highlighter(): Promise<Highlighter> {
  // Grammars load lazily via loadLanguage, so startup stays cheap and a project
  // that only contains TypeScript never compiles the other 345.
  highlighterPromise ??= createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [],
  }).catch((error: unknown) => {
    // Let a later request retry rather than caching the failure forever.
    highlighterPromise = null;
    throw error;
  });
  return highlighterPromise;
}

function countLines(content: string): number {
  let lines = 1;
  for (let index = content.indexOf("\n"); index !== -1; index = content.indexOf("\n", index + 1)) lines += 1;
  return lines;
}

/**
 * Highlight a text file, or explain why it was left as plain text.
 *
 * Never throws: highlighting is a presentation nicety, and a grammar that fails
 * to load must not turn a readable file into an error page.
 */
export async function highlightSource(content: string, relativePath: string): Promise<HighlightOutcome> {
  if (Buffer.byteLength(content, "utf8") > MAX_HIGHLIGHT_BYTES) return { skipped: "too-large" };

  const language = detectLanguage(relativePath);
  if (!language) return { skipped: "unsupported-language" };
  if (countLines(content) > MAX_HIGHLIGHT_LINES) return { skipped: "too-large" };

  const key = cacheKey(content, language);
  const hit = cache.get(key);
  if (hit) {
    // Re-insert so eviction is least-recently-used, not insertion-order.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  try {
    const shiki = await highlighter();
    if (!shiki.getLoadedLanguages().includes(language)) {
      await shiki.loadLanguage(language as BundledLanguage);
    }
    const html = shiki.codeToHtml(content, {
      lang: language,
      themes: THEMES,
      defaultColor: false,
    });
    const result: Highlighted = { html, language };
    cache.set(key, result);
    for (const oldest of cache.keys()) {
      if (cache.size <= CACHE_LIMIT) break;
      cache.delete(oldest);
    }
    return result;
  } catch {
    return { skipped: "unavailable" };
  }
}

/** Test seam: highlighting is process-global, so suites must be able to reset it. */
export function clearHighlightCache(): void {
  cache.clear();
}
