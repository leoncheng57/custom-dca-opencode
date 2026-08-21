/** OpenCode skill-name contract, reused so every preset is a valid skill directory. */
export const REMINDER_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const REMINDER_ID_MAX = 255;

export interface ReminderPreset {
  id: string;
  description: string;
  body: string;
  /** Parsed for visibility but deliberately ignored by per-message injection. */
  triggers: string[];
}

export function parseReminderMarkdown(id: string, source: string): ReminderPreset | null {
  if (!isValidReminderId(id)) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source.replace(/^\uFEFF/, ""));
  if (!match) return null;

  const [, frontmatter, rest] = match;
  const scalars: Record<string, string> = {};
  const triggers: string[] = [];
  let listKey: string | null = null;

  for (const raw of frontmatter.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && listKey) {
      triggers.push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value.trim() === "") {
      listKey = key === "triggers" ? key : null;
      continue;
    }
    listKey = null;
    scalars[key] = unquote(value);
  }

  const body = rest.trim();
  const description = (scalars.description ?? "").trim();
  if (scalars.name !== undefined && scalars.name.trim() !== id) return null;
  if (body === "" || description === "") return null;
  return { id, description, body, triggers };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(\"|')([\s\S]*)\1$/.exec(trimmed);
  return (quoted ? quoted[2] : trimmed).trim();
}

export function isValidReminderId(id: unknown): id is string {
  return typeof id === "string" && id.length <= REMINDER_ID_MAX && REMINDER_ID_RE.test(id);
}

export function reminderTag(preset: Pick<ReminderPreset, "id" | "body">): string {
  return `<reminder name="${preset.id}">\n${preset.body.trim()}\n</reminder>`;
}

export function withReminderTag(text: string, preset: Pick<ReminderPreset, "id" | "body">): string {
  return `${text}\n\n${reminderTag(preset)}`;
}

export interface SplitMessage {
  text: string;
  reminders: Array<{ name: string; body: string }>;
}

// Keep byte-identical with client/lib/reminders.ts. Tests run one table against both.
const REMINDER_TAG_RE = /\n*<reminder name="([a-z0-9]+(?:-[a-z0-9]+)*)">\n?([\s\S]*?)\n?<\/reminder>/g;

export function splitReminderTags(input: string): SplitMessage {
  const reminders: Array<{ name: string; body: string }> = [];
  const text = input.replace(REMINDER_TAG_RE, (_match, name: string, body: string) => {
    reminders.push({ name, body: body.trim() });
    return "";
  });
  return { text: text.trim(), reminders };
}
