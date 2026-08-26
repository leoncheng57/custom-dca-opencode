import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { commandInstallMethods } from "../../agent-skills/src/lib/commandInstall.js";
import { invocation } from "../../agent-skills/src/lib/commands.js";
import { installMethods } from "../../agent-skills/src/lib/install.js";
import { PlaybookCopyButton } from "../components/playbook-copy-button.js";
import { PlaybookSimulation } from "../components/playbook-simulation.js";
import { Badge } from "../ds/badge.js";
import { CollapsibleCard } from "../ds/card.js";
import { Markdown } from "../ds/markdown.js";
import { commandForSkill, findCommand, findSkill, playbookSource } from "../lib/playbooks.js";

function NotFound({ kind, name }: { kind: "skill" | "command"; name: string }) {
  return (
    <main className="h-full overflow-y-auto" data-testid="opencode-playbook-not-found">
      <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <Link className="flex items-center gap-2 text-sm text-[var(--color-text-info)] hover:underline" to="/playbooks"><ArrowLeft aria-hidden="true" size={14} /> All playbooks</Link>
        <h1 className="mt-8 text-3xl font-bold">No {kind} called “{name}”</h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">It may have been renamed. The catalogue is generated directly from the repository.</p>
      </div>
    </main>
  );
}

function DescriptionPanel({ children, copy }: { children: ReactNode; copy: string }) {
  return (
    <section className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)]" aria-label="Retrieval description">
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">frontmatter / description</span>
        <PlaybookCopyButton label="description" value={copy} />
      </div>
      <div className="p-5 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function InstallMethods({ methods, subject }: { methods: Array<{ id: string; label: string; scope: string; note: string; command: string }>; subject: string }) {
  return (
    <ol className="space-y-4">
      {methods.map((method) => (
        <li className="min-w-0 rounded-lg border border-[var(--color-border-default)] p-4" key={method.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{method.label}</h3>
            <Badge variant="neutral">{method.scope}</Badge>
            <span className="ml-auto"><PlaybookCopyButton label={`${method.label} command`} value={method.command} /></span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{method.note}</p>
          <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-[var(--color-background-surface-neutral-muted)] p-3 text-xs"><code>{method.command}</code></pre>
        </li>
      ))}
      <p className="text-xs text-[var(--color-text-muted)]">Restart OpenCode after installing {subject}; skills and commands are read at startup.</p>
    </ol>
  );
}

