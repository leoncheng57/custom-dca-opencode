import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReminderMarkdown, type ReminderPreset } from "./reminders.js";

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

/** Parsed catalogue, read once per process. */
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
