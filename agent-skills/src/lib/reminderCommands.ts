/**
 * Runtime reminders and repository commands are independent content. This
 * explicit join exists only for the reminder picker's documentation links.
 */
export const REMINDER_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  'ascii-diagrams': 'diagram',
  'background-subagent': 'background',
  'build-waves': 'build-waves',
  'cite-file-lines': 'cite-file-lines',
  'deep-research-subagents': 'deep-research',
  'docs-and-diagram-tooling': 'docs-preview',
  'duck-mode': 'duck-mode',
  'grill-me': 'grill-me',
  'human-verification-steps': 'verify',
  'native-worktree-subagents': 'native-worktree-subagents',
  'parallel-research-handoff': 'research-handoff',
  'session-handoff': 'session-handoff',
})

const names = Object.values(REMINDER_COMMANDS)
if (new Set(names).size !== names.length) {
  throw new Error('Reminder command mappings must be unique')
}

export function commandForReminder(reminderId: string): string | undefined {
  return REMINDER_COMMANDS[reminderId]
}
