import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PlaybookCopyButton } from "../components/playbook-copy-button.js";
import { PlaybookSimulation } from "../components/playbook-simulation.js";
import { Alert } from "../ds/alert.js";
import { reminderGroupLabel } from "../lib/reminderCatalogue.js";
import { reminderSimulation, simulationPath, simulationSource, workflowSimulation } from "../lib/simulations.js";
import { groupWorkflows } from "../lib/workflows.js";
import { PlaybooksPage, useReminderCatalogue, useWorkflowCatalogue } from "./Playbooks.js";
import styles from "./playbooks.module.css";

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

export function ReminderPlaybookPage() {
  const { id = "" } = useParams();
  const state = useReminderCatalogue();
  const reminder = state.reminders.find((candidate) => candidate.id === id);
  let detail: ReactNode;
  if (state.status === "loading") {
    detail = <Modal returnTo="/playbooks/reminders" title="Loading reminder"><p className={styles.empty} data-testid="opencode-playbook-reminder-loading">Loading reminder...</p></Modal>;
  } else if (state.status === "error") {
    detail = <Modal returnTo="/playbooks/reminders" title="Reminder unavailable"><Alert data-testid="opencode-playbook-reminder-error" variant="danger">This reminder could not be loaded. Try again after the catalogue is available.</Alert></Modal>;
  } else if (!reminder) {
    // A repository-scoped reminder is genuinely absent for another project, so
    // this must not claim the id is invalid — only that this catalogue, for
    // this directory, does not contain it.
    detail = <Modal returnTo="/playbooks/reminders" title="Reminder not found"><section className={styles.notFound} data-testid="opencode-playbook-reminder-not-found"><div className={styles.eyebrow}>Not found</div><h1 className={styles.modalTitle}>No reminder called "{id}"</h1><p className={styles.modalDescription}>The reminder catalogue loaded successfully, but it does not contain this id for the currently selected project. A reminder scoped to a different repository is not listed here.</p></section></Modal>;
  } else {
    const group = reminderGroupLabel(state.reminders, reminder.id);
    detail = <Modal returnTo="/playbooks/reminders" title={reminder.title}>
      <header className={styles.modalHead}><div className={styles.eyebrow}>Reminder - {group}</div><h1 className={styles.modalTitle}>{reminder.title}</h1><p className={styles.modalDescription}>{reminder.description}</p><div className={styles.route}>/playbooks/reminders/{reminder.id}</div></header>
      {/*
        * When it fires is the reminder equivalent of "what it asks for": a
        * reminder collects nothing, so the useful fact is the situation its
        * author intended it for.
        */}
      <section className={styles.descriptionPanel} data-testid="opencode-playbook-reminder-input">
        <div className={styles.descriptionBar}><span>when to attach it</span></div>
        <div className={styles.descriptionBody}>{reminder.triggers.length > 0
          ? <>Attach it when: {reminder.triggers.join("; ")}.</>
          : <>Its author named no specific trigger. Attach it whenever the instructions below are what you want applied.</>}
          {reminder.scopeRepository ? <> This reminder is scoped to <code>{reminder.scopeRepository}</code> and is only listed for a project whose git origin matches.</> : null}</div>
      </section>
      <section className={styles.injectorDetail} data-testid="opencode-playbook-reminder-body"><div className={styles.descriptionBar}><span>Exact instructions appended</span><PlaybookCopyButton label="reminder instructions" value={reminder.body} /></div><pre><code>{reminder.body}</code></pre></section>
      {(() => { const simulation = reminderSimulation(reminder.id); return simulation
        ? <PlaybookSimulation simulation={simulation} sourceHref={simulationSource.reminder(reminder.id)} sourcePath={simulationPath.reminder(reminder.id)} />
        : null; })()}
      <p className={styles.scopeNote} data-testid="opencode-playbook-scope-note">This reminder is supplied by the live server catalogue. Viewing or copying it does not attach, run, or install anything. Attaching it in the composer applies it to your next message only, and the send carries the reminder's id alone — the server resolves this text again at submit time, so what you read here is what is appended.</p>
    </Modal>;
  }
  return <PlaybooksPage detail={detail} reminderState={state} />;
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
    detail = <Modal returnTo="/playbooks/workflows" title={workflow.title}>
      <header className={styles.modalHead}><div className={styles.eyebrow}>Workflow - {group}</div><h1 className={styles.modalTitle}>{workflow.title}</h1><p className={styles.modalDescription}>{workflow.description}</p><div className={styles.route}>/playbooks/workflows/{workflow.id}</div></header>
      {/*
        * What the workflow collects is part of reading it: a workflow whose
        * typed text becomes the prompt behaves very differently from one that
        * ships a fixed prompt and asks for nothing.
        */}
      <section className={styles.descriptionPanel} data-testid="opencode-playbook-workflow-input">
        <div className={styles.descriptionBar}><span>what it asks for</span></div>
        <div className={styles.descriptionBody}>{workflow.argument
          ? <>Collects one field, <strong>{workflow.argument.label}</strong> ({workflow.argument.required ? "required" : "optional"}, up to {workflow.argument.maxLength.toLocaleString()} characters). What you type becomes the prompt.{workflow.argument.hint ? ` ${workflow.argument.hint}` : ""}</>
          : workflow.prompt
            ? <>Collects nothing. It sends this fixed prompt: "{workflow.prompt}"</>
            : <>Collects nothing here — this workflow supplies its own form in the composer.</>}</div>
      </section>
      <section className={styles.injectorDetail} data-testid="opencode-playbook-workflow-injector"><div className={styles.descriptionBar}><span>Exact trusted injector</span><PlaybookCopyButton label="trusted injector" value={workflow.injector} /></div><pre><code>{workflow.injector}</code></pre></section>
      {(() => { const simulation = workflowSimulation(workflow.id); return simulation
        ? <PlaybookSimulation simulation={simulation} sourceHref={simulationSource.workflow(workflow.id)} sourcePath={simulationPath.workflow(workflow.id)} />
        : null; })()}
      <p className={styles.scopeNote} data-testid="opencode-playbook-scope-note">This guided action is supplied by the live server catalogue. Viewing or copying its injector does not run, attach, or install anything. It is sent in the sending session's current mode: a workflow carries no declarative Plan or Build setting of its own.</p>
    </Modal>;
  }
  return <PlaybooksPage detail={detail} workflowState={state} />;
}
