import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { WorkspaceFiles } from "./workspace-files.js";
import { api, type GitCommit, type VcsFileDiff } from "../lib/api.js";
import type { WorkspaceTarget } from "../lib/fileReferences.js";
import { PUBLIC_SIMULATOR } from "../lib/runtime.js";

type Tab = "files" | "changes" | "preview";

export function WorkspacePanels({
  directory,
  onClose,
  target,
  onTargetConsumed,
}: {
  directory: string;
  onClose: () => void;
  /** Set when the drawer was opened by following a transcript reference. */
  target?: WorkspaceTarget | null;
  onTargetConsumed?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("files");
  const [changes, setChanges] = useState<VcsFileDiff[]>([]);
  const [selectedChange, setSelectedChange] = useState(0);
  const [mode, setMode] = useState<"git" | "branch">("git");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [port, setPort] = useState("5173");
  const [previewKey, setPreviewKey] = useState(0);
  const [error, setError] = useState("");

  // A reference always lands on Files, whichever tab was last used.
  useEffect(() => {
    if (target) setTab("files");
  }, [target]);

  useEffect(() => {
    if (tab !== "changes") return;
    void Promise.all([api.changes(directory, mode), api.commits(directory)]).then(([diffs, history]) => {
      setChanges(diffs.changes);
      setCommits(history.commits);
      setSelectedChange(0);
      setError("");
    }).catch((e: Error) => setError(e.message));
  }, [directory, mode, tab]);

  return (
    <section className="fixed inset-x-0 bottom-0 top-11 z-50 flex flex-col border-l border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:left-auto sm:w-[42rem]" data-testid="opencode-workspace-panels">
      <header className="flex items-center gap-1 border-b border-[var(--color-border-default)] p-2">
        {(["files", "changes", "preview"] as const).map((name) => (
          <button key={name} type="button" onClick={() => setTab(name)} aria-current={tab === name ? "true" : undefined} className={`rounded px-3 py-1.5 text-xs capitalize ${tab === name ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold" : "text-[var(--color-text-muted)]"}`} data-testid={`opencode-workspace-${name}`}>{name}</button>
        ))}
        <Button className="ml-auto" size="sm" variant="ghost" onClick={onClose} data-testid="opencode-workspace-close">Close</Button>
      </header>
      {error && <div className="p-3"><Alert variant="danger">{error}</Alert></div>}

      {/* The Files tab stays mounted: unmounting it on every tab switch would
          discard the expanded tree, the open tabs and the reader's scroll. */}
      <div className={tab === "files" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <WorkspaceFiles
          directory={directory}
          target={target ?? null}
          onTargetConsumed={onTargetConsumed ?? (() => undefined)}
        />
      </div>

      {tab === "changes" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-2 border-b border-[var(--color-border-default)] p-2">
            {(["git", "branch"] as const).map((value) => <Button key={value} size="sm" variant={mode === value ? "primary" : "secondary"} onClick={() => setMode(value)} data-testid={`opencode-changes-${value}`}>{value === "git" ? "Working tree" : "Branch"}</Button>)}
          </div>
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div className="h-44 w-full shrink-0 overflow-y-auto border-b border-[var(--color-border-default)] p-2 sm:h-auto sm:w-52 sm:border-b-0 sm:border-r" data-testid="opencode-changes-rail">
              {changes.map((change, index) => <button key={change.file} type="button" onClick={() => setSelectedChange(index)} className="block w-full truncate rounded p-2 text-left text-xs hover:bg-[var(--hh-row-hover)]" data-testid="opencode-change-file">{change.file}<span className="ml-1 text-[var(--color-text-muted)]">+{change.additions} -{change.deletions}</span></button>)}
              <h3 className="mb-1 mt-4 text-[10px] uppercase text-[var(--color-text-muted)]">Recent commits</h3>
              {commits.map((commit) => <div key={commit.sha} className="mb-2 text-xs"><code>{commit.shortSha}</code> {commit.subject}</div>)}
            </div>
            <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs" data-testid="opencode-diff-viewer">{changes[selectedChange]?.patch || (changes.length ? "Patch unavailable or capped by OpenCode." : "No changes.")}</pre>
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-3 flex gap-2">
            <label className="flex items-center gap-2 text-sm">Port <input value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ""))} className="w-24 rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-preview-port" /></label>
            <Button variant="secondary" onClick={() => setPreviewKey((key) => key + 1)} data-testid="opencode-preview-reload">Load / Reload</Button>
          </div>
          <iframe
            key={previewKey}
            src={PUBLIC_SIMULATOR ? undefined : `/api/preview/${port}/`}
            srcDoc={PUBLIC_SIMULATOR ? "<!doctype html><html><body><main><h1>Simulated application preview</h1><p>This frame demonstrates the preview panel without contacting a local port.</p><button type='button'>Example action</button></main></body></html>" : undefined}
            title="Application preview"
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
            className="min-h-0 flex-1 rounded border border-[var(--color-border-default)] bg-white"
            data-testid="opencode-preview-frame"
          />
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {PUBLIC_SIMULATOR ? "Fixture frame only. Public previews cannot reach localhost." : "Read-only proxy only. Start the app separately and configure its base path for this URL."}
          </p>
        </div>
      )}
    </section>
  );
}
