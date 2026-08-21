import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import {
  api,
  type GitCommit,
  type VcsFileDiff,
  type WorkspaceFile,
  type WorkspaceNode,
} from "../lib/api.js";

type Tab = "files" | "changes" | "preview";

export function WorkspacePanels({ directory, onClose }: { directory: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("files");
  const [path, setPath] = useState("");
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [file, setFile] = useState<WorkspaceFile | null>(null);
  const [changes, setChanges] = useState<VcsFileDiff[]>([]);
  const [selectedChange, setSelectedChange] = useState(0);
  const [mode, setMode] = useState<"git" | "branch">("git");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [port, setPort] = useState("5173");
  const [previewKey, setPreviewKey] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tab !== "files") return;
    void api.workspaceTree(directory, path).then((tree) => {
      setNodes([...tree.dirs, ...tree.files]);
      setFile(null);
      setError("");
    }).catch((e: Error) => setError(e.message));
  }, [directory, path, tab]);

  useEffect(() => {
    if (tab !== "changes") return;
    void Promise.all([api.changes(directory, mode), api.commits(directory)]).then(([diffs, history]) => {
      setChanges(diffs.changes);
      setCommits(history.commits);
      setSelectedChange(0);
      setError("");
    }).catch((e: Error) => setError(e.message));
  }, [directory, mode, tab]);

  const openNode = (node: WorkspaceNode) => {
    if (node.type === "directory") setPath(node.path);
    else void api.workspaceFile(directory, node.path).then(setFile).catch((e: Error) => setError(e.message));
  };
  const parent = path.split("/").slice(0, -1).join("/");

  return (
    <section className="fixed inset-x-0 bottom-0 top-11 z-50 flex flex-col border-l border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:left-auto sm:w-[42rem]" data-testid="opencode-workspace-panels">
      <header className="flex items-center gap-1 border-b border-[var(--color-border-default)] p-2">
        {(["files", "changes", "preview"] as const).map((name) => (
          <button key={name} type="button" onClick={() => setTab(name)} className={`rounded px-3 py-1.5 text-xs capitalize ${tab === name ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold" : "text-[var(--color-text-muted)]"}`} data-testid={`opencode-workspace-${name}`}>{name}</button>
        ))}
        <Button className="ml-auto" size="sm" variant="ghost" onClick={onClose} data-testid="opencode-workspace-close">Close</Button>
      </header>
      {error && <div className="p-3"><Alert variant="danger">{error}</Alert></div>}

      {tab === "files" && (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="h-52 shrink-0 overflow-y-auto border-b border-[var(--color-border-default)] p-2 sm:h-auto sm:w-64 sm:border-b-0 sm:border-r">
            <button type="button" disabled={!path} onClick={() => setPath(parent)} className="mb-1 w-full rounded p-2 text-left text-xs text-[var(--color-text-muted)] disabled:opacity-40" data-testid="opencode-files-up">../ {path || "workspace"}</button>
            {nodes.filter((node) => !node.ignored).map((node) => (
              <button key={node.path} type="button" onClick={() => openNode(node)} className="block w-full truncate rounded p-2 text-left text-sm hover:bg-[var(--hh-row-hover)]" data-testid="opencode-file-node">{node.type === "directory" ? "> " : ""}{node.name}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="opencode-file-viewer">
            {!file ? <p className="text-sm text-[var(--color-text-muted)]">Select a file.</p> : file.type === "binary" ? <p className="text-sm">Binary file ({file.mimeType ?? "unknown type"})</p> : <><h2 className="mb-3 text-xs font-semibold">{file.path}</h2><pre className="whitespace-pre-wrap break-words text-xs">{file.content}</pre></>}
          </div>
        </div>
      )}

      {tab === "changes" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-2 border-b border-[var(--color-border-default)] p-2">
            {(["git", "branch"] as const).map((value) => <Button key={value} size="sm" variant={mode === value ? "primary" : "secondary"} onClick={() => setMode(value)} data-testid={`opencode-changes-${value}`}>{value === "git" ? "Working tree" : "Branch"}</Button>)}
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="w-52 shrink-0 overflow-y-auto border-r border-[var(--color-border-default)] p-2">
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
          <iframe key={previewKey} src={`/api/preview/${port}/`} title="Application preview" sandbox="allow-forms allow-modals allow-popups allow-scripts" className="min-h-0 flex-1 rounded border border-[var(--color-border-default)] bg-white" data-testid="opencode-preview-frame" />
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">Read-only proxy only. Start the app separately and configure its base path for this URL.</p>
        </div>
      )}
    </section>
  );
}
