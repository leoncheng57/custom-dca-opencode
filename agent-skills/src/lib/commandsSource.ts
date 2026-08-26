import { loadCommandsFromFiles, type Command } from './commands'
import { loadSimulationsFromFiles } from './simulation'
import { skills } from './skillsSource'

/**
 * Every `commands/<name>.md` in the repository, inlined at build time.
 *
 * Flat files, not directories: that is OpenCode's own layout for
 * `~/.config/opencode/commands/` and `.opencode/commands/`, and the repository
 * mirrors it so a file can be copied straight across with no restructuring.
 */
const commandFiles = import.meta.glob('../../commands/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * Worked examples for commands.
 *
 * These live in a **separate top-level directory** rather than beside the
 * command, which is the one place this convention diverges from skills. The
 * reason is mechanical: OpenCode registers every `.md` file in `commands/` as
 * an invocable command, so `commands/verify.SIMULATION.md` would put a bogus
 * `/verify.SIMULATION` in the user's slash-command autocomplete. A skill can
 * keep its transcript as a sibling because `skills/<name>/` is a directory the
 * agent only reads on request; a command directory is a namespace.
 *
 * The file format is identical, so the skill parser is reused verbatim.
 */
const simulationFiles = import.meta.glob('../../command-simulations/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * `loadSimulationsFromFiles` keys on the parent directory, which is correct for
 * `skills/<name>/SIMULATION.md` but wrong for a flat `command-simulations/`
 * layout where the identity is the filename. Re-key before joining.
 */
function byFileName(files: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(files).map(([path, raw]) => {
      const file = path.split('/').pop() ?? ''
      return [`x/${file.replace(/\.md$/, '')}/SIMULATION.md`, raw]
    })
  )
}

const skillNames = new Set(skills.map((skill) => skill.name))

export const commands: Command[] = loadCommandsFromFiles(commandFiles, {
  skillNames,
  simulations: loadSimulationsFromFiles(byFileName(simulationFiles)),
})

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name)
}

/**
 * The command that is a short form of this skill, if one exists.
 *
 * Only a command whose *sole* reference is this skill counts. `/handoff` names
 * two skills and is a composite of neither, so it is not offered as either
 * one's short form.
 */
export function commandForSkill(skillName: string): Command | undefined {
  return commands.find(
    (command) => command.relatedSkills.length === 1 && command.relatedSkills[0] === skillName
  )
}
