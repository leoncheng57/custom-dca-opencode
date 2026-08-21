import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { api, type McpStatus } from "../lib/api.js";

const DIRECTORY_KEY = "opencode.directory.v1";

export function ToolsPage() {
  const [params] = useSearchParams();
  const directory = params.get("directory") ?? localStorage.getItem(DIRECTORY_KEY) ?? "";
  const [servers, setServers] = useState<Record<string, McpStatus>>({});
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<unknown>(null);
  const [lsp, setLsp] = useState<unknown>(null);
  const load = () => directory && Promise.all([api.mcp(directory), api.permissions(directory), api.lsp(directory)]).then(([mcp, rules, languageServers]) => {
    setServers(mcp.servers);
    setPermissions(rules.permissions);
    setLsp(languageServers.servers);
  }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [directory]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" data-testid="opencode-tools">
      <header>
        <h1 className="text-xl font-bold">MCP tools</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Connect and disconnect affect this running OpenCode instance only.</p>
      </header>
      {!directory && <Alert variant="warning">Open a project on the home page first.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      <ul className="divide-y divide-[var(--color-border-default)] rounded-lg border border-[var(--color-border-default)]">
        {Object.entries(servers).sort(([a], [b]) => a.localeCompare(b)).map(([name, status]) => {
          const connected = status.status === "connected";
          const detail = "error" in status ? status.error : status.status.replaceAll("_", " ");
          return (
            <li key={name} className="flex items-center gap-3 p-3" data-testid="opencode-mcp-row">
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{name}</strong>
                <span className="block truncate text-xs text-[var(--color-text-muted)]">{detail}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => void api.setMcp(directory, name, !connected).then((result) => setServers(result.servers)).catch((e: Error) => setError(e.message))} data-testid={`opencode-mcp-${connected ? "disconnect" : "connect"}`}>
                {connected ? "Disconnect" : "Connect"}
              </Button>
            </li>
          );
        })}
      </ul>
      <section className="rounded-lg border border-[var(--color-border-default)] p-4" data-testid="opencode-lsp-status">
        <h2 className="mb-2 font-semibold">Language servers</h2>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(lsp, null, 2)}</pre>
      </section>
      <section className="rounded-lg border border-[var(--color-border-default)] p-4" data-testid="opencode-effective-permissions">
        <h2 className="font-semibold">Effective permissions</h2>
        <p className="mb-2 text-xs text-[var(--color-text-muted)]">Read-only. Edit opencode.jsonc to change these last-match-wins rules.</p>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(permissions, null, 2)}</pre>
      </section>
    </main>
  );
}
