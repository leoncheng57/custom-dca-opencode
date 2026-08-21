// Manual reminder blocks, client side. A reminder attached to a single message
// travels inside the message content wrapped in a sentinel tag. The transcript
// pulls it back out so the bubble shows what was typed and the reminder renders
// separately.
//
// `splitReminderTags` deliberately duplicates server/reminders/reminders.ts.
// Sharing the server module would cross the browser/server seam for one regex;
// drift is prevented by tests/reminders.test.ts running one case table against
// BOTH copies. Keep the regex and body byte-identical.

export interface SplitMessage {
  text: string;
  reminders: Array<{ name: string; body: string }>;
}

const REMINDER_TAG_RE = /\n*<reminder name="([a-z0-9]+(?:-[a-z0-9]+)*)">\n?([\s\S]*?)\n?<\/reminder>/g;

export function splitReminderTags(input: string): SplitMessage {
  const reminders: Array<{ name: string; body: string }> = [];
  const text = input.replace(REMINDER_TAG_RE, (_match, name: string, body: string) => {
    reminders.push({ name, body: body.trim() });
    return "";
  });
  return { text: text.trim(), reminders };
}
