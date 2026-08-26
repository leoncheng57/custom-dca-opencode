import { parseFrontmatter, stripLeadingHeading } from './frontmatter'
import { directoryNameFromPath } from './skills'

/**
 * A `skills/<name>/SIMULATION.md` file: one short, content-authored transcript
 * of the skill firing in practice.
 *
 * The transcript lives beside `SKILL.md` rather than inside it because
 * `SKILL.md` is *agent context* — every line of it is injected into the model
 * when the skill loads. A worked example there would be pure token cost, and
 * worse, the model tends to imitate an example's literal content instead of
 * following the procedure. The same reasoning already produced
 * `skills/ascii-diagrams/EXAMPLES.md`.
 *
 * Nothing here is simulated in the computational sense: there is no model of
 * the world that could predict what an agent says. The truth is authored, so
 * it belongs in content.
 */

/** Closed vocabulary. An unknown role rejects the whole file. */
export const TURN_ROLES = ['user', 'assistant', 'tool', 'note'] as const

export type TurnRole = (typeof TURN_ROLES)[number]

export interface SimulationTurn {
  role: TurnRole
  /** Text after the em dash on the heading: `## tool — bash` gives `bash`. */
  label?: string
  /** Markdown body of the turn, rendered with the site's one markdown stack. */
  body: string
}

export interface Simulation {
  /** Scenario name, shown in the disclosure's summary meta. */
  title: string
  /**
   * The literal phrase that fires the skill. Tested against both the first
   * user turn and the owning `SKILL.md` description, so a renamed trigger
   * cannot silently leave a stale example behind.
   */
  trigger: string
  /** One line naming what this transcript compresses. Never optional. */
  caveat: string
  turns: SimulationTurn[]
}

interface SimulationFrontmatter {
  title?: string
  trigger?: string
  caveat?: string
}

/**
 * `## <role>` optionally followed by ` — <label>`.
 *
 * The em dash is the only accepted separator. A hyphen would be ambiguous
 * against labels that contain one, and accepting both forms would mean two
 * spellings of the same thing in the corpus.
 */
const TURN_HEADING = /^##[ \t]+([a-z]+)(?:[ \t]+—[ \t]*(.*))?[ \t]*$/

/** ``` or ~~~ with a run length of at least three. */
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/

function isTurnRole(value: string): value is TurnRole {
  return (TURN_ROLES as readonly string[]).includes(value)
}

interface RawTurn {
  role: TurnRole
  label?: string
  lines: string[]
}

/**
 * Splits a body into turns at `## <role>` headings, **ignoring headings inside
 * fenced code blocks**.
 *
 * This is not a nicety. Transcripts are mostly code fences, and a fence will
 * eventually contain a line beginning `## user` — a diff hunk, a markdown
 * example, a heredoc. A naive line scan silently swallows the rest of the
 * transcript into one turn, which looks like an authoring mistake rather than
 * a parser bug.
 *
 * Returns null when the file contains content before the first turn heading,
 * or names a role outside {@link TURN_ROLES}.
 */
function splitTurns(body: string): RawTurn[] | null {
  const turns: RawTurn[] = []
  let current: RawTurn | null = null
  /** The opening fence's run of characters, or null when outside a fence. */
  let openFence: string | null = null

  for (const line of body.split('\n')) {
    const fence = line.match(FENCE)
    if (fence) {
      const [, marker, rest] = fence
      if (openFence === null) {
        // An info string may not contain a backtick, so a line like
        // ```` ```ts ```` opens rather than closes.
        openFence = marker
      } else if (marker[0] === openFence[0] && marker.length >= openFence.length && rest.trim() === '') {
        openFence = null
      }
      current?.lines.push(line)
      continue
    }

    const heading = openFence === null ? line.match(TURN_HEADING) : null
    if (heading) {
      const [, role, label] = heading
      if (!isTurnRole(role)) {
        return null
      }
      current = { role, label: label?.trim() || undefined, lines: [] }
      turns.push(current)
      continue
    }

    if (current) {
      current.lines.push(line)
      continue
    }

    // Preamble. Blank lines are fine; anything else means the file is not
    // shaped like a transcript and guessing at it would hide the mistake.
    if (line.trim() !== '') {
      return null
    }
  }

  return turns
}

/**
 * Parses one `SIMULATION.md`.
 *
 * Returns null rather than throwing on malformed input: the glob in
 * {@link ../lib/skillsSource} is eager, so a thrown error would take the whole
 * site down over one typo in one file. Strictness lives in the test suite
 * instead — `simulation.test.ts` asserts that every file on disk parses. The
 * site is resilient; the pipeline is strict.
 */
export function parseSimulation(raw: string): Simulation | null {
  const { data, content } = parseFrontmatter<SimulationFrontmatter>(raw)

  const title = (data.title ?? '').trim()
  const trigger = (data.trigger ?? '').trim()
  const caveat = (data.caveat ?? '').trim()
  if (title === '' || trigger === '' || caveat === '') {
    return null
  }

  const turns = splitTurns(stripLeadingHeading(content))
  if (turns === null || turns.length === 0) {
    return null
  }

  // The transcript is an answer to "what does this look like when it fires",
  // and what fires a skill is something the user typed.
  if (turns[0].role !== 'user') {
    return null
  }

  const trimmed = turns
    .map((turn) => ({ ...turn, body: turn.lines.join('\n').trim() }))
    .filter((turn) => turn.body !== '')
    .map(({ role, label, body }) => (label === undefined ? { role, body } : { role, label, body }))

  if (trimmed.length === 0) {
    return null
  }

  return { title, trigger, caveat, turns: trimmed }
}

/**
 * Keyed by skill directory name, so a simulation joins its skill by living
 * next to it — the same "the directory is the identity" rule the catalog uses.
 */
export function loadSimulationsFromFiles(files: Record<string, string>): Map<string, Simulation> {
  const simulations = new Map<string, Simulation>()

  for (const [path, raw] of Object.entries(files)) {
    const directoryName = directoryNameFromPath(path)
    const simulation = directoryName === '' ? null : parseSimulation(raw)
    if (simulation) {
      simulations.set(directoryName, simulation)
    }
  }

  return simulations
}
