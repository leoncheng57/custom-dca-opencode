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

export const REMINDER_TOPIC_TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const REMINDER_TAGS_MAX = 3;

/**
 * `owner/repo`, lowercase. Deliberately a FLAT key: the frontmatter reader
 * below is a line scanner whose pair regex is anchored with no leading
 * whitespace, so a nested `scope:` / `  repository:` spelling would parse to
 * nothing and the preset would load as an unscoped, everywhere-visible
 * reminder. Fail-open is exactly the wrong direction here.
 */
export const REMINDER_SCOPE_RE = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/;

export interface ReminderPreset {
  id: string;
  title: string;
  description: string;
  body: string;
  source?: ReminderSource;
  /**
   * When set, this reminder is only visible — and only injectable — in a
   * directory whose git `origin` resolves to this repository. Unset means
   * generally visible.
   */
  scopeRepository?: string;
  /** Parsed for visibility but deliberately ignored by per-message injection. */
  triggers: string[];
  /**
   * Retrieval tags, mirrored from the reminder's Playbook skill so the picker
   * can filter without inventing a second taxonomy. `tests/reminders.test.ts`
   * asserts the two stay identical, which is what keeps them from drifting.
   */
  tags: string[];
}

/** Comma-separated, deduplicated, order-preserving. Mirrors agent-skills. */
function parseTags(value: string): string[] | null {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (tag === "") continue;
    if (!REMINDER_TOPIC_TAG_RE.test(tag)) return null;
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > REMINDER_TAGS_MAX ? null : tags;
}

export function parseReminderMarkdown(id: string, markdown: string): ReminderPreset | null {
  if (!isValidReminderId(id)) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown.replace(/^\uFEFF/, ""));
  if (!match) return null;

  const [, frontmatter, rest] = match;
  const scalars: Record<string, string> = {};
  const triggers: string[] = [];
  // Keys written with no value. An empty `scope_repository:` must not be
  // indistinguishable from an absent one, or a typo silently publishes a
  // reminder that asked to be restricted.
  const blankKeys = new Set<string>();
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
      blankKeys.add(key);
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
    || !/^(?:agent-skills\/)?skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(sourceFields[1]!)
    || !/^[0-9a-f]{40}$/.test(sourceFields[2]!)
  )) return null;
  const provenance = sourceFields[0]
    ? { repo: sourceFields[0], path: sourceFields[1]!, commit: sourceFields[2]! }
    : undefined;

  // A malformed tag list rejects the whole preset rather than silently shipping
  // an unfiltered reminder, matching how provenance is handled above.
  const tags = scalars.tags === undefined ? [] : parseTags(scalars.tags);
  if (tags === null) return null;

  // A malformed scope must reject the preset, never fall through to "general".
  // Dropping the reminder entirely is the fail-closed outcome.
  let scopeRepository: string | undefined;
  if (blankKeys.has("scope_repository")) return null;
  if (scalars.scope_repository !== undefined) {
    const scope = scalars.scope_repository.trim().toLowerCase();
    if (!REMINDER_SCOPE_RE.test(scope)) return null;
    scopeRepository = scope;
  }

  return { id, title, description, body, triggers, tags, scopeRepository, source: provenance };
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
