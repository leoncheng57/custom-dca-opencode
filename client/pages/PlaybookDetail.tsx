import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { commandInstallMethods } from "../../agent-skills/src/lib/commandInstall.js";
import { invocation } from "../../agent-skills/src/lib/commands.js";
import { PlaybookCopyButton } from "../components/playbook-copy-button.js";
import { PlaybookSimulation } from "../components/playbook-simulation.js";
import { Alert } from "../ds/alert.js";
import { Markdown } from "../ds/markdown.js";
import { findCommand, playbookSource, PLAYBOOK_SOURCE_REVISION } from "../lib/playbooks.js";
import { usePlaybookInstallState } from "../lib/usePlaybookInstallState.js";
import { groupWorkflows } from "../lib/workflows.js";
import { InstallState, PlaybooksPage, useWorkflowCatalogue } from "./Playbooks.js";
import styles from "./playbooks.module.css";

type Method = { id: string; label: string; scope: string; note: string; command: string };

function InstallMethods({ methods }: { methods: Method[] }) {
  return <ol>{methods.map((method) => <li className={styles.method} key={method.id}><div className={styles.methodHead}><h3>{method.label}</h3><span className={styles.methodScope}>{method.scope}</span><span className={styles.methodCopy}><PlaybookCopyButton label={`${method.label} command`} value={method.command} /></span></div><p>{method.note}</p><pre className={styles.command}><code>{method.command}</code></pre></li>)}<p className={styles.meta} data-testid="opencode-playbook-install-note">Copying a command here does not install anything. Run it yourself, then restart OpenCode: commands are read at startup.</p></ol>;
}

