// client/ds/markdown.tsx
//
// Lightweight markdown renderer used wherever the app needs to show
// a small slice of LLM-generated markdown (assistant prose in the
// follow-up activity log, and — historically — the ops-review draft
// preview, see OpsReviewDraftPreview.tsx for a near-identical
// in-house copy still in use there).
//
// The codebase has no markdown library on purpose: the supported
// surface is small (headings, bold/italic, inline code, links,
// unordered lists, paragraphs, horizontal rules) and is matched by
// the `prose-markdown` typography class in theme/tokens.css. If we ever need
// fenced code blocks, GFM tables, or nested lists in agent prose,
// reach for `react-markdown` + `remark-gfm` rather than extending
// this regex chain.

import { Fragment, memo, useMemo } from "react";

import { cn } from "./utils.js";

/** Allowed link protocols when rendering untrusted markdown. */
function isSafeHref(url: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url.trim());
}

/** Bare http(s) URL in plain text, for autolinking. Stops at whitespace,
 * angle brackets and quotes; trailing sentence punctuation is trimmed
 * separately by `splitTrailingPunctuation`. */
const BARE_URL_PATTERN = "https?:\\/\\/[^\\s<>\"']+";

/**
 * Split a matched URL into the link target and any trailing sentence
 * punctuation that shouldn't be part of it ("see https://x.dev." →
 * link https://x.dev, text "."). A closing paren stays in the URL only
 * while the URL still has an unmatched opening paren, so Wikipedia-style
 * `/Foo_(bar)` paths survive but a plain `(https://x.dev)` doesn't
 * swallow the `)`.
 */
function splitTrailingPunctuation(match: string): [url: string, trailing: string] {
  let end = match.length;
  while (end > 0) {
    const ch = match[end - 1];
    if (".,;:!?".includes(ch)) {
      end--;
    } else if (ch === ")") {
      const body = match.slice(0, end);
      const opens = (body.match(/\(/g) ?? []).length;
      const closes = (body.match(/\)/g) ?? []).length;
      if (closes > opens) end--;
      else break;
    } else {
      break;
    }
  }
  return [match.slice(0, end), match.slice(end)];
}

/** Escape raw HTML so it renders as text instead of markup. Quotes are
 * escaped too so escaped text can never terminate an HTML attribute. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Attribute-escape a URL for href="..." emission (defense in depth —
 * untrusted sources are already entity-escaped, but never trust the
 * pipeline). Percent-encodes quote and angle-bracket characters so the
 * href can neither terminate the attribute nor embed markup. */
