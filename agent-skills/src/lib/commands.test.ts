import { describe, expect, it } from 'vitest'
import {
  commandNameFromPath,
  filterCommands,
  invocation,
  isValidCommandName,
  loadCommandsFromFiles,
  parseCommand,
} from './commands'
import { commandFileNames, commands as realCommands } from './commandsSource'

const COMMAND_MD = [
  '---',
  'description: Create an isolated worktree for new work',
  'agent: build',
  '---',
  '',
  'Create a git worktree for "$ARGUMENTS" now.',
  '',
].join('\n')

describe('commandNameFromPath', () => {
  it('reads the filename, since commands are flat files', () => {
    expect(commandNameFromPath('../../commands/worktree-up.md')).toBe('worktree-up')
  })

  it('returns an empty string for a non-markdown path', () => {
    expect(commandNameFromPath('../../commands/notes.txt')).toBe('')
  })
})

describe('isValidCommandName', () => {
  it('accepts safe flat command names and rejects path or shell syntax', () => {
    expect(isValidCommandName('verify')).toBe(true)
    expect(isValidCommandName('worktree-up')).toBe(true)
    for (const name of ['', '-verify', 'verify-', 'verify--now', '../verify', 'Verify', 'verify.md', 'verify;rm']) {
      expect(isValidCommandName(name)).toBe(false)
    }
  })
})

describe('invocation', () => {
  it('shows the argument slot only when the template uses one', () => {
    expect(invocation('standup', false)).toBe('/standup')
    expect(invocation('worktree-up', true)).toBe('/worktree-up <arguments>')
  })
})

describe('parseCommand', () => {
  const command = parseCommand('../../commands/worktree-up.md', COMMAND_MD)!

  it('derives the identity and frontmatter', () => {
    expect(command.name).toBe('worktree-up')
    expect(command.description).toBe('Create an isolated worktree for new work')
    expect(command.agent).toBe('build')
    expect(command.subtask).toBe(false)
  })

  it('detects $ARGUMENTS', () => {
    expect(command.takesArguments).toBe(true)
    expect(command.runsShell).toBe(false)
  })

  it('detects positional arguments', () => {
    const positional = parseCommand('../../commands/x.md', '---\ndescription: d\n---\nCreate $1 in $2.')!
    expect(positional.takesArguments).toBe(true)
  })

  it('detects shell interpolation', () => {
    const shell = parseCommand('../../commands/x.md', '---\ndescription: d\n---\nTests:\n\n!`npm test`\n')!
    expect(shell.runsShell).toBe(true)
  })

  it('reads subtask as a boolean', () => {
    const sub = parseCommand('../../commands/x.md', '---\ndescription: d\nsubtask: true\n---\nbody')!
    expect(sub.subtask).toBe(true)
  })

  it('rejects a command with an empty template', () => {
    // OpenCode would fire an empty prompt; better to drop it than ship a
    // command that silently does nothing.
    expect(parseCommand('../../commands/x.md', '---\ndescription: d\n---\n\n')).toBeNull()
  })

  it('survives a file with no frontmatter', () => {
    const bare = parseCommand('../../commands/bare.md', 'Just a template.')!
    expect(bare.name).toBe('bare')
    expect(bare.description).toBe('')
  })
})

describe('loadCommandsFromFiles', () => {
  const loaded = loadCommandsFromFiles({
    '../../commands/zebra.md': '---\ndescription: Last.\n---\nbody',
    '../../commands/alpha.md': '---\ndescription: First.\n---\nbody',
  })

  it('sorts by name for a stable catalogue order', () => {
    expect(loaded.map((command) => command.name)).toEqual(['alpha', 'zebra'])
  })
})

describe('filterCommands', () => {
  const loaded = loadCommandsFromFiles({
    '../../commands/alpha.md': '---\ndescription: Drives a browser.\n---\nUses $ARGUMENTS.',
    '../../commands/beta.md': '---\ndescription: Ships a release.\n---\nbody',
  })

  it('returns everything for a blank query', () => {
    expect(filterCommands(loaded, '  ')).toHaveLength(2)
  })

  it('matches the template body, where the distinctive syntax lives', () => {
    expect(filterCommands(loaded, '$ARGUMENTS').map((c) => c.name)).toEqual(['alpha'])
  })

  it('returns nothing when there is no match', () => {
    expect(filterCommands(loaded, 'kubernetes')).toEqual([])
  })
})

describe('the shipped commands', () => {
  it('represents every discovered command file in the parsed inventory', () => {
    expect(realCommands.map(({ name }) => name)).toEqual(commandFileNames)
  })

  it.each(realCommands.map((c) => [c.name, c] as const))('%s has a description', (_name, command) => {
    expect(command.description.length).toBeGreaterThan(10)
  })

  it.each(realCommands.map((c) => [c.name, c] as const))(
    '%s names an agent that exists in OpenCode',
    (_name, command) => {
      // Built-in primary agents. A typo here silently falls back to the
      // current agent, which is exactly the kind of quiet wrong the catalogue
      // should not ship.
      expect(['build', 'plan', undefined]).toContain(command.agent)
    }
  )

  it.each(realCommands.map((c) => [c.name, c] as const))(
    '%s is self-contained and never defers to a repository skill',
    (_name, command) => {
      expect(command.body).not.toMatch(/load (?:the )?`[^`]+` skill|full skill/i)
    }
  )

  it('allows standalone commands with no paired content or naming convention', () => {
    const standalone = parseCommand('../../commands/new-utility.md', '---\ndescription: A standalone command.\n---\nDo the complete thing.')
    expect(standalone?.name).toBe('new-utility')
  })

  it('keeps verify portable by discovering checks instead of pre-executing npm', () => {
    const verify = realCommands.find(({ name }) => name === 'verify')!
    expect(verify.runsShell).toBe(false)
    expect(verify.body).toContain('Inspect changed files, package or task manifests')
    expect(verify.body).not.toContain('!`npm')
  })

  it('requires explicit model and broad-permission authorization for managed workers', () => {
    const manager = realCommands.find(({ name }) => name === 'manager-children')!
    expect(manager.body).toContain('ask the user which model to use')
    expect(manager.body).toContain('Never add\n`--auto` or any equivalent broad permission-approval mode unless the user\nexplicitly authorizes it')
  })

  it('showcases every distinctive command capability at least once', () => {
    // Keep the catalogue's command-specific interpolation and routing features
    // exercised by at least one real entry.
    expect(realCommands.some((c) => c.takesArguments)).toBe(true)
    expect(realCommands.some((c) => c.runsShell)).toBe(true)
    expect(realCommands.some((c) => c.subtask)).toBe(true)
    expect(realCommands.some((c) => c.agent === 'plan')).toBe(true)
  })
})
