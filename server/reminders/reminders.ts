/** OpenCode skill-name contract, reused so every preset is a valid skill directory. */
export const REMINDER_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const REMINDER_ID_MAX = 255;
export const REMINDER_TITLE_MAX = 100;
export const REMINDER_DESCRIPTION_MAX = 1_000;
export const REMINDER_BODY_MAX = 24_000;

export interface ReminderSource {
  repo: string;
  path: string;
  commit: string;
}

export interface ReminderPreset {
  id: string;
  title: string;
  description: string;
  body: string;
  source?: ReminderSource;
  /** Parsed for visibility but deliberately ignored by per-message injection. */
  triggers: string[];
}

export function parseReminderMarkdown(id: string, markdown: string): ReminderPreset | null {
  if (!isValidReminderId(id)) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown.replace(/^\uFEFF/, ""));
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
  const title = (scalars.title ?? id.split("-").map(capitalize).join(" ")).trim();
  const description = (scalars.description ?? "").trim();
  if (scalars.name !== undefined && scalars.name.trim() !== id) return null;
  if (
    body === "" || body.length > REMINDER_BODY_MAX
    || title === "" || title.length > REMINDER_TITLE_MAX
    || description === "" || description.length > REMINDER_DESCRIPTION_MAX
  ) return null;

  const sourceFields = [scalars.source_repo, scalars.source_path, scalars.source_commit];
  if (sourceFields.some((value) => value !== undefined) && sourceFields.some((value) => !value)) return null;
  if (sourceFields[0] && (
    !/^https:\/\/[^\s]+$/.test(sourceFields[0])
    || !/^skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(sourceFields[1]!)
    || !/^[0-9a-f]{40}$/.test(sourceFields[2]!)
  )) return null;
  const provenance = sourceFields[0]
    ? { repo: sourceFields[0], path: sourceFields[1]!, commit: sourceFields[2]! }
    : undefined;
  return { id, title, description, body, triggers, source: provenance };
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
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
