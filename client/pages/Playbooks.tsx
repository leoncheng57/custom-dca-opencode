import { Bell, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { api, type ReminderSummary, type WorkflowSummary } from "../lib/api.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "../lib/palette.js";
import { groupReminders } from "../lib/reminderCatalogue.js";
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

export type ReminderCatalogueState =
  | { status: "loading"; reminders: ReminderSummary[] }
  | { status: "ready"; reminders: ReminderSummary[] }
  | { status: "error"; reminders: ReminderSummary[] };

/**
 * Reminders are directory-scoped — a preset may declare `scope_repository` and
 * is only listed for a matching project — but `/playbooks` carries no
 * `?directory=`. The last selected project is resolved through the same seam
 * the palette and notification centre use.
 *
 * An absent directory is not an error: the server answers with the general
 * reminders, failing closed rather than revealing repository-scoped ones.
 */
export function useReminderCatalogue(enabled = true): ReminderCatalogueState {
  const location = useLocation();
  const directory = resolvePaletteDirectory(location.search, typeof localStorage === "undefined" ? null : localStorage.getItem(DIRECTORY_STORAGE_KEY));
  const [state, setState] = useState<ReminderCatalogueState>({ status: "loading", reminders: [] });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "loading", reminders: [] });
    void api.reminders(directory).then(
      ({ reminders }) => { if (!cancelled) setState({ status: "ready", reminders }); },
      () => { if (!cancelled) setState({ status: "error", reminders: [] }); },
    );
    return () => { cancelled = true; };
  }, [enabled, directory]);
  return state;
}

function ReminderCard({ reminder, group }: { reminder: ReminderSummary; group: string }) {
  return <article className={`${styles.card} ${styles.cardReminder}`} data-playbook-kind="reminder" data-testid="opencode-playbook-reminder-card">
    <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeReminder}`}><Bell aria-hidden="true" size={10} /> Reminder - per message</span><span className={styles.meta}>{group}</span></div>
    <h2 className={styles.cardTitle}>{reminder.title}</h2>
    <p className={styles.cardCopy}>{reminder.description}</p>
    {reminder.tags.length > 0 && <div className={styles.cardTags} data-testid="opencode-playbook-reminder-tags">{reminder.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
    <details className={styles.injectorPreview}><summary data-testid={`opencode-playbook-reminder-body-${reminder.id}`}>Exact instructions</summary><pre><code>{reminder.body}</code></pre></details>
    <Link className={styles.cardLink} data-testid={`opencode-playbook-reminder-${reminder.id}`} to={`/playbooks/reminders/${reminder.id}`}>Read reminder -&gt;</Link>
  </article>;
}

function ReminderCatalogue({ query, state }: { query: string; state: ReminderCatalogueState }) {
  if (state.status === "loading") return <p className={styles.empty} data-testid="opencode-playbook-reminders-loading">Loading reminders...</p>;
  if (state.status === "error") return <Alert className={styles.workflowState} data-testid="opencode-playbook-reminders-error" variant="danger">Reminders could not be loaded. Try again after the catalogue is available.</Alert>;
  const needle = query.trim().toLowerCase();
  const groups = groupReminders(state.reminders).map(({ label, reminders }) => ({ label, reminders: reminders.filter((reminder) => !needle || `${reminder.title} ${reminder.description} ${reminder.id} ${reminder.tags.join(" ")} ${reminder.body}`.toLowerCase().includes(needle)) })).filter(({ reminders }) => reminders.length);
  const visibleCount = groups.reduce((total, group) => total + group.reminders.length, 0);
  return <div data-testid="opencode-playbook-reminders-ready">
    <div className={styles.catalogHeading}><div className={styles.eyebrow}>Reminders</div><h2 className={styles.sectionTitle}>{visibleCount} matching reminders</h2></div>
    {state.reminders.length === 0 ? <p className={styles.empty} data-testid="opencode-playbook-reminders-empty">No reminders are available.</p> : visibleCount === 0 ? <p className={styles.empty}>No reminder matches <code>{query.trim()}</code>.</p> : groups.map(({ label, reminders }) => <section aria-labelledby={`reminder-group-${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`} className={styles.reminderGroup} data-testid="opencode-playbook-reminder-group" key={label}><h3 id={`reminder-group-${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`}>{label}</h3><div className={styles.grid}>{reminders.map((reminder) => <ReminderCard group={label} key={reminder.id} reminder={reminder} />)}</div></section>)}
  </div>;
}

function WorkflowCard({ workflow, group }: { workflow: WorkflowSummary; group: string }) {
  return <article className={`${styles.card} ${styles.cardWorkflow}`} data-playbook-kind="workflow" data-testid="opencode-playbook-workflow-card">
    <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeWorkflow}`}><Sparkles aria-hidden="true" size={10} /> Workflow - guided action</span><span className={styles.meta}>{group}</span></div>
    <h2 className={styles.cardTitle}>{workflow.title}</h2>
    <p className={styles.cardCopy}>{workflow.description}</p>
    {workflow.argument && <div className={styles.cardTags} data-testid="opencode-playbook-workflow-argument"><span>takes: {workflow.argument.label.toLowerCase()}</span></div>}
    <details className={styles.injectorPreview}><summary data-testid={`opencode-playbook-workflow-injector-${workflow.id}`}>Trusted injector</summary><pre><code>{workflow.injector}</code></pre></details>
    <Link className={styles.cardLink} data-testid={`opencode-playbook-workflow-${workflow.id}`} to={`/playbooks/workflows/${workflow.id}`}>Read workflow -&gt;</Link>
  </article>;
}

