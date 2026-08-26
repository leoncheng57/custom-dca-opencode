import { ArrowRight, BookOpenCheck, Search, TerminalSquare, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { filterCommands, invocation } from "../../agent-skills/src/lib/commands.js";
import { COMMAND_SCOPES } from "../../agent-skills/src/lib/commandInstall.js";
import { INSTALL_SCOPES } from "../../agent-skills/src/lib/install.js";
import { allTags, filterSkills } from "../../agent-skills/src/lib/skills.js";
import { Badge } from "../ds/badge.js";
import { commands, skills, type Command, type Skill } from "../lib/playbooks.js";

type CatalogKind = "all" | "skills" | "commands";

function SkillCard({ skill, onTag }: { skill: Skill; onTag: (tag: string) => void }) {
  return (
    <article className="flex min-h-56 flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-5 transition-colors hover:border-[var(--color-border-focus)]" data-testid="opencode-playbook-skill-card">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="info">Skill</Badge>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{skill.readingTimeMinutes} min</span>
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">{skill.title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-muted)]">{skill.summary}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {skill.tags.map((tag) => (
          <button className="rounded-full border border-[var(--color-border-default)] px-2 py-1 text-[10px] text-[var(--color-text-muted)] hover:border-[var(--color-border-focus)] hover:text-[var(--color-text-default)]" data-testid="opencode-playbook-tag" key={tag} onClick={() => onTag(tag)} type="button">#{tag}</button>
        ))}
      </div>
      <Link className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-info)] hover:underline" data-testid={`opencode-playbook-skill-${skill.name}`} to={`/playbooks/skills/${skill.name}`}>Read playbook <ArrowRight aria-hidden="true" size={14} /></Link>
    </article>
  );
}

