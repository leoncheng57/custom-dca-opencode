import { Search, Sparkles, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { filterCommands, invocation } from "../../agent-skills/src/lib/commands.js";
import { COMMAND_SCOPES } from "../../agent-skills/src/lib/commandInstall.js";
import { Alert } from "../ds/alert.js";
import { api, type WorkflowSummary } from "../lib/api.js";
import { commands, type Command } from "../lib/playbooks.js";
import { usePlaybookInstallState, type PlaybookInstallState } from "../lib/usePlaybookInstallState.js";
import { groupWorkflows } from "../lib/workflows.js";
import styles from "./playbooks.module.css";

export type WorkflowCatalogueState =
  | { status: "loading"; workflows: WorkflowSummary[] }
  | { status: "ready"; workflows: WorkflowSummary[] }
  | { status: "error"; workflows: WorkflowSummary[] };

export function useWorkflowCatalogue(enabled = true): WorkflowCatalogueState {
  const [state, setState] = useState<WorkflowCatalogueState>({ status: "loading", workflows: [] });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "loading", workflows: [] });
    void api.workflows().then(
      ({ workflows }) => { if (!cancelled) setState({ status: "ready", workflows }); },
      () => { if (!cancelled) setState({ status: "error", workflows: [] }); },
    );
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}

export function InstallState({ install, installed }: { install: PlaybookInstallState; installed: boolean }) {
  if (install.status !== "ready") return null;
  return <span className={`${styles.loadState} ${installed ? styles.loadStateOn : styles.loadStateOff}`} data-installed={installed} data-testid="opencode-playbook-command-load-state" title={`Reported by the OpenCode server for ${install.directoryLabel}. Installation is per project.`}>{installed ? "Loaded" : "Not loaded"} in {install.directoryLabel}</span>;
}

function CommandCard({ command, install }: { command: Command; install: PlaybookInstallState }) {
  return <article className={`${styles.card} ${styles.cardCommand}`} data-playbook-kind="command" data-testid="opencode-playbook-command-card">
    <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeCommand}`}><TerminalSquare aria-hidden="true" size={10} /> Command - human-invoked</span><span className={styles.meta}>{command.subtask ? "subtask" : "session"}</span></div>
    <InstallState install={install} installed={install.installedCommands.has(command.name)} />
    <h2 className={styles.cardTitle}>{invocation(command.name, command.takesArguments)}</h2>
    <p className={styles.cardCopy}>{command.description}</p>
    <div className={styles.cardTags}>{command.runsShell && <span>shell input</span>}{command.agent && <span>{command.agent}</span>}</div>
    <Link className={styles.cardLink} data-testid={`opencode-playbook-command-${command.name}`} to={`/playbooks/commands/${command.name}`}>Read command -&gt;</Link>
  </article>;
}

function WorkflowCard({ workflow, group }: { workflow: WorkflowSummary; group: string }) {
  return <article className={`${styles.card} ${styles.cardWorkflow}`} data-playbook-kind="workflow" data-testid="opencode-playbook-workflow-card">
    <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeWorkflow}`}><Sparkles aria-hidden="true" size={10} /> Workflow - guided action</span><span className={styles.meta}>{group}</span></div>
    <h2 className={styles.cardTitle}>{workflow.title}</h2>
    <p className={styles.cardCopy}>{workflow.description}</p>
    <details className={styles.injectorPreview}><summary data-testid={`opencode-playbook-workflow-injector-${workflow.id}`}>Trusted injector</summary><pre><code>{workflow.injector}</code></pre></details>
    <Link className={styles.cardLink} data-testid={`opencode-playbook-workflow-${workflow.id}`} to={`/playbooks/workflows/${workflow.id}`}>Read workflow -&gt;</Link>
  </article>;
}

function ScopeTable() {
  return <section className={styles.locations} aria-labelledby="command-locations-heading">
    <div className={styles.eyebrow}>Install locations</div><h2 className={styles.sectionTitle} id="command-locations-heading">Where commands live</h2>
    <p>Commands are individual OpenCode Markdown files. They add zero retrieval context until a human explicitly invokes one.</p>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Path</th><th scope="col">Scope</th><th scope="col">Read by</th></tr></thead><tbody>{COMMAND_SCOPES.map((scope) => <tr key={scope.path}><th scope="row">{scope.path}</th><td>{scope.scope}</td><td>{scope.readBy}<span>{scope.note}</span></td></tr>)}</tbody></table></div>
  </section>;
}

function CommandCatalogue({ query }: { query: string }) {
  const install = usePlaybookInstallState();
  const visible = useMemo(() => filterCommands(commands, query), [query]);
  return <>
    <div className={styles.catalogHeading}><div className={styles.eyebrow}>Commands</div><h2 className={styles.sectionTitle}>{visible.length} matching commands</h2></div>
    {visible.length ? <div className={styles.grid}>{visible.map((command) => <CommandCard command={command} install={install} key={command.name} />)}</div> : <p className={styles.empty}>No command matches <code>{query.trim()}</code>.</p>}
    <ScopeTable />
  </>;
}

