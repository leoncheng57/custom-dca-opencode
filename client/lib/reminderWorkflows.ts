/**
 * Reminders and workflows are independent mechanisms: a reminder attaches
 * trusted instructions to the next message, a workflow is a guided action the
 * human fills in and sends. This map is a documentation join and nothing more —
 * it decides where the picker's "details" link points, and grants no authority
 * to either side.
 *
 * It replaces the reminder-to-command join that lived in
 * `agent-skills/src/lib/reminderCommands.ts`. That map covered twelve reminders
 * because every reminder had a same-subject command beside it. Only six survive
 * here, and that is the honest number: the other six commands were deleted
 * rather than converted, precisely because the reminder already said everything
 * they said. Linking those to an unrelated workflow would invent a relationship
 * to keep a symmetry that no longer exists.
 *
 * A reminder with no entry simply renders no details link, which is already how
 * the picker treats an unmapped reminder.
 */
export const REMINDER_WORKFLOWS: Readonly<Record<string, string>> = Object.freeze({
  "deep-research-subagents": "deep-research",
  "docs-and-diagram-tooling": "docs-preview",
  "human-verification-steps": "verify",
  "native-worktree-subagents": "native-worktree-subagents",
  "parallel-research-handoff": "research-handoff",
  "session-handoff": "session-handoff",
});

export function workflowForReminder(reminderID: string): string | undefined {
  return REMINDER_WORKFLOWS[reminderID];
}
