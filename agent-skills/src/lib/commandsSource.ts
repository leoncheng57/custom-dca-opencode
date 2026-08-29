import { commandNameFromPath, loadCommandsFromFiles, type Command } from './commands'
import { loadSimulationsFromFiles } from './simulation'

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

export const commandFileNames = Object.keys(commandFiles).map(commandNameFromPath).sort()

/**
 * Worked examples for commands.
 *
 * These live in a **separate top-level directory** rather than beside the
 * command. OpenCode registers every `.md` file in `commands/` as
 * an invocable command, so `commands/verify.SIMULATION.md` would put a bogus
 * `/verify.SIMULATION` in the user's slash-command autocomplete.
 */
const simulationFiles = import.meta.glob('../../command-simulations/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * `loadSimulationsFromFiles` keys on the parent directory, while this flat
 * layout uses the filename as identity. Re-key before joining.
 */
function byFileName(files: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(files).map(([path, raw]) => {
      const file = path.split('/').pop() ?? ''
      return [`x/${file.replace(/\.md$/, '')}/SIMULATION.md`, raw]
    })
  )
}

export const commands: Command[] = loadCommandsFromFiles(commandFiles, {
  simulations: loadSimulationsFromFiles(byFileName(simulationFiles)),
})

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name)
}
