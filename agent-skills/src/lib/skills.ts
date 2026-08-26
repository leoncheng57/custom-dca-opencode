import { parseFrontmatter, stripLeadingHeading } from './frontmatter'
// Type-only, so nothing is imported at runtime and the fact that
// simulation.ts imports `directoryNameFromPath` from here is not a cycle.
import type { Simulation } from './simulation'

/**
 * The Agent Skills spec (agentskills.io) requires only `name` and
 * `description`; `license`, `compatibility` and the `metadata` string map are
 * optional. Anything else an author adds is ignored rather than rejected.
 */
export interface SkillFrontmatter {
  name?: string
  description?: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

export interface Skill {
  /** Directory name under skills/ — the canonical id and the URL segment. */
  name: string
  /** Human-facing heading: Title-Cased `name`, or `metadata.title` when set. */
  title: string
  /** Full frontmatter description, written for retrieval rather than for reading. */
  description: string
  /** First sentence of the description, for card subtitles. */
  summary: string
  tags: string[]
  license?: string
  compatibility?: string
  metadata: Record<string, string>
  /** Markdown body with the leading H1 removed. */
  body: string
  /** Rough reading time of the body, in minutes. */
  readingTimeMinutes: number
  /** Body length in bytes, shown as a rough weight indicator. */
  bytes: number
  /**
   * The worked example from the sibling `SIMULATION.md`, when the skill
   * directory ships one. Absent is a normal state, not a gap: the page simply
   * renders without that section.
   */
  simulation?: Simulation
}

const WORDS_PER_MINUTE = 220

/** Words that end in a period without ending a sentence. */
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'al', 'mr', 'ms', 'dr', 'no'])

const SUMMARY_MAX_LENGTH = 240

export function directoryNameFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  // .../skills/<name>/SKILL.md
  return segments[segments.length - 2] ?? ''
}

/**
 * `parallel-research-handoff` becomes `Parallel Research Handoff`. Tokens that
 * are already mixed- or upper-case (`cmux`, `AWS`) keep their own casing, so an
 * author can spell a product name correctly in the directory name.
 */
export function titleFromName(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((token) => (/[A-Z]/.test(token) ? token : token.charAt(0).toUpperCase() + token.slice(1)))
    .join(' ')
}

/**
 * Descriptions are ~500 characters of keyword-stuffed prose aimed at an agent's
 * retrieval step. Cards show only the first sentence, hard-capped so that an
 * author who writes one enormous sentence cannot blow out the layout.
 */
export function firstSentence(description: string, maxLength = SUMMARY_MAX_LENGTH): string {
  const text = description.replace(/\s+/g, ' ').trim()
  if (text === '') {
    return ''
  }

  for (let index = 0; index < text.length; index += 1) {
    if (!'.!?'.includes(text[index])) {
      continue
    }
    const next = text[index + 1]
    if (next !== undefined && next !== ' ') {
      continue
    }
    const precedingWord = text
      .slice(0, index)
      .split(/[\s(]/)
      .pop()
    if (text[index] === '.' && precedingWord && ABBREVIATIONS.has(precedingWord.toLowerCase())) {
      continue
    }
    const sentence = text.slice(0, index + 1)
    return sentence.length <= maxLength ? sentence : truncateOnWord(sentence, maxLength)
  }

  return text.length <= maxLength ? text : truncateOnWord(text, maxLength)
}

function truncateOnWord(text: string, maxLength: number): string {
  const clipped = text.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:.\s]+$/, '')}\u2026`
}

/** `metadata.tags` is a comma-separated string, per the spec's string→string map. */
export function parseTags(rawTags: string | undefined): string[] {
  if (!rawTags) {
    return []
  }
  const seen = new Set<string>()
  return rawTags
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (tag === '' || seen.has(tag.toLowerCase())) {
        return false
      }
      seen.add(tag.toLowerCase())
      return true
    })
}

export function readingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

function byteLength(text: string): number {
  return typeof TextEncoder === 'undefined' ? text.length : new TextEncoder().encode(text).length
}

export function parseSkill(path: string, raw: string, simulation?: Simulation): Skill | null {
  const directoryName = directoryNameFromPath(path)
  if (!directoryName) {
    return null
  }

  const { data, content } = parseFrontmatter<SkillFrontmatter>(raw)
  const metadata = data.metadata ?? {}
  // The directory name is authoritative: it is what every install command and
  // the skills CLI address, so a mismatched frontmatter `name` cannot win.
  const name = directoryName
  const description = (data.description ?? '').trim()
  const body = stripLeadingHeading(content).trim()

  return {
    name,
    title: metadata.title?.trim() || titleFromName(name),
    description,
    summary: firstSentence(description),
    tags: parseTags(metadata.tags),
    license: data.license,
    compatibility: data.compatibility,
    metadata,
    body,
    readingTimeMinutes: readingTimeMinutes(body),
    bytes: byteLength(raw),
    ...(simulation ? { simulation } : {}),
  }
}

/**
 * Sorted by name so the catalog order is stable across builds.
 *
 * `simulations` is keyed by skill directory name and defaults to empty, which
 * keeps every existing caller and test working unchanged. A simulation whose
 * directory has no `SKILL.md` produces no skill and is silently dropped —
 * `simulation.test.ts` asserts no such orphan exists.
 */
export function loadSkillsFromFiles(
  files: Record<string, string>,
  simulations: ReadonlyMap<string, Simulation> = new Map()
): Skill[] {
  return Object.entries(files)
    .map(([path, raw]) => parseSkill(path, raw, simulations.get(directoryNameFromPath(path))))
    .filter((skill): skill is Skill => skill !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Case-insensitive substring match across everything a visitor might type:
 * the id, the display title, the tags, and the full retrieval description
 * (which is where the trigger phrases live).
 */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return skills
  }
  return skills.filter((skill) =>
    [skill.name, skill.title, skill.description, skill.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  )
}

/** Every tag in the loaded catalog, once and in alphabetical order. */
export function allTags(skills: ReadonlyArray<Pick<Skill, 'tags'>>): string[] {
  return [...new Set(skills.flatMap((skill) => skill.tags))].sort((left, right) =>
    left.localeCompare(right)
  )
}
