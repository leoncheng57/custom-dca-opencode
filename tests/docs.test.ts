import { describe, expect, it } from "vitest";

import { markdownToHtml } from "../client/ds/markdown.js";
import { DOCS, getDoc, rewriteDocLinks } from "../client/lib/docs.js";

describe("documentation catalogue", () => {
  it("uses unique slugs and source paths", () => {
    expect(new Set(DOCS.map((doc) => doc.slug)).size).toBe(DOCS.length);
    expect(new Set(DOCS.map((doc) => doc.sourcePath)).size).toBe(DOCS.length);
    expect(getDoc("architecture")?.sourcePath).toBe("docs/architecture.md");
    expect(getDoc("current-opencode-subagents")?.sourcePath).toBe("docs/current-opencode-subagents-guide.md");
    expect(getDoc("missing")).toBeUndefined();
  });

  it("routes catalogued relative links in-app and unknown files to GitHub", () => {
    const source = [
      "[Contributing](../CONTRIBUTING.md)",
      "[Audit](opencode-1.18.21-api-audit.md#result)",
      "[Implementation](internal/detail.md)",
      "[External](https://example.com/docs)",
    ].join("\n");

    expect(rewriteDocLinks(source, "docs/architecture.md")).toBe([
      "[Contributing](/docs/contributing)",
      "[Audit](/docs/opencode-api-audit#result)",
      "[Implementation](https://github.com/leoncheng57/custom-dca-opencode/blob/main/docs/internal/detail.md)",
      "[External](https://example.com/docs)",
    ].join("\n"));
  });
});

describe("documentation markdown links", () => {
  it("keeps app links in this tab without changing external link behavior", () => {
    const html = markdownToHtml("[Architecture](/docs/architecture) [Source](https://example.com)", {
      internalLinksInSameTab: true,
    });
    expect(html).toContain('<a href="/docs/architecture">Architecture</a>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">Source</a>');
  });
});