function WorkflowCatalogue({ commandsRendered, query, state }: { commandsRendered: boolean; query: string; state: WorkflowCatalogueState }) {
  if (state.status === "loading") return <p className={styles.empty} data-testid="opencode-playbook-workflows-loading">Loading workflows...</p>;
  if (state.status === "error") return <Alert className={styles.workflowState} data-testid="opencode-playbook-workflows-error" variant="danger">Workflows could not be loaded. {commandsRendered ? "Commands remain available." : "Try again after the catalogue is available."}</Alert>;
  const needle = query.trim().toLowerCase();
  const groups = groupWorkflows(state.workflows).map(({ label, workflows }) => ({ label, workflows: workflows.filter((workflow) => !needle || `${workflow.title} ${workflow.description} ${workflow.id} ${workflow.injector}`.toLowerCase().includes(needle)) })).filter(({ workflows }) => workflows.length);
  const visibleCount = groups.reduce((total, group) => total + group.workflows.length, 0);
  return <div data-testid="opencode-playbook-workflows-ready">
    <div className={styles.catalogHeading}><div className={styles.eyebrow}>Workflows</div><h2 className={styles.sectionTitle}>{visibleCount} matching workflows</h2></div>
    {state.workflows.length === 0 ? <p className={styles.empty} data-testid="opencode-playbook-workflows-empty">No workflows are available.</p> : visibleCount === 0 ? <p className={styles.empty}>No workflow matches <code>{query.trim()}</code>.</p> : groups.map(({ label, workflows }) => <section aria-labelledby={`workflow-group-${label.toLowerCase()}`} className={styles.workflowGroup} data-testid="opencode-playbook-workflow-group" key={label}><h3 id={`workflow-group-${label.toLowerCase()}`}>{label}</h3><div className={styles.grid}>{workflows.map((workflow) => <WorkflowCard group={label} key={workflow.id} workflow={workflow} />)}</div></section>)}
  </div>;
}

export function PlaybooksPage({ detail, workflowState: suppliedWorkflowState }: { detail?: ReactNode; workflowState?: WorkflowCatalogueState }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const focusCatalog = (location.state as { focusCatalog?: boolean } | null)?.focusCatalog === true;
  const commandsOnly = location.pathname.startsWith("/playbooks/commands");
  const workflowsOnly = location.pathname.startsWith("/playbooks/workflows");
  const includeCommands = !workflowsOnly;
  const includeWorkflows = !commandsOnly;
  const fetchedWorkflowState = useWorkflowCatalogue(includeWorkflows && suppliedWorkflowState === undefined);
  const workflowState = suppliedWorkflowState ?? fetchedWorkflowState;
  useEffect(() => { if (focusCatalog) mainRef.current?.focus(); }, [focusCatalog]);

  return <main className={styles.page} data-testid="opencode-playbooks" ref={mainRef} tabIndex={-1}>
    <div className={styles.content}>
      <Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>
      <header className={styles.hero}><div><div className={styles.eyebrow}>Commands and live workflows</div><h1>Repeatable work, invoked on purpose.</h1><p className={styles.lede}>Commands are repository-owned procedures. Workflows are guided actions loaded live from the trusted server catalogue; runtime reminders remain a separate per-message mechanism.</p></div><aside className={styles.typeStats} aria-label="Playbook types"><div className={styles.typeStat}><strong>{commands.length}</strong><span>Commands</span></div><div className={styles.typeStat}><strong>{workflowState.status === "ready" ? workflowState.workflows.length : "-"}</strong><span>Workflows</span></div><div className={styles.typeStat}><strong>0</strong><span>At-rest tokens</span></div></aside></header>
      <nav aria-label="Playbook categories" className={styles.categoryNav}><Link aria-current={!commandsOnly && !workflowsOnly ? "page" : undefined} data-testid="opencode-playbooks-all" to="/playbooks">All</Link><Link aria-current={commandsOnly ? "page" : undefined} data-testid="opencode-playbooks-commands" to="/playbooks/commands">Commands</Link><Link aria-current={workflowsOnly ? "page" : undefined} data-testid="opencode-playbooks-workflows" to="/playbooks/workflows">Workflows</Link></nav>
      <section className={styles.catalog} aria-labelledby="playbook-catalog-heading"><div className={styles.catalogHead}><div><div className={styles.eyebrow}>Catalogue</div><h2 className={styles.sectionTitle} id="playbook-catalog-heading">{commandsOnly ? "Commands" : workflowsOnly ? "Workflows" : "All Playbooks"}</h2></div><label className={styles.filter}><Search aria-hidden="true" size={14} /><span className={styles.filterLabel}>filter</span><input className={styles.filterInput} data-testid="opencode-playbook-filter" onChange={(event) => setQuery(event.target.value)} placeholder="name, description, or instruction" ref={inputRef} type="search" value={query} />{query && <button aria-label="Clear filter" className={styles.clear} data-testid="opencode-playbook-filter-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button">x</button>}</label></div>
        {includeCommands && <CommandCatalogue query={query} />}
        {includeWorkflows && <WorkflowCatalogue commandsRendered={includeCommands} query={query} state={workflowState} />}
      </section>
    </div>
    {detail}
  </main>;
}
