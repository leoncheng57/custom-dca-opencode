// client/components/code-viewer.tsx
//
// Read-only source viewer. Loaded lazily (`React.lazy` in workspace-files.tsx)
// so CodeMirror and its grammars stay out of the main bundle — a reader who
// never opens a file never downloads a parser.
//
// CodeMirror 6 rather than Monaco or an embedded IDE: it works on mobile
// browsers, virtualizes long documents, and ships line gutters, search and
// programmatic line navigation as small modules. Monaco does not support
// mobile, and OpenVSCode/Theia would add a second process, a second security
// surface and a competing notion of workspace state (see AGENTS.md).
//
// Read-only is enforced twice — `EditorState.readOnly` blocks document
// transactions, `EditorView.editable` removes the contenteditable affordance —
// because this surface must never imply the reader can save.

import { useEffect, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";

import type { WorkspaceTarget } from "../lib/fileReferences.js";

/**
 * Grammar for a path, or none.
 *
 * A deliberately short list: every grammar is bytes in the lazy chunk, and an
 * unknown extension renders as plain text rather than being guessed at.
 */
function languageFor(path: string): Extension | null {
  const extension = path.includes(".") ? (path.split(".").pop() ?? "").toLowerCase() : "";
  switch (extension) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
    case "jsonc":
      return json();
    case "css":
      return css();
    case "html":
    case "htm":
      return html();
    case "md":
    case "markdown":
      return markdown();
    case "py":
      return python();
    default:
      return null;
  }
}

const highlightLines = StateEffect.define<{ start: number; end: number } | null>();
const LINE_CLASS = Decoration.line({ class: "cm-referenced-line" });

/**
 * The temporary "here is what was cited" band.
 *
 * A field rather than a static decoration set because the same open file can
 * be re-targeted at a different range by a second reference, and rebuilding
 * the editor for that would discard the reader's scroll and search state.
 */
const referencedLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(highlightLines)) continue;
      if (!effect.value) {
        next = Decoration.none;
        continue;
      }
      const total = transaction.state.doc.lines;
      const start = Math.min(Math.max(effect.value.start, 1), total);
      const end = Math.min(Math.max(effect.value.end, start), total);
      const marks = [];
      for (let line = start; line <= end; line += 1) {
        marks.push(LINE_CLASS.range(transaction.state.doc.line(line).from));
      }
      next = Decoration.set(marks);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const THEME = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--color-text-default)",
    backgroundColor: "transparent",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    lineHeight: "1.55",
    overscrollBehavior: "contain",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-background-surface-neutral-muted)",
    color: "var(--color-text-muted)",
    border: "none",
    borderRight: "1px solid var(--color-border-default)",
  },
  ".cm-content": { caretColor: "transparent" },
  ".cm-referenced-line": { backgroundColor: "var(--color-background-surface-warning-muted)" },
  ".cm-panels": {
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-default)",
    border: "1px solid var(--color-border-default)",
  },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-default)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "4px",
  },
});

const wrapping = new Compartment();

export default function CodeViewer({
  path,
  content,
  target,
  wrap,
}: {
  path: string;
  content: string;
  /** Lines to reveal and band, when the reader arrived from a reference. */
  target?: WorkspaceTarget;
  wrap: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const language = languageFor(path);
    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          referencedLines,
          search({ top: true }),
          keymap.of(searchKeymap),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          ...(language ? [language] : []),
          wrapping.of(wrap ? EditorView.lineWrapping : []),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": `Contents of ${path}`, tabindex: "0" }),
          THEME,
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
  }, [content, path]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    if (target?.startLine === undefined) {
      instance.dispatch({ effects: highlightLines.of(null) });
      return;
    }
    const total = instance.state.doc.lines;
    const start = Math.min(Math.max(target.startLine, 1), total);
    const end = Math.min(Math.max(target.endLine ?? start, start), total);
    instance.dispatch({
      effects: [
        highlightLines.of({ start, end }),
        EditorView.scrollIntoView(instance.state.doc.line(start).from, { y: "center" }),
      ],
    });
  }, [content, path, target]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="opencode-code-viewer" data-path={path}>
      <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] px-2 py-1">
        <button
          type="button"
          className="min-h-8 rounded px-2 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--hh-row-hover)] hover:text-[var(--color-text-default)] pointer-coarse:min-h-11"
          onClick={() => {
            const instance = view.current;
            if (!instance) return;
            openSearchPanel(instance);
          }}
          data-testid="opencode-code-search"
        >
          Search in file
        </button>
        <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]" data-testid="opencode-code-lines">
          {content ? content.split("\n").length : 0} lines
        </span>
      </div>
      <div ref={host} className="thin-scrollbar min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
