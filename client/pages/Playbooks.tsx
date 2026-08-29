import { Search, Sparkles, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { filterCommands, invocation } from "../../agent-skills/src/lib/commands.js";
import { COMMAND_SCOPES } from "../../agent-skills/src/lib/commandInstall.js";
import { INSTALL_SCOPES } from "../../agent-skills/src/lib/install.js";
import { allTags, filterSkills } from "../../agent-skills/src/lib/skills.js";
import { commands, skills, type Command, type Skill } from "../lib/playbooks.js";
import { usePlaybookInstallState, type PlaybookInstallState } from "../lib/usePlaybookInstallState.js";
import { Alert } from "../ds/alert.js";
import styles from "./playbooks.module.css";

export type CatalogKind = "all" | "skills" | "commands";

/**
 * States whether the OpenCode server has this playbook loaded, and for WHICH
 * project. The label is mandatory: installation is per-directory while this
 * page is global, so an unlabelled badge would be false in another project.
 * Renders nothing when the state is unknown rather than guessing.
 */
export function InstallState({ install, installed, kind }: { install: PlaybookInstallState; installed: boolean; kind: "skill" | "command" }) {
  if (install.status !== "ready") return null;
  return (
    <span
      className={`${styles.loadState} ${installed ? styles.loadStateOn : styles.loadStateOff}`}
      data-installed={installed}
      data-testid={`opencode-playbook-${kind}-load-state`}
      title={`Reported by the OpenCode server for ${install.directoryLabel}. Installation is per project.`}
    >
      {installed ? "Loaded" : "Not loaded"} in {install.directoryLabel}
    </span>
  );
}

function SkillCard({ install, skill, onTag }: { install: PlaybookInstallState; skill: Skill; onTag: (tag: string) => void }) {
  return (
    <article className={`${styles.card} ${styles.cardSkill}`} data-playbook-kind="skill" data-testid="opencode-playbook-skill-card">
      <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeSkill}`}><Sparkles aria-hidden="true" size={10} /> Skill · model-selected</span><span className={styles.meta}>{skill.readingTimeMinutes} min</span></div>
      <InstallState install={install} installed={install.installedSkills.has(skill.name)} kind="skill" />
      <h2 className={styles.cardTitle}>{skill.title}</h2>
      <p className={styles.cardCopy}>{skill.summary}</p>
      <div className={styles.cardTags}>{skill.tags.map((tag) => <button className={styles.tag} data-testid="opencode-playbook-tag" key={tag} onClick={() => onTag(tag)} type="button">#{tag}</button>)}</div>
      <Link className={styles.cardLink} data-testid={`opencode-playbook-skill-${skill.name}`} to={`/playbooks/skills/${skill.name}`}>Read playbook →</Link>
    </article>
  );
}

function CommandCard({ command, install }: { command: Command; install: PlaybookInstallState }) {
  return (
    <article className={`${styles.card} ${styles.cardCommand}`} data-playbook-kind="command" data-testid="opencode-playbook-command-card">
      <div className={styles.cardTop}><span className={`${styles.type} ${styles.typeCommand}`}><TerminalSquare aria-hidden="true" size={10} /> Command · human-invoked</span><span className={styles.meta}>{command.subtask ? "subtask" : "session"}</span></div>
      <InstallState install={install} installed={install.installedCommands.has(command.name)} kind="command" />
      <h2 className={styles.cardTitle}>{invocation(command.name, command.takesArguments)}</h2>
      <p className={styles.cardCopy}>{command.description}</p>
      <div className={styles.cardTags}>{command.runsShell && <span>shell input</span>}{command.relatedSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
      <Link className={styles.cardLink} data-testid={`opencode-playbook-command-${command.name}`} to={`/playbooks/commands/${command.name}`}>Read command →</Link>
    </article>
  );
}

const KINDS: Array<{ kind: CatalogKind; label: string; href: string }> = [
  { kind: "all", label: "All", href: "/playbooks" },
  { kind: "skills", label: "Skills", href: "/playbooks/skills" },
  { kind: "commands", label: "Commands", href: "/playbooks/commands" },
];

function ScopeTable({ kind }: { kind: "skills" | "commands" }) {
  const scopes = kind === "skills" ? INSTALL_SCOPES : COMMAND_SCOPES;
  return (
    <section className={styles.locations} aria-labelledby={`${kind}-locations-heading`}>
      <div className={styles.eyebrow}>Install locations</div>
      <h2 className={styles.sectionTitle} id={`${kind}-locations-heading`}>Where {kind} live</h2>
      <p>{kind === "skills" ? "Skills are portable directories read by several agent families. Global paths apply everywhere; project paths travel with one repository." : "Commands are individual OpenCode markdown files. They cost no context until a human invokes them."}</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Path</th><th scope="col">Scope</th><th scope="col">Read by</th></tr></thead><tbody>{scopes.map((scope) => <tr key={scope.path}><th scope="row">{scope.path}</th><td>{scope.scope}</td><td>{scope.readBy}<span>{scope.note}</span></td></tr>)}</tbody></table></div>
    </section>
  );
}

export function PlaybooksPage({ kind = "all", detail }: { kind?: CatalogKind; detail?: ReactNode }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // A closing modal whose opener is gone asks for focus here, so keyboard users
  // land on the catalogue instead of being dropped to <body>.
  const focusCatalog = (useLocation().state as { focusCatalog?: boolean } | null)?.focusCatalog === true;
  useEffect(() => { if (focusCatalog) mainRef.current?.focus(); }, [focusCatalog]);
  const install = usePlaybookInstallState();
  const visibleSkills = useMemo(() => kind === "commands" ? [] : filterSkills(skills, query), [kind, query]);
  const visibleCommands = useMemo(() => kind === "skills" ? [] : filterCommands(commands, query), [kind, query]);
  const tags = useMemo(() => allTags(skills), []);
  const count = visibleSkills.length + visibleCommands.length;
  const selectTag = (tag: string) => { setQuery(tag); inputRef.current?.focus(); };

  return (
    <main className={styles.page} data-testid="opencode-playbooks" ref={mainRef} tabIndex={-1}>
      <div className={styles.content}>
        <Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>
        <header className={styles.hero}>
          <div><div className={styles.eyebrow}>Repository-owned agent procedures</div><h1>Repeatable ways to work with an agent.</h1><p className={styles.lede}>Skills are selected by the model. Commands are invoked by a human. Guided workflows can join them here later without turning one content type into the whole product.</p></div>
          <aside className={styles.typeStats} aria-label="Playbook types"><div className={styles.typeStat}><strong>{skills.length}</strong><span>Skills</span></div><div className={styles.typeStat}><strong>{commands.length}</strong><span>Commands</span></div><div className={styles.typeStat}><strong>Next</strong><span>Workflows</span></div></aside>
        </header>
        <section className={styles.catalog} aria-labelledby="playbook-catalog-heading">
          <div className={styles.catalogHead}><div><div className={styles.eyebrow}>Catalogue</div><h2 className={styles.sectionTitle} id="playbook-catalog-heading">{count} matching playbooks <span className={styles.count}>{kind}</span></h2></div><label className={styles.filter}><Search aria-hidden="true" size={14} /><span className={styles.filterLabel}>filter</span><input className={styles.filterInput} data-testid="opencode-playbook-filter" onChange={(event) => setQuery(event.target.value)} placeholder="name, tag, or trigger phrase" ref={inputRef} type="search" value={query} />{query && <button aria-label="Clear filter" className={styles.clear} data-testid="opencode-playbook-filter-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button">×</button>}</label></div>
          <nav className={styles.tabs} aria-label="Playbook types">{KINDS.map((item) => <Link className={`${styles.tab} ${item.kind === kind ? styles.tabActive : ""}`} data-testid={`opencode-playbook-kind-${item.kind}`} key={item.kind} to={item.href}>{item.label}</Link>)}</nav>
          {kind !== "commands" && <div className={styles.tags}><span>try:</span>{tags.map((tag) => <button className={styles.tag} data-testid="opencode-playbook-hero-tag" key={tag} onClick={() => selectTag(tag)} type="button">#{tag}</button>)}</div>}
          {count ? <div className={styles.grid}>{visibleSkills.map((skill) => <SkillCard install={install} key={skill.name} onTag={selectTag} skill={skill} />)}{visibleCommands.map((command) => <CommandCard command={command} install={install} key={command.name} />)}</div> : <p className={styles.empty}>No playbook matches <code>{query.trim()}</code>.</p>}
        </section>
        {kind === "skills" && <ScopeTable kind="skills" />}{kind === "commands" && <ScopeTable kind="commands" />}
      </div>
      {detail}
    </main>
  );
}
