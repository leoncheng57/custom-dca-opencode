import { Search, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { filterCommands, invocation } from "../../agent-skills/src/lib/commands.js";
import { COMMAND_SCOPES } from "../../agent-skills/src/lib/commandInstall.js";
import { commands, type Command } from "../lib/playbooks.js";
import { usePlaybookInstallState, type PlaybookInstallState } from "../lib/usePlaybookInstallState.js";
import { Alert } from "../ds/alert.js";
import styles from "./playbooks.module.css";

export function InstallState({ install, installed }: { install: PlaybookInstallState; installed: boolean }) {
  if (install.status !== "ready") return null;
  return (
    <span
      className={`${styles.loadState} ${installed ? styles.loadStateOn : styles.loadStateOff}`}
      data-installed={installed}
      data-testid="opencode-playbook-command-load-state"
      title={`Reported by the OpenCode server for ${install.directoryLabel}. Installation is per project.`}
    >
      {installed ? "Loaded" : "Not loaded"} in {install.directoryLabel}
    </span>
  );
}

function CommandCard({ command, install }: { command: Command; install: PlaybookInstallState }) {
  return (
    <article className={`${styles.card} ${styles.cardCommand}`} data-playbook-kind="command" data-testid="opencode-playbook-command-card">
      <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeCommand}`}><TerminalSquare aria-hidden="true" size={10} /> Command · human-invoked</span><span className={styles.meta}>{command.subtask ? "subtask" : "session"}</span></div>
      <InstallState install={install} installed={install.installedCommands.has(command.name)} />
      <h2 className={styles.cardTitle}>{invocation(command.name, command.takesArguments)}</h2>
      <p className={styles.cardCopy}>{command.description}</p>
      <div className={styles.cardTags}>{command.runsShell && <span>shell input</span>}{command.agent && <span>{command.agent}</span>}</div>
      <Link className={styles.cardLink} data-testid={`opencode-playbook-command-${command.name}`} to={`/playbooks/commands/${command.name}`}>Read command →</Link>
    </article>
  );
}

function ScopeTable() {
  return (
    <section className={styles.locations} aria-labelledby="command-locations-heading">
      <div className={styles.eyebrow}>Install locations</div>
      <h2 className={styles.sectionTitle} id="command-locations-heading">Where commands live</h2>
      <p>Commands are individual OpenCode Markdown files. They add zero retrieval context until a human explicitly invokes one.</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Path</th><th scope="col">Scope</th><th scope="col">Read by</th></tr></thead><tbody>{COMMAND_SCOPES.map((scope) => <tr key={scope.path}><th scope="row">{scope.path}</th><td>{scope.scope}</td><td>{scope.readBy}<span>{scope.note}</span></td></tr>)}</tbody></table></div>
    </section>
  );
}

export function PlaybooksPage({ detail }: { detail?: ReactNode }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const focusCatalog = (useLocation().state as { focusCatalog?: boolean } | null)?.focusCatalog === true;
  useEffect(() => { if (focusCatalog) mainRef.current?.focus(); }, [focusCatalog]);
  const install = usePlaybookInstallState();
  const visibleCommands = useMemo(() => filterCommands(commands, query), [query]);

  return (
    <main className={styles.page} data-testid="opencode-playbooks" ref={mainRef} tabIndex={-1}>
      <div className={styles.content}>
        <Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>
        <header className={styles.hero}>
          <div><div className={styles.eyebrow}>Repository-owned commands</div><h1>Repeatable work, invoked on purpose.</h1><p className={styles.lede}>Each Playbook is an explicit slash command. Nothing is retrieved or added to agent context until a human invokes it; runtime reminders remain a separate per-message mechanism.</p></div>
          <aside className={styles.typeStats} aria-label="Playbook types"><div className={styles.typeStat}><strong>{commands.length}</strong><span>Commands</span></div><div className={styles.typeStat}><strong>0</strong><span>At-rest tokens</span></div></aside>
        </header>
        <section className={styles.catalog} aria-labelledby="playbook-catalog-heading">
          <div className={styles.catalogHead}><div><div className={styles.eyebrow}>Catalogue</div><h2 className={styles.sectionTitle} id="playbook-catalog-heading">{visibleCommands.length} matching commands</h2></div><label className={styles.filter}><Search aria-hidden="true" size={14} /><span className={styles.filterLabel}>filter</span><input className={styles.filterInput} data-testid="opencode-playbook-filter" onChange={(event) => setQuery(event.target.value)} placeholder="name, description, or instruction" ref={inputRef} type="search" value={query} />{query && <button aria-label="Clear filter" className={styles.clear} data-testid="opencode-playbook-filter-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button">×</button>}</label></div>
          {visibleCommands.length ? <div className={styles.grid}>{visibleCommands.map((command) => <CommandCard command={command} install={install} key={command.name} />)}</div> : <p className={styles.empty}>No command matches <code>{query.trim()}</code>.</p>}
        </section>
        <ScopeTable />
      </div>
      {detail}
    </main>
  );
}
