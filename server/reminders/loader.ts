import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReminderMarkdown, type ReminderPreset } from "./reminders.js";
import { formatIdentity, resolveRepositoryIdentity } from "./repository-identity.js";

const CATALOGUE_DIR = "reminders";

/** Nearest ancestor containing reminders/, from tsx source or compiled dist. */
function findCatalogueDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, CATALOGUE_DIR);
    try {
      // `server/reminders/` is this module's own directory. Require at least
      // one preset subdirectory so it is not mistaken for the root catalogue.
      if (readdirSync(candidate, { withFileTypes: true }).some((entry) => entry.isDirectory())) {
        return candidate;
      }
    } catch {
      // Keep walking towards the repository root.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function read(dir: string): ReminderPreset[] {
  const presets: ReminderPreset[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, "SKILL.md");
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      console.warn(`[reminders] ${file} has no SKILL.md; skipped`);
      continue;
    }
    const preset = parseReminderMarkdown(entry.name, source);
    if (!preset) {
      console.warn(`[reminders] ${file} could not be parsed; skipped`);
      continue;
    }
    presets.push(preset);
  }
  return presets.sort((a, b) => a.id.localeCompare(b.id));
}

let cached: ReminderPreset[] | null = null;

/**
 * Parsed catalogue, read once per process.
 *
 * This is the PARSE cache and is deliberately directory-agnostic — a preset is
 * derived purely from file content. Never memoise a *filtered* list here: the
 * `if (cached)` check has no key, so the first directory's answer would be
 * served to every other directory for the life of the process. Scope filtering
 * belongs in `visibleReminders`, per request.
 */
export function reminderCatalogue(): readonly ReminderPreset[] {
  if (cached) return cached;
  const dir = findCatalogueDir();
  if (!dir) {
    console.warn("[reminders] reminders/ directory not found; catalogue is empty");
    cached = [];
    return cached;
  }
  cached = read(dir);
  if (cached.length === 0) console.warn(`[reminders] ${dir} parsed to zero presets`);
  return cached;
}

/**
 * The presets visible in one directory.
 *
 * Unscoped presets are always visible. A scoped preset requires the directory's
 * git `origin` to resolve to exactly its repository; an unresolvable identity
 * hides it. Callers must pass an already-canonicalised directory.
 */
export async function visibleReminders(directory: string): Promise<readonly ReminderPreset[]> {
  return filterByScope(reminderCatalogue(), directory);
}

/** Resolve one preset by id, honouring scope. Returns undefined when hidden. */
export async function visibleReminder(directory: string, id: string): Promise<ReminderPreset | undefined> {
  const preset = reminderCatalogue().find((item) => item.id === id);
  return preset && (await isInScope(preset, directory)) ? preset : undefined;
}

/**
 * Scope filter over an explicit preset list.
 *
 * Takes its input rather than reading the cache so the visibility rules can be
 * tested against fixture presets without mocking module internals.
 */
export async function filterByScope(
  presets: readonly ReminderPreset[],
  directory: string,
): Promise<readonly ReminderPreset[]> {
  // Resolve identity at most once, and not at all when nothing is scoped.
  if (!presets.some((preset) => preset.scopeRepository)) return presets;
  const current = await currentIdentity(directory);
  return presets.filter((preset) => !preset.scopeRepository || preset.scopeRepository === current);
}

/** Whether one preset may be seen, or injected, from `directory`. */
export async function isInScope(preset: ReminderPreset, directory: string): Promise<boolean> {
  if (!preset.scopeRepository) return true;
  return (await currentIdentity(directory)) === preset.scopeRepository;
}

async function currentIdentity(directory: string): Promise<string | null> {
  if (!directory) return null;
  const identity = await resolveRepositoryIdentity(directory);
  return identity ? formatIdentity(identity) : null;
}