function WorkflowCatalogue({ query, state }: { query: string; state: WorkflowCatalogueState }) {
  if (state.status === "loading") return <p className={styles.empty} data-testid="opencode-playbook-workflows-loading">Loading workflows...</p>;
  if (state.status === "error") return <Alert className={styles.workflowState} data-testid="opencode-playbook-workflows-error" variant="danger">Workflows could not be loaded. Try again after the catalogue is available.</Alert>;
  const needle = query.trim().toLowerCase();
  const groups = groupWorkflows(state.workflows).map(({ label, workflows }) => ({ label, workflows: workflows.filter((workflow) => !needle || `${workflow.title} ${workflow.description} ${workflow.id} ${workflow.injector}`.toLowerCase().includes(needle)) })).filter(({ workflows }) => workflows.length);
  const visibleCount = groups.reduce((total, group) => total + group.workflows.length, 0);
  return <div data-testid="opencode-playbook-workflows-ready">
    <div className={styles.catalogHeading}><div className={styles.eyebrow}>Workflows</div><h2 className={styles.sectionTitle}>{visibleCount} matching workflows</h2></div>
    {state.workflows.length === 0 ? <p className={styles.empty} data-testid="opencode-playbook-workflows-empty">No workflows are available.</p> : visibleCount === 0 ? <p className={styles.empty}>No workflow matches <code>{query.trim()}</code>.</p> : groups.map(({ label, workflows }) => <section aria-labelledby={`workflow-group-${label.toLowerCase()}`} className={styles.workflowGroup} data-testid="opencode-playbook-workflow-group" key={label}><h3 id={`workflow-group-${label.toLowerCase()}`}>{label}</h3><div className={styles.grid}>{workflows.map((workflow) => <WorkflowCard group={label} key={workflow.id} workflow={workflow} />)}</div></section>)}
  </div>;
}

export function PlaybooksPage({ detail, workflowState: suppliedWorkflowState, reminderState: suppliedReminderState }: { detail?: ReactNode; workflowState?: WorkflowCatalogueState; reminderState?: ReminderCatalogueState }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const focusCatalog = (location.state as { focusCatalog?: boolean } | null)?.focusCatalog === true;
  const fetchedWorkflowState = useWorkflowCatalogue(suppliedWorkflowState === undefined);
  const workflowState = suppliedWorkflowState ?? fetchedWorkflowState;
  const fetchedReminderState = useReminderCatalogue(suppliedReminderState === undefined);
  const reminderState = suppliedReminderState ?? fetchedReminderState;
  useEffect(() => { if (focusCatalog) mainRef.current?.focus(); }, [focusCatalog]);

  return <main className={styles.page} data-testid="opencode-playbooks" ref={mainRef} tabIndex={-1}>
    <div className={styles.content}>
      <Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>
      <header className={styles.hero}><div><div className={styles.eyebrow}>Live composer catalogue</div><h1>Repeatable work, invoked on purpose.</h1><p className={styles.lede}>Both categories are loaded live from the trusted server catalogue, and both are readable in full before you use them. A workflow is a guided action you fill in and send; a reminder attaches instructions to your next message only. Nothing here is installed, and nothing runs from this page.</p></div><aside className={styles.typeStats} aria-label="Playbook types"><div className={styles.typeStat}><strong>{workflowState.status === "ready" ? workflowState.workflows.length : "-"}</strong><span>Workflows</span></div><div className={styles.typeStat}><strong>{reminderState.status === "ready" ? reminderState.reminders.length : "-"}</strong><span>Reminders</span></div><div className={styles.typeStat}><strong>0</strong><span>At-rest tokens</span></div></aside></header>
      <section className={styles.catalog} aria-labelledby="playbook-catalog-heading"><div className={styles.catalogHead}><div><div className={styles.eyebrow}>Catalogue</div><h2 className={styles.sectionTitle} id="playbook-catalog-heading">Workflows and reminders</h2></div><label className={styles.filter}><Search aria-hidden="true" size={14} /><span className={styles.filterLabel}>filter</span><input className={styles.filterInput} data-testid="opencode-playbook-filter" onChange={(event) => setQuery(event.target.value)} placeholder="name, description, or instruction" ref={inputRef} type="search" value={query} />{query && <button aria-label="Clear filter" className={styles.clear} data-testid="opencode-playbook-filter-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button">x</button>}</label></div>
        <WorkflowCatalogue query={query} state={workflowState} />
        {/*
          * One filter drives both catalogues. Two search boxes would make the
          * reader choose a category before they know which one their subject
          * lives in, which is exactly the question this page exists to answer.
          */}
        <ReminderCatalogue query={query} state={reminderState} />
      </section>
    </div>
    {detail}
  </main>;
}
