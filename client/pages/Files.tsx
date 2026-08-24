import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, Copy, Folder, FileText, WrapText } from "lucide-react";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { cn } from "../ds/utils.js";
import { api, type HighlightSkipReason, type WorkspaceFile, type WorkspaceNode } from "../lib/api.js";

const DIRECTORY_KEY = "opencode.directory.v1";
const WRAP_KEY = "opencode.filesWrap.v1";

/**
 * Above this the viewer stops emitting one element per line. React copes with
 * a few thousand, but a multi-megabyte minified bundle would freeze the tab,
 * and line numbers on such a file are not what anyone opened it for.
 */
const MAX_LINE_ELEMENTS = 20_000;

const SKIP_MESSAGE: Record<HighlightSkipReason, string> = {
  "too-large": "Too large to highlight — showing plain text.",
  "unsupported-language": "No grammar for this file type — showing plain text.",
  unavailable: "Highlighting unavailable — showing plain text.",
};

function parentOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

/**
 * Plain-text fallback shaped exactly like Shiki's output — a `<pre>` of
 * `<span class="line">` with the newline outside the span — so one set of
 * gutter and wrapping rules in tokens.css styles both paths.
 *
 * Note that OpenCode's `/file/content` strips a file's trailing newline, so
 * splitting here never produces a phantom final blank line.
 */