export function SkillPlaybookPage() {
  const { name = "" } = useParams();
  const skill = findSkill(name);
  if (!skill) return <NotFound kind="skill" name={name} />;
  const command = commandForSkill(skill.name);

  return (
    <main className="h-full overflow-y-auto" data-testid="opencode-skill-playbook">
      <article className="mx-auto max-w-4xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
        <Link className="flex items-center gap-2 text-sm text-[var(--color-text-info)] hover:underline" to="/playbooks/skills"><ArrowLeft aria-hidden="true" size={14} /> Skills</Link>
        <header className="border-b border-[var(--color-border-default)] pb-8">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="info">Skill</Badge>{skill.tags.map((tag) => <Badge key={tag} variant="neutral">#{tag}</Badge>)}</div>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.035em] sm:text-5xl">{skill.title}</h1>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-text-muted)]">
            <div><dt className="inline font-semibold text-[var(--color-text-default)]">Name </dt><dd className="inline font-mono">{skill.name}</dd></div>
            <div><dt className="inline font-semibold text-[var(--color-text-default)]">Read </dt><dd className="inline">{skill.readingTimeMinutes} min</dd></div>
            {skill.license && <div><dt className="inline font-semibold text-[var(--color-text-default)]">License </dt><dd className="inline">{skill.license}</dd></div>}
            <div><dt className="sr-only">Source</dt><dd><a className="inline-flex items-center gap-1 text-[var(--color-text-info)] hover:underline" href={playbookSource.skill(skill.name)} rel="noreferrer" target="_blank">SKILL.md <ExternalLink aria-hidden="true" size={12} /></a></dd></div>
          </dl>
        </header>
        {skill.description && <DescriptionPanel copy={skill.description}>{skill.description}</DescriptionPanel>}
        {command && <p className="rounded-lg border-l-4 border-[var(--color-border-focus)] bg-[var(--color-background-surface-info-muted)] p-4 text-sm">Short form: <Link className="font-mono font-semibold text-[var(--color-text-info)] hover:underline" to={`/playbooks/commands/${command.name}`}>/{command.name}</Link> invokes the happy path and defers here for failure modes.</p>}
        {skill.simulation && <CollapsibleCard defaultOpen headerRight={<span className="text-xs text-[var(--color-text-muted)]">{skill.simulation.title}</span>} title="Simulation example"><PlaybookSimulation simulation={skill.simulation} /></CollapsibleCard>}
        <CollapsibleCard defaultOpen={false} headerRight={<span className="text-xs text-[var(--color-text-muted)]">{skill.readingTimeMinutes} min</span>} title="Full instructions"><Markdown internalLinksInSameTab source={skill.body} /></CollapsibleCard>
        <CollapsibleCard defaultOpen={false} headerRight={<span className="text-xs text-[var(--color-text-muted)]">{installMethods(skill.name).length} methods</span>} title={`Install ${skill.name}`}><InstallMethods methods={installMethods(skill.name)} subject="the skill" /></CollapsibleCard>
      </article>
    </main>
  );
}

export function CommandPlaybookPage() {
  const { name = "" } = useParams();
  const command = findCommand(name);
  if (!command) return <NotFound kind="command" name={name} />;

  return (
    <main className="h-full overflow-y-auto" data-testid="opencode-command-playbook">
      <article className="mx-auto max-w-4xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
        <Link className="flex items-center gap-2 text-sm text-[var(--color-text-info)] hover:underline" to="/playbooks/commands"><ArrowLeft aria-hidden="true" size={14} /> Commands</Link>
        <header className="border-b border-[var(--color-border-default)] pb-8">
          <Badge variant="success">Command</Badge>
          <h1 className="mt-5 font-mono text-3xl font-bold tracking-[-0.035em] sm:text-5xl">{invocation(command.name, command.takesArguments)}</h1>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-text-muted)]">
            <div><dt className="inline font-semibold text-[var(--color-text-default)]">Agent </dt><dd className="inline">{command.agent ?? "current"}</dd></div>
            <div><dt className="inline font-semibold text-[var(--color-text-default)]">Context </dt><dd className="inline">{command.subtask ? "subagent" : "this session"}</dd></div>
            {command.model && <div><dt className="inline font-semibold text-[var(--color-text-default)]">Model </dt><dd className="inline">{command.model}</dd></div>}
            <div><dt className="sr-only">Source</dt><dd><a className="inline-flex items-center gap-1 text-[var(--color-text-info)] hover:underline" href={playbookSource.command(command.name)} rel="noreferrer" target="_blank">{command.name}.md <ExternalLink aria-hidden="true" size={12} /></a></dd></div>
          </dl>
        </header>
        {command.description && <DescriptionPanel copy={command.description}>{command.description}</DescriptionPanel>}
        <p className="rounded-lg border-l-4 border-[var(--color-border-focus)] bg-[var(--color-background-surface-info-muted)] p-4 text-sm">
          {command.relatedSkills.length ? <>Builds on {command.relatedSkills.map((skill, index) => <span key={skill}>{index ? ", " : ""}<Link className="font-semibold text-[var(--color-text-info)] hover:underline" to={`/playbooks/skills/${skill}`}>{skill}</Link></span>)}.</> : <>Standalone: no skill behind it, so it consumes no permanent retrieval context.</>}
        </p>
        {command.simulation && <CollapsibleCard defaultOpen headerRight={<span className="text-xs text-[var(--color-text-muted)]">{command.simulation.title}</span>} title="Simulation example"><PlaybookSimulation simulation={command.simulation} /></CollapsibleCard>}
        <CollapsibleCard defaultOpen={false} headerRight={<PlaybookCopyButton label="command template" value={command.body} />} title="Command template"><Markdown internalLinksInSameTab source={command.body} /></CollapsibleCard>
        <CollapsibleCard defaultOpen={false} headerRight={<span className="text-xs text-[var(--color-text-muted)]">{commandInstallMethods(command.name).length} methods</span>} title={`Install /${command.name}`}><InstallMethods methods={commandInstallMethods(command.name)} subject="the command" /></CollapsibleCard>
      </article>
    </main>
  );
}
