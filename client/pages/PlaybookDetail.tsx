import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { commandInstallMethods } from "../../agent-skills/src/lib/commandInstall.js";
import { invocation } from "../../agent-skills/src/lib/commands.js";
import { installMethods } from "../../agent-skills/src/lib/install.js";
import { PlaybookCopyButton } from "../components/playbook-copy-button.js";
import { PlaybookSimulation } from "../components/playbook-simulation.js";
import { Alert } from "../ds/alert.js";
import { Markdown } from "../ds/markdown.js";
import { commandForSkill, findCommand, findSkill, playbookSource } from "../lib/playbooks.js";
import { PlaybooksPage } from "./Playbooks.js";
import styles from "./playbooks.module.css";

type Method = { id: string; label: string; scope: string; note: string; command: string };

function InstallMethods({ methods, subject }: { methods: Method[]; subject: string }) {
  return <ol>{methods.map((method) => <li className={styles.method} key={method.id}><div className={styles.methodHead}><h3>{method.label}</h3><span className={styles.methodScope}>{method.scope}</span><span className={styles.methodCopy}><PlaybookCopyButton label={`${method.label} command`} value={method.command} /></span></div><p>{method.note}</p><pre className={styles.command}><code>{method.command}</code></pre></li>)}<p className={styles.meta}>Restart OpenCode after installing {subject}; skills and commands are read at startup.</p></ol>;
}

function Modal({ children, title }: { children: ReactNode; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const dialog = dialogRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocusRef.current?.focus();
    };
  }, []);
  const closeToCatalog = () => navigate("/playbooks");
  return <dialog aria-label={title} className={styles.dialog} data-testid="opencode-playbook-dialog" onCancel={(event) => { event.preventDefault(); closeToCatalog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeToCatalog(); }} ref={dialogRef}><div className={styles.dialogBody}><button aria-label="Close playbook" className={styles.close} onClick={closeToCatalog} ref={closeButtonRef} type="button"><X aria-hidden="true" size={18} /></button><Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>{children}</div></dialog>;
}

function Disclosure({ children, defaultOpen = false, meta, title }: { children: ReactNode; defaultOpen?: boolean; meta?: ReactNode; title: ReactNode }) {
  return <details className={styles.disclosure} open={defaultOpen}><summary><h2>{title}</h2>{meta && <span className={styles.disclosureMeta}>{meta}</span>}</summary><div className={styles.disclosureBody}>{children}</div></details>;
}

function NotFound({ kind, name }: { kind: string; name: string }) {
  return <PlaybooksPage detail={<Modal title="Playbook not found"><section className={styles.notFound}><div className={styles.eyebrow}>Not found</div><h1 className={styles.modalTitle}>No {kind} called “{name}”</h1><p className={styles.modalDescription}>It may have been renamed. The catalogue is generated directly from the repository.</p></section></Modal>} />;
}

export function SkillPlaybookPage() {
  const { name = "" } = useParams();
  const skill = findSkill(name);
  if (!skill) return <NotFound kind="skill" name={name} />;
  const command = commandForSkill(skill.name);
  return <PlaybooksPage detail={<Modal title={skill.title}><header className={styles.modalHead}><div className={styles.eyebrow}>Skill · visual explanation</div><h1 className={styles.modalTitle}>{skill.title}</h1><p className={styles.modalDescription}>{skill.description}</p><div className={styles.route}>/playbooks/skills/{skill.name}</div></header><div className={styles.detailGrid}><aside className={styles.side}><div><div className={styles.eyebrow}>When to use</div><h2>Make the path visible.</h2><p>{skill.summary}</p></div>{skill.simulation && <details className={styles.note} open><summary>Simulation disclosure</summary><p>{skill.simulation.caveat}</p></details>}</aside>{skill.simulation && <PlaybookSimulation simulation={skill.simulation} sourceHref={playbookSource.skillSimulation(skill.name)} sourcePath={`skills/${skill.name}/SIMULATION.md`} />}</div><section className={styles.descriptionPanel}><div className={styles.descriptionBar}><span>frontmatter / description</span><PlaybookCopyButton label="description" value={skill.description} /></div><div className={styles.descriptionBody}>{skill.description}</div></section>{command && <p className={styles.relation}>Short form: <Link to={`/playbooks/commands/${command.name}`}>/{command.name}</Link> invokes the happy path and defers here for failure modes.</p>}<section className={styles.disclosures}><Disclosure meta={`${skill.readingTimeMinutes} min`} title="Full instructions"><Markdown internalLinksInSameTab source={skill.body} /></Disclosure><Disclosure meta={`${installMethods(skill.name).length} methods`} title={`Install ${skill.name}`}><InstallMethods methods={installMethods(skill.name)} subject="the skill" /></Disclosure><a className={styles.source} href={playbookSource.skill(skill.name)} rel="noreferrer" target="_blank">View SKILL.md <ExternalLink aria-hidden="true" size={12} /></a></section></Modal>} />;
}

export function CommandPlaybookPage() {
  const { name = "" } = useParams();
  const command = findCommand(name);
  if (!command) return <NotFound kind="command" name={name} />;
  return <PlaybooksPage detail={<Modal title={`/${command.name}`}><header className={styles.modalHead}><div className={styles.eyebrow}>Command · OpenCode only</div><h1 className={styles.modalTitle}>{invocation(command.name, command.takesArguments)}</h1><p className={styles.modalDescription}>{command.description}</p><div className={styles.route}>/playbooks/commands/{command.name}</div></header><section className={styles.descriptionPanel}><div className={styles.descriptionBar}><span>frontmatter / description</span><PlaybookCopyButton label="description" value={command.description} /></div><div className={styles.descriptionBody}>{command.description}</div></section><p className={styles.relation}>{command.relatedSkills.length ? <>Builds on {command.relatedSkills.map((skill, index) => <span key={skill}>{index ? ", " : ""}<Link to={`/playbooks/skills/${skill}`}>{skill}</Link></span>)}.</> : "Standalone: no skill behind it, so it consumes no permanent retrieval context."}</p>{command.simulation && <section className={styles.detailGrid}><aside className={styles.side}><div><div className={styles.eyebrow}>Context</div><h2>{command.subtask ? "Runs off-context." : "Runs in this session."}</h2><p>{command.runsShell ? "This command injects shell output before the model receives the template." : "This command injects its template only when a human invokes it."}</p></div><details className={styles.note} open><summary>Simulation disclosure</summary><p>{command.simulation.caveat}</p></details></aside><PlaybookSimulation simulation={command.simulation} sourceHref={playbookSource.commandSimulation(command.name)} sourcePath={`command-simulations/${command.name}.md`} /></section>}<section className={styles.disclosures}><Disclosure meta={<PlaybookCopyButton label="command template" value={command.body} />} title="Command template"><Markdown internalLinksInSameTab source={command.body} /></Disclosure><Disclosure meta={`${commandInstallMethods(command.name).length} methods`} title={`Install /${command.name}`}><InstallMethods methods={commandInstallMethods(command.name)} subject="the command" /></Disclosure><a className={styles.source} href={playbookSource.command(command.name)} rel="noreferrer" target="_blank">View {command.name}.md <ExternalLink aria-hidden="true" size={12} /></a></section></Modal>} />;
}
