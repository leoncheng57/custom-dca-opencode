import { parseFrontmatter } from './frontmatter'
import type { Simulation } from './simulation'

/**
 * An OpenCode custom command: `commands/<name>.md`, invoked by a human typing
 * `/<name>` in the TUI.
 *
 * The distinction from a skill is not cosmetic and drives everything below:
 *
 *  - A **skill** is model-invoked. Its `description` is resident in the agent's
 *    context on every single turn so retrieval can match against it, and the
 *    body is loaded on demand. Ten skills currently cost ~5,700 characters of
 *    permanent context, and that grows linearly with the catalogue.
 *  - A **command** is human-invoked. Nothing is in context until someone types
 *    `/name`, at which point the template is injected verbatim into that turn.
 *    A large command catalogue is therefore free, and a command re-asserts
 *    exact instructions late in a long session, after the skill body that was
 *    injected at turn 1 has been compacted away.
 *
 * Commands are also deliberately **OpenCode-only**. Claude Code reads
 * `.claude/commands/` with a different frontmatter dialect (`argument-hint`,
 * `allowed-tools`), so unlike `SKILL.md` these files are not portable. Saying
 * that plainly is better than shipping two dialects that drift.
 */
export interface CommandFrontmatter {
  description?: string
  /** Which agent executes the command, e.g. `build` or `plan`. */
  agent?: string
  /** Overrides the session model for this one invocation. */
  model?: string
  /** Runs in a subagent so the primary context stays clean. */
  subtask?: boolean
}

export interface Command {
  /** Filename without `.md` — the id, the URL segment, and the `/name` typed. */
  name: string
  description: string
  agent?: string
  model?: string
  subtask: boolean
  /** The template body, injected into the turn when the command fires. */
  body: string
  /** True when the template interpolates `$ARGUMENTS` or a positional `$1`. */
  takesArguments: boolean
  /** True when the template injects shell output with `` !`cmd` ``. */
  runsShell: boolean
  /**
   * Skills this command references, in the order they appear in the template.
   *
   * Derived from the template body rather than declared in frontmatter, for
   * two reasons. OpenCode owns the `commands/` frontmatter namespace and this
   * repository should not add speculative keys to it; and the reference *is*
   * the relationship — a command that defers to a skill says so in its closing
   * line, so reading it back cannot drift from the truth.
   *
   * Name equality alone would not do: `/red-team` defers to `red-team-this`,
   * and `/verify` to `human-verification-steps`, because nobody wants to type
   * a skill's full name as a slash command.
   */
  relatedSkills: string[]
  simulation?: Simulation
  bytes: number
}

/** `$ARGUMENTS`, or a positional `$1`..`$9`. */
const ARGUMENT_PATTERN = /\$ARGUMENTS\b|\$[1-9]\b/

/** Shell interpolation: !`command`. */
const SHELL_PATTERN = /!`[^`]+`/

/** Any backticked token in the body, e.g. `red-team-this`. */
const BACKTICKED = /`([a-z0-9]+(?:-[a-z0-9]+)*)`/g

/**
 * Every catalogue skill the template names, deduplicated, in template order.
 * A `` !`shell command` `` interpolation is skipped so a command that happens
 * to run a binary sharing a skill's name is not mistaken for a reference.
 */
function referencedSkills(body: string, skillNames: ReadonlySet<string>): string[] {
  const withoutShell = body.replace(/!`[^`]+`/g, ' ')
  const found: string[] = []
  for (const match of withoutShell.matchAll(BACKTICKED)) {
    const token = match[1]
    if (skillNames.has(token) && !found.includes(token)) {
      found.push(token)
    }
  }
  return found
}

export function commandNameFromPath(path: string): string {
  const file = path.split('/').filter(Boolean).pop() ?? ''
  return file.endsWith('.md') ? file.slice(0, -3) : ''
}

/**
 * A command's trigger is the literal thing a human types. Unlike a skill, there
 * is no retrieval description to match against, so the invocation *is* the
 * identity.
 */
export function invocation(name: string, takesArguments: boolean): string {
  return takesArguments ? `/${name} <arguments>` : `/${name}`
}

export function parseCommand(
  path: string,
  raw: string,
  options: { skillNames?: ReadonlySet<string>; simulation?: Simulation } = {}
): Command | null {
  const name = commandNameFromPath(path)
  if (!name) {
    return null
  }

  const { data, content } = parseFrontmatter<CommandFrontmatter>(raw)
  const body = content.trim()
  const description = (data.description ?? '').trim()

  // OpenCode requires a template; a command with no body would fire an empty
  // prompt. Reject rather than shipping something that silently does nothing.
  if (body === '') {
    return null
  }

  const relatedSkills = referencedSkills(body, options.skillNames ?? new Set())

  return {
    name,
    description,
    agent: data.agent,
    model: data.model,
    subtask: data.subtask === true,
    body,
    takesArguments: ARGUMENT_PATTERN.test(body),
    runsShell: SHELL_PATTERN.test(body),
    relatedSkills,
    ...(options.simulation ? { simulation: options.simulation } : {}),
    bytes: typeof TextEncoder === 'undefined' ? raw.length : new TextEncoder().encode(raw).length,
  }
}

/** Sorted by name so the catalogue order is stable across builds. */
export function loadCommandsFromFiles(
  files: Record<string, string>,
  options: {
    skillNames?: ReadonlySet<string>
    simulations?: ReadonlyMap<string, Simulation>
  } = {}
): Command[] {
  return Object.entries(files)
    .map(([path, raw]) =>
      parseCommand(path, raw, {
        skillNames: options.skillNames,
        simulation: options.simulations?.get(commandNameFromPath(path)),
      })
    )
    .filter((command): command is Command => command !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Case-insensitive substring match over everything a visitor might type: the
 * name, the description, and the template body — which is where the distinctive
 * bits like `$ARGUMENTS` and `subtask` actually live.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return commands
  }
  return commands.filter((command) =>
    [command.name, command.description, command.body, command.relatedSkills.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  )
}
