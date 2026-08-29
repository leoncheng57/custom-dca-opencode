import { parseFrontmatter } from './frontmatter.js'
import type { Simulation } from './simulation.js'

/**
 * An OpenCode custom command: `commands/<name>.md`, invoked by a human typing
 * `/<name>` in the TUI.
 *
 * Commands are human-invoked. Nothing is in context until someone types
 *    `/name`, at which point the template is injected verbatim into that turn.
 *    A large command catalogue is therefore free, and a command re-asserts
 *    exact instructions late in a long session.
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
  simulation?: Simulation
  bytes: number
}

/** `$ARGUMENTS`, or a positional `$1`..`$9`. */
const ARGUMENT_PATTERN = /\$ARGUMENTS\b|\$[1-9]\b/

/** Shell interpolation: !`command`. */
const SHELL_PATTERN = /!`[^`]+`/

export function isValidCommandName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
}

/**
 * The one ordering for command names.
 *
 * `localeCompare` is locale- and ICU-dependent: it can treat `-` as a weak
 * separator, so `build-waves` and `buildwaves` may order differently on two
 * machines. The static catalogue cross-checks its manifest against a plain
 * code-unit sort of the source directory, so a locale-sensitive comparator
 * here would eventually make a publication fail on the runner while passing
 * locally. Compare code units, everywhere.
 */
export function compareCommandNames(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
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
  options: { simulation?: Simulation } = {}
): Command | null {
  const name = commandNameFromPath(path)
  if (!isValidCommandName(name)) {
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

  return {
    name,
    description,
    agent: data.agent,
    model: data.model,
    subtask: data.subtask === true,
    body,
    takesArguments: ARGUMENT_PATTERN.test(body),
    runsShell: SHELL_PATTERN.test(body),
    ...(options.simulation ? { simulation: options.simulation } : {}),
    bytes: typeof TextEncoder === 'undefined' ? raw.length : new TextEncoder().encode(raw).length,
  }
}

/** Sorted by name so the catalogue order is stable across builds. */
export function loadCommandsFromFiles(
  files: Record<string, string>,
  options: {
    simulations?: ReadonlyMap<string, Simulation>
  } = {}
): Command[] {
  return Object.entries(files)
    .map(([path, raw]) =>
      parseCommand(path, raw, {
        simulation: options.simulations?.get(commandNameFromPath(path)),
      })
    )
    .filter((command): command is Command => command !== null)
    .sort((left, right) => compareCommandNames(left.name, right.name))
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
    [command.name, command.description, command.body]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  )
}