function Modal({ children, returnTo = "/playbooks", title }: { children: ReactNode; returnTo?: string; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const dialog = dialogRef.current;
    const active = document.activeElement;
    previousFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { if (dialog?.open) dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  const closeToCatalog = () => {
    const previous = previousFocusRef.current;
    if (previous?.isConnected) {
      navigate(returnTo);
      requestAnimationFrame(() => { if (previous.isConnected) previous.focus(); });
      return;
    }
    navigate(returnTo, { state: { focusCatalog: true } });
  };
  return <dialog aria-label={title} className={styles.dialog} data-testid="opencode-playbook-dialog" onCancel={(event) => { event.preventDefault(); closeToCatalog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeToCatalog(); }} ref={dialogRef}><div className={styles.dialogBody}><button aria-label="Close playbook" className={styles.close} data-testid="opencode-playbook-close" onClick={closeToCatalog} ref={closeButtonRef} type="button"><X aria-hidden="true" size={18} /></button><Alert className={styles.wipWarning} data-testid="opencode-playbooks-wip-warning" variant="warning">Playbooks is still work in progress and its UI/UX may contain bugs.</Alert>{children}</div></dialog>;
}

function ScopeNote() {
  return <p className={styles.scopeNote} data-testid="opencode-playbook-scope-note">This page describes repository-owned command content. Viewing or copying here changes nothing: it does not install anything and does not attach anything to a conversation. Runtime reminders are separate, application-owned, per-message instructions.</p>;
}

function Disclosure({ children, meta, title }: { children: ReactNode; meta?: ReactNode; title: ReactNode }) {
  return <details className={styles.disclosure}><summary><h2>{title}</h2>{meta && <span className={styles.disclosureMeta}>{meta}</span>}</summary><div className={styles.disclosureBody}>{children}</div></details>;
}

export function CommandPlaybookPage() {
  const { name = "" } = useParams();
  const command = findCommand(name);
  const install = usePlaybookInstallState();
  if (!command) return <PlaybooksPage detail={<Modal title="Playbook not found"><section className={styles.notFound}><div className={styles.eyebrow}>Not found</div><h1 className={styles.modalTitle}>No command called "{name}"</h1><p className={styles.modalDescription}>It may have been renamed. The catalogue is generated directly from the repository.</p></section></Modal>} />;
  return <PlaybooksPage detail={<Modal title={`/${command.name}`}>
    <header className={styles.modalHead}><div className={styles.eyebrow}>Command - OpenCode only</div><h1 className={styles.modalTitle}>{invocation(command.name, command.takesArguments)}</h1><p className={styles.modalDescription}>{command.description}</p><div className={styles.route}>/playbooks/commands/{command.name}</div><InstallState install={install} installed={install.installedCommands.has(command.name)} /></header>
    <section className={styles.descriptionPanel}><div className={styles.descriptionBar}><span>frontmatter / description</span><PlaybookCopyButton label="description" value={command.description} /></div><div className={styles.descriptionBody}>{command.description}</div></section>
    {command.simulation && <section className={styles.detailGrid}><aside className={styles.side} data-testid="opencode-playbook-context"><div><div className={styles.eyebrow}>Context</div><h2>{command.subtask ? "Runs off-context." : "Runs in this session."}</h2><p>{command.runsShell ? "This command injects shell output before the model receives the template." : "This command injects its complete procedure only when a human invokes it."}</p></div></aside><PlaybookSimulation simulation={command.simulation} sourceHref={playbookSource.commandSimulation(command.name)} sourcePath={`command-simulations/${command.name}.md`} /></section>}
    <ScopeNote />
    <section className={styles.disclosures}><Disclosure meta={<PlaybookCopyButton label="command template" value={command.body} />} title="Command template"><Markdown internalLinksInSameTab source={command.body} /></Disclosure><Disclosure meta={`${commandInstallMethods(command.name).length} methods`} title={`Install /${command.name}`}><InstallMethods methods={commandInstallMethods(command.name)} /></Disclosure><a className={styles.source} data-testid="opencode-playbook-source-link" href={playbookSource.command(command.name)} rel="noreferrer" target="_blank">View command source on <code>{PLAYBOOK_SOURCE_REVISION}</code> <ExternalLink aria-hidden="true" size={13} /></a></section>
  </Modal>} />;
}

export function WorkflowPlaybookPage() {
  const { id = "" } = useParams();
  const state = useWorkflowCatalogue();
  const workflow = state.workflows.find((candidate) => candidate.id === id);
  let detail: ReactNode;
  if (state.status === "loading") {
    detail = <Modal returnTo="/playbooks/workflows" title="Loading workflow"><p className={styles.empty} data-testid="opencode-playbook-workflow-loading">Loading workflow...</p></Modal>;
  } else if (state.status === "error") {
    detail = <Modal returnTo="/playbooks/workflows" title="Workflow unavailable"><Alert data-testid="opencode-playbook-workflow-error" variant="danger">This workflow could not be loaded. Try again after the catalogue is available.</Alert></Modal>;
  } else if (!workflow) {
    detail = <Modal returnTo="/playbooks/workflows" title="Workflow not found"><section className={styles.notFound} data-testid="opencode-playbook-workflow-not-found"><div className={styles.eyebrow}>Not found</div><h1 className={styles.modalTitle}>No workflow called "{id}"</h1><p className={styles.modalDescription}>The live workflow catalogue loaded successfully, but it does not contain this id.</p></section></Modal>;
  } else {
    const group = groupWorkflows(state.workflows).find(({ workflows }) => workflows.some((candidate) => candidate.id === workflow.id))?.label ?? "Other";
    detail = <Modal returnTo="/playbooks/workflows" title={workflow.title}><header className={styles.modalHead}><div className={styles.eyebrow}>Workflow - {group}</div><h1 className={styles.modalTitle}>{workflow.title}</h1><p className={styles.modalDescription}>{workflow.description}</p><div className={styles.route}>/playbooks/workflows/{workflow.id}</div></header><section className={styles.injectorDetail} data-testid="opencode-playbook-workflow-injector"><div className={styles.descriptionBar}><span>Exact trusted injector</span><PlaybookCopyButton label="trusted injector" value={workflow.injector} /></div><pre><code>{workflow.injector}</code></pre></section><p className={styles.scopeNote}>This guided action is supplied by the live server catalogue. Viewing or copying its injector does not run, attach, or install anything.</p></Modal>;
  }
  return <PlaybooksPage detail={detail} workflowState={state} />;
}