function escapeAttribute(url: string): string {
  return url
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

export interface MarkdownToHtmlOpts {
  /**
   * Treat the source as untrusted: raw HTML is escaped to text before
   * markdown conversion, and link hrefs are restricted to
   * http(s)/mailto/relative. Use for any content that originates from
   * (or is synthesized from) external users — e.g. Hindsight bank
   * content built from Slack threads.
   */
  untrusted?: boolean;
  /** Keep root-relative and hash links in the current tab. Useful for
   * repository-owned documentation rendered inside the application. */
  internalLinksInSameTab?: boolean;
}

/**
 * Convert a small subset of markdown to HTML.
 *
 * Output is wrapped in a `prose-markdown` div so the typography rules
 * in `styles.css` apply. Used with `dangerouslySetInnerHTML`. For
 * agent-emitted assistant prose persisted server-side the default
 * (trusted) mode is acceptable — the regexes below only generate a
 * closed set of tags. For anything derived from external/user input,
 * pass `untrusted: true` (or `<Markdown untrusted>`), which escapes
 * raw HTML and drops javascript:-style link targets.
 */
export function markdownToHtml(md: string, opts?: MarkdownToHtmlOpts): string {
  if (opts?.untrusted) md = escapeHtml(md);
  // Placeholder stash: segments where the URL autolinker must not look
  // (code blocks, inline code, already-emitted <a> tags) are swapped for
  // NUL-delimited tokens and restored after autolinking. Strip NULs from
  // the source first so input can never spoof a token.
  const stash: string[] = [];
  const keep = (segment: string) => `\u0000${stash.push(segment) - 1}\u0000`;
  md = md.replace(/\u0000/g, "");
  // Fenced code blocks (must run before inline transforms)
  let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) =>
    keep(`<pre><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;").trimEnd()}</code></pre>`)
  );

  // GFM tables: detect consecutive lines with pipes
  html = html.replace(
    /(^\|.+\|$\n^\|[\s:|-]+\|$\n(^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const lines = tableBlock.trim().split("\n");
      if (lines.length < 2) return tableBlock;
      const parseRow = (line: string) =>
        line.split("|").slice(1, -1).map((c) => c.trim());
      const headers = parseRow(lines[0]);
      // lines[1] is the separator row — skip it
      const rows = lines.slice(2).map(parseRow);
      const headerHtml = headers.map((h) => `<th>${h}</th>`).join("");
      const bodyHtml = rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    },
  );

  html = html
    // Headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Horizontal rules
    .replace(/^---$/gm, "<hr/>")
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, (_match, code: string) => keep(`<code>${code}</code>`))
    // Links (untrusted mode: unsafe protocols render as plain text, and
    // the href is attribute-escaped so a crafted URL containing quotes
    // can't break out of the attribute — attribute-injection XSS)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text: string, url: string) => {
      if (opts?.untrusted) {
        if (!isSafeHref(url)) return text;
        const sameTab = opts.internalLinksInSameTab && /^(?:\/|#)/u.test(url.trim());
        const attributes = sameTab ? "" : ' target="_blank" rel="noreferrer"';
        return keep(`<a href="${escapeAttribute(url)}"${attributes}>${text}</a>`);
      }
      const sameTab = opts?.internalLinksInSameTab && /^(?:\/|#)/u.test(url.trim());
      const attributes = sameTab ? "" : ' target="_blank" rel="noreferrer"';
      return keep(`<a href="${url}"${attributes}>${text}</a>`);
    })
    // Autolink bare URLs in the remaining plain text — URLs inside code
    // or already-emitted links are stashed as tokens, so they're immune.
    // Scheme is fixed to http(s) by the pattern, so this is safe in
    // untrusted mode too.
    .replace(new RegExp(BARE_URL_PATTERN, "g"), (match) => {
      const [url, trailing] = splitTrailingPunctuation(match);
      if (!url) return match;
      return `${keep(`<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${url}</a>`)}${trailing}`;
    })
    // Restore stashed segments before block-level (list/paragraph) wrapping.
    .replace(/\u0000(\d+)\u0000/g, (_match, i: string) => stash[Number(i)]);

  // Unordered lists: consecutive lines starting with "- "
  html = html.replace(/(^- .+$(\n- .+$)*)/gm, (block) => {
    const items = block
      .split("\n")
      .map((l) => `<li>${l.replace(/^- /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Paragraphs: wrap remaining non-tag lines
  html = html
    .split("\n\n")
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return "";
      if (/^<(h[1-4]|ul|ol|hr|blockquote|pre|table)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

interface MarkdownProps {
  /** Raw markdown source. Empty/whitespace renders as nothing. */
  source: string;
  /** Optional extra classes appended to the `prose-markdown` wrapper. */
  className?: string;
  /** Escape raw HTML + restrict link protocols. Set for content derived
   * from external users (see markdownToHtml docs). */
  untrusted?: boolean;
  /** Keep root-relative and hash links in this tab. */
  internalLinksInSameTab?: boolean;
}

export const Markdown = memo(function Markdown({ source, className, untrusted, internalLinksInSameTab }: MarkdownProps) {
  const html = useMemo(
    () => markdownToHtml(source, { untrusted, internalLinksInSameTab }),
    [source, untrusted, internalLinksInSameTab],
  );
  if (!source || !source.trim()) return null;
  return (
    <div
      className={cn("prose-markdown", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/**
 * Render plain text with bare http(s) URLs turned into clickable links.
 * Emits real React elements (no innerHTML), so it is safe for raw user
 * input — use it where text should stay verbatim (e.g. chat user
 * bubbles) but pasted links should still open.
 */
export function LinkifiedText({ text }: { text: string }) {
  // Split on a capturing group: odd indices are the matched URLs.
  const parts = text.split(new RegExp(`(${BARE_URL_PATTERN})`, "g"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const [url, trailing] = splitTrailingPunctuation(part);
        return (
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}