function CommandCard({ command }: { command: Command }) {
  return (
    <article className="flex min-h-56 flex-col rounded-xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-5 transition-colors hover:border-[var(--color-border-focus)]" data-testid="opencode-playbook-command-card">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="success">Command</Badge>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{command.subtask ? "subtask" : "session"}</span>
      </div>
      <h2 className="mt-5 font-mono text-lg font-semibold tracking-tight">{invocation(command.name, command.takesArguments)}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-muted)]">{command.description}</p>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-text-muted)]">
        {command.runsShell && <span className="rounded-full border border-[var(--color-border-default)] px-2 py-1">shell input</span>}
        {command.relatedSkills.map((skill) => <span className="rounded-full border border-[var(--color-border-default)] px-2 py-1" key={skill}>{skill}</span>)}
      </div>
      <Link className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-info)] hover:underline" data-testid={`opencode-playbook-command-${command.name}`} to={`/playbooks/commands/${command.name}`}>Read command <ArrowRight aria-hidden="true" size={14} /></Link>
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
    <section aria-labelledby={`${kind}-locations-heading`}>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-success)]">Install locations</span>
      <h2 className="mt-2 text-2xl font-bold tracking-tight" id={`${kind}-locations-heading`}>Where {kind} live</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">{kind === "skills" ? "Skills are portable directories read by several agent families. Global paths apply everywhere; project paths travel with one repository." : "Commands are individual OpenCode markdown files. They cost no context until a human invokes them."}</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-border-default)]">
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <thead className="bg-[var(--color-background-surface-neutral-muted)]"><tr><th className="p-3" scope="col">Path</th><th className="p-3" scope="col">Scope</th><th className="p-3" scope="col">Read by</th></tr></thead>
          <tbody>{scopes.map((scope) => <tr className="border-t border-[var(--color-border-default)]" key={scope.path}><th className="p-3 font-mono font-normal" scope="row">{scope.path}</th><td className="p-3">{scope.scope}</td><td className="p-3">{scope.readBy}<span className="mt-1 block text-[var(--color-text-muted)]">{scope.note}</span></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function PlaybooksPage({ kind = "all" }: { kind?: CatalogKind }) {
  const [query, setQuery] = useState("");
  const visibleSkills = useMemo(() => kind === "commands" ? [] : filterSkills(skills, query), [kind, query]);
  const visibleCommands = useMemo(() => kind === "skills" ? [] : filterCommands(commands, query), [kind, query]);
  const tags = useMemo(() => allTags(skills), []);
  const count = visibleSkills.length + visibleCommands.length;

  return (
    <main className="h-full overflow-y-auto" data-testid="opencode-playbooks">
      <div className="mx-auto max-w-6xl space-y-12 px-5 py-8 sm:px-8 sm:py-12">
        <header className="grid gap-8 border-b border-[var(--color-border-default)] pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2"><Badge variant="success">Playbooks</Badge><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">repository-owned agent procedures</span></div>
            <h1 className="max-w-3xl text-4xl font-bold leading-[0.98] tracking-[-0.04em] sm:text-6xl">Repeatable ways to work with an agent.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[var(--color-text-muted)] sm:text-base">Skills are selected by the model. Commands are invoked by a human. Guided workflows can join them here later without turning one content type into the whole product.</p>
          </div>
          <aside className="grid grid-cols-3 gap-2" aria-label="Playbook types">
            <div className="rounded-lg bg-[var(--color-background-surface-info-muted)] p-3 text-center"><BookOpenCheck className="mx-auto" size={18} /><strong className="mt-2 block text-xl">{skills.length}</strong><span className="text-[10px] uppercase tracking-wide">Skills</span></div>
            <div className="rounded-lg bg-[var(--color-background-surface-success-muted)] p-3 text-center"><TerminalSquare className="mx-auto" size={18} /><strong className="mt-2 block text-xl">{commands.length}</strong><span className="text-[10px] uppercase tracking-wide">Commands</span></div>
            <div className="rounded-lg bg-[var(--color-background-surface-neutral-muted)] p-3 text-center text-[var(--color-text-muted)]"><Workflow className="mx-auto" size={18} /><strong className="mt-2 block text-xl">Next</strong><span className="text-[10px] uppercase tracking-wide">Workflows</span></div>
          </aside>
        </header>

        <section aria-labelledby="playbook-catalog-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-success)]">Catalogue</span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight" id="playbook-catalog-heading">{count} matching playbooks</h2>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-3 focus-within:border-[var(--color-border-focus)]">
              <Search aria-hidden="true" className="text-[var(--color-text-muted)]" size={15} />
              <span className="sr-only">Filter playbooks</span>
              <input className="w-full bg-transparent text-sm outline-none sm:w-72" data-testid="opencode-playbook-filter" onChange={(event) => setQuery(event.target.value)} placeholder="name, tag, or trigger phrase" type="search" value={query} />
            </label>
          </div>
          <nav aria-label="Playbook types" className="mt-5 flex flex-wrap gap-2">
            {KINDS.map((item) => <Link className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${item.kind === kind ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface-info-muted)]" : "border-[var(--color-border-default)]"}`} key={item.kind} to={item.href}>{item.label}</Link>)}
          </nav>
          {kind !== "commands" && <div className="mt-3 flex flex-wrap gap-1.5"><span className="py-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Try</span>{tags.map((tag) => <button className="rounded-full px-2 py-1 text-[10px] text-[var(--color-text-info)] hover:bg-[var(--color-background-surface-info-muted)]" key={tag} onClick={() => setQuery(tag)} type="button">#{tag}</button>)}</div>}
          {count > 0 ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSkills.map((skill) => <SkillCard key={skill.name} onTag={setQuery} skill={skill} />)}
              {visibleCommands.map((command) => <CommandCard command={command} key={command.name} />)}
            </div>
          ) : <p className="mt-8 rounded-lg bg-[var(--color-background-surface-neutral-muted)] p-5 text-sm text-[var(--color-text-muted)]">No playbook matches <code>{query.trim()}</code>.</p>}
        </section>
        {kind === "skills" && <ScopeTable kind="skills" />}
        {kind === "commands" && <ScopeTable kind="commands" />}
      </div>
    </main>
  );
}