function PlainCode({ content }: { content: string }) {
  const lines = content.split("\n");
  if (lines.length > MAX_LINE_ELEMENTS) {
    return <pre className="whitespace-pre">{content}</pre>;
  }
  return (
    <pre>
      <code>
        {lines.map((line, index) => (
          <Fragment key={index}>
            <span className="line">{line}</span>
            {"\n"}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

export function FilesPage() {
  const [params, setParams] = useSearchParams();
  const directory = params.get("directory") ?? localStorage.getItem(DIRECTORY_KEY) ?? "";
  const browsePath = params.get("path") ?? "";
  const filePath = params.get("file") ?? "";

  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [file, setFile] = useState<WorkspaceFile | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  // Two panes, two errors. A shared slot lets whichever request settles last
  // win, so a listable directory would silently clear a refused file read.
  const [treeError, setTreeError] = useState("");
  const [fileError, setFileError] = useState("");
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(WRAP_KEY, wrap ? "1" : "0");
  }, [wrap]);

  // Keep the URL authoritative: both panes are deep-linkable, and back/forward
  // move between files rather than leaving the page.
  const navigate = (next: { path?: string; file?: string }) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value);
      else updated.delete(key);
    }
    setParams(updated, { replace: false });
  };

  useEffect(() => {
    if (!directory) return;
    let active = true;
    setTreeLoading(true);
    api
      .workspaceTree(directory, browsePath)
      .then((tree) => {
        if (!active) return;
        setNodes([...tree.dirs, ...tree.files]);
        setTreeError("");
      })
      .catch((e: Error) => active && setTreeError(e.message))
      .finally(() => active && setTreeLoading(false));
    return () => {
      active = false;
    };
  }, [directory, browsePath]);

  useEffect(() => {
    if (!directory || !filePath) {
      setFile(null);
      setFileError("");
      return;
    }
    let active = true;
    setFileLoading(true);
    setCopied(false);
    api
      .workspaceFile(directory, filePath, { highlight: true })
      .then((loaded) => {
        if (!active) return;
        setFile(loaded);
        setFileError("");
      })
      .catch((e: Error) => {
        if (!active) return;
        setFile(null);
        setFileError(e.message);
      })
      .finally(() => active && setFileLoading(false));
    return () => {
      active = false;
    };
  }, [directory, filePath]);

  const copy = () => {
    if (!file) return;
    void navigator.clipboard.writeText(file.content).then(
      () => setCopied(true),
      () => setFileError("Clipboard write was blocked by the browser."),
    );
  };

  if (!directory) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6" data-testid="opencode-files">
        <h1 className="text-xl font-bold">Files</h1>
        <Alert variant="warning">Open a project on the home page first.</Alert>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col" data-testid="opencode-files">
      <div className="flex min-h-0 flex-1">
        {/* Master-detail below lg: the tree yields the whole screen to a file
            once one is open. Purely class-driven so a resize needs no state. */}
        <nav
          aria-label="Workspace files"
          className={cn(
            "min-h-0 w-full shrink-0 overflow-y-auto border-[var(--color-border-default)] p-2 lg:block lg:w-72 lg:border-r",
            filePath ? "hidden" : "block",
          )}
          data-testid="opencode-files-tree"
        >
          {treeError && (
            <div className="mb-2">
              <Alert variant="danger">{treeError}</Alert>
            </div>
          )}
          <button
            type="button"
            disabled={!browsePath}
            onClick={() => navigate({ path: parentOf(browsePath) })}
            className="mb-1 flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-background-surface-neutral-muted)] disabled:opacity-40 lg:min-h-8"
            data-testid="opencode-files-up"
          >
            <ChevronLeft aria-hidden="true" size={14} />
            <span className="truncate">{browsePath || "workspace root"}</span>
          </button>
          {treeLoading && nodes.length === 0 && <LoadingIndicator className="py-6" size="sm" />}
          {nodes.map((node) => (
            <button
              key={node.path}
              type="button"
              onClick={() =>
                node.type === "directory" ? navigate({ path: node.path, file: "" }) : navigate({ file: node.path })
              }
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-[var(--color-background-surface-neutral-muted)] lg:min-h-8",
                node.path === filePath && "bg-[var(--color-background-surface-neutral-muted)] font-semibold",
              )}
              data-testid="opencode-file-node"
            >
              {node.type === "directory" ? (
                <Folder aria-hidden="true" className="shrink-0 text-[var(--color-text-muted)]" size={14} />
              ) : (
                <FileText aria-hidden="true" className="shrink-0 text-[var(--color-text-muted)]" size={14} />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          ))}
          {!treeLoading && nodes.length === 0 && (
            <p className="p-2 text-xs text-[var(--color-text-muted)]">Nothing readable here.</p>
          )}
        </nav>

        <section
          className={cn("min-w-0 flex-1 flex-col lg:flex", filePath ? "flex" : "hidden lg:flex")}
          data-testid="opencode-file-viewer"
        >
          {!filePath ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)]">Select a file to read it.</p>
          ) : (
            <>
              <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-3 py-2">
                <Button
                  className="lg:hidden"
                  onClick={() => navigate({ file: "" })}
                  size="sm"
                  variant="ghost"
                  data-testid="opencode-file-back"
                >
                  <ChevronLeft aria-hidden="true" size={14} />
                  Files
                </Button>
                <h1 className="min-w-0 flex-1 truncate font-mono text-xs" title={filePath}>
                  {filePath}
                </h1>
                {file?.highlight && <Badge variant="neutral">{file.highlight.language}</Badge>}
                <Button
                  aria-pressed={wrap}
                  onClick={() => setWrap((value) => !value)}
                  size="sm"
                  title="Toggle soft wrap"
                  variant={wrap ? "primary" : "secondary"}
                  data-testid="opencode-file-wrap"
                >
                  <WrapText aria-hidden="true" size={14} />
                  <span className="ml-1.5 hidden sm:inline">Wrap</span>
                </Button>
                <Button
                  disabled={!file || file.type !== "text"}
                  onClick={copy}
                  size="sm"
                  variant="secondary"
                  data-testid="opencode-file-copy"
                >
                  <Copy aria-hidden="true" size={14} />
                  <span className="ml-1.5 hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                </Button>
              </header>

              {file?.highlightSkipped && (
                <p className="border-b border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
                  {SKIP_MESSAGE[file.highlightSkipped]}
                </p>
              )}

              {fileError ? (
                // Deliberately replaces the content pane rather than sitting
                // above it: a refused read has nothing to show underneath.
                <div className="p-3">
                  <Alert variant="danger">{fileError}</Alert>
                </div>
              ) : (
                <div
                  className={cn("thin-scrollbar min-h-0 flex-1 overflow-auto p-3", "opencode-code", wrap && "wrap")}
                  data-testid="opencode-file-content"
                >
                  {fileLoading && !file ? (
                    <LoadingIndicator className="py-10" label="Loading file" />
                  ) : !file ? null : file.type === "binary" ? (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Binary file ({file.mimeType ?? "unknown type"}) — not shown.
                    </p>
                  ) : file.highlight ? (
                    // Shiki escapes the source and emits only span/pre markup,
                    // and the string comes from our own BFF, never the file.
                    <div dangerouslySetInnerHTML={{ __html: file.highlight.html }} />
                  ) : (
                    <PlainCode content={file.content} />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
