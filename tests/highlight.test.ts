import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_HIGHLIGHT_BYTES,
  MAX_HIGHLIGHT_LINES,
  clearHighlightCache,
  detectLanguage,
  highlightSource,
  isBundledLanguage,
  isHighlighted,
  mappedLanguages,
} from "../server/highlight.js";

beforeEach(() => {
  clearHighlightCache();
});

describe("language detection", () => {
  it("maps common extensions to bundled grammars", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
    expect(detectLanguage("client/pages/Files.tsx")).toBe("tsx");
    expect(detectLanguage("package.json")).toBe("json");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("scripts/dev.sh")).toBe("shellscript");
    expect(detectLanguage("deploy/config.yml")).toBe("yaml");
  });

  it("matches by whole filename when there is no useful extension", () => {
    expect(detectLanguage("Dockerfile")).toBe("docker");
    expect(detectLanguage("nested/Makefile")).toBe("make");
    // A dotfile's only dot is at index 0, so it must match by name; treating
    // that as an extension would look up "npmrc" and miss.
    expect(detectLanguage(".npmrc")).toBe("ini");
  });

  it("maps only grammars Shiki actually bundles", () => {
    // supported() stops an unbundled id from reaching loadLanguage, but it does
    // so silently, so a typo like "typscript" would disable a mapping with no
    // error. Every table entry must resolve or this is dead configuration.
    expect(mappedLanguages().filter((language) => !isBundledLanguage(language))).toEqual([]);
  });

  it("degrades rather than guessing when no grammar exists", () => {
    // Shiki bundles no `ignore` grammar; plain text beats an approximate one.
    expect(detectLanguage(".gitignore")).toBeNull();
  });

  it("returns null rather than guessing a grammar", () => {
    expect(detectLanguage("notes.unknownext")).toBeNull();
    expect(detectLanguage("LICENSE")).toBeNull();
    expect(detectLanguage("archive.tar.zzz")).toBeNull();
    expect(detectLanguage("trailing.")).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });

  it("is case-insensitive on both name and extension", () => {
    expect(detectLanguage("DOCKERFILE")).toBe("docker");
    expect(detectLanguage("Main.PY")).toBe("python");
  });
});

describe("highlightSource", () => {
  it("emits theme variables and per-line spans, never a literal colour", async () => {
    const outcome = await highlightSource("const a = 1;\nexport default a;\n", "src/a.ts");
    expect(isHighlighted(outcome)).toBe(true);
    if (!isHighlighted(outcome)) return;

    expect(outcome.language).toBe("typescript");
    // The gutter counter and the plain-text fallback both key off .line.
    expect(outcome.html.match(/class="line"/g)).toHaveLength(3);
    expect(outcome.html).toContain("--shiki-light:");
    expect(outcome.html).toContain("--shiki-dark:");
    // defaultColor:false is what lets one payload serve light and dark. If it
    // regresses, Shiki emits `color:#...` inline and the theme switch breaks.
    expect(outcome.html).not.toMatch(/style="[^"]*[^-]color:/);
    expect(outcome.html).not.toMatch(/background-color:/);
  });

  it("escapes source so file content cannot inject markup", async () => {
    const outcome = await highlightSource('const x = "<img src=x onerror=alert(1)>";', "src/x.ts");
    expect(isHighlighted(outcome)).toBe(true);
    if (!isHighlighted(outcome)) return;
    expect(outcome.html).not.toContain("<img");
    expect(outcome.html).toContain("&#x3C;img");
  });

  it("falls back to plain text for an unmapped extension", async () => {
    const outcome = await highlightSource("anything at all", "notes.unknownext");
    expect(outcome).toEqual({ skipped: "unsupported-language" });
  });

  it("refuses files past the byte cap before choosing a grammar", async () => {
    const outcome = await highlightSource("x".repeat(MAX_HIGHLIGHT_BYTES + 1), "big.ts");
    expect(outcome).toEqual({ skipped: "too-large" });
  });

  it("refuses files past the line cap", async () => {
    // Short lines keep this well under the byte cap, so only the line cap can
    // reject it.
    const outcome = await highlightSource("a\n".repeat(MAX_HIGHLIGHT_LINES + 1), "many.ts");
    expect(outcome).toEqual({ skipped: "too-large" });
  });

  it("counts bytes, not characters, against the byte cap", async () => {
    // Just under the cap in UTF-16 code units, comfortably over it in UTF-8.
    const outcome = await highlightSource("é".repeat(MAX_HIGHLIGHT_BYTES - 1), "accents.ts");
    expect(outcome).toEqual({ skipped: "too-large" });
  });

  it("serves a repeated read from cache with identical markup", async () => {
    const source = "export const cached = true;";
    const first = await highlightSource(source, "src/cached.ts");
    const second = await highlightSource(source, "src/cached.ts");
    expect(isHighlighted(first) && isHighlighted(second)).toBe(true);
    if (!isHighlighted(first) || !isHighlighted(second)) return;
    expect(second.html).toBe(first.html);
  });

  it("keys the cache by content, so an edited file re-highlights", async () => {
    const before = await highlightSource("const value = 1;", "src/edited.ts");
    const after = await highlightSource("const value = 2;", "src/edited.ts");
    expect(isHighlighted(before) && isHighlighted(after)).toBe(true);
    if (!isHighlighted(before) || !isHighlighted(after)) return;
    // There is no mtime or etag upstream to invalidate on, so identical paths
    // with different content must not collide.
    expect(after.html).not.toBe(before.html);
  });

  it("keys the cache by language, so the same bytes differ by file type", async () => {
    const asTypescript = await highlightSource("x = 1", "same.ts");
    const asPython = await highlightSource("x = 1", "same.py");
    expect(isHighlighted(asTypescript) && isHighlighted(asPython)).toBe(true);
    if (!isHighlighted(asTypescript) || !isHighlighted(asPython)) return;
    expect(asTypescript.language).toBe("typescript");
    expect(asPython.language).toBe("python");
  });

  it("loads a grammar it has not seen before", async () => {
    const outcome = await highlightSource("fn main() {}", "src/main.rs");
    expect(isHighlighted(outcome)).toBe(true);
    if (!isHighlighted(outcome)) return;
    expect(outcome.language).toBe("rust");
  });

  it("preserves a file with no trailing newline as one span per line", async () => {
    // OpenCode's /file/content strips the trailing newline, so this is the
    // shape the viewer actually receives.
    const outcome = await highlightSource("a = 1\nb = 2", "pair.py");
    expect(isHighlighted(outcome)).toBe(true);
    if (!isHighlighted(outcome)) return;
    expect(outcome.html.match(/class="line"/g)).toHaveLength(2);
  });
});
