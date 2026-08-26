import { describe, expect, it } from 'vitest'
import {
  commandNameFromPath,
  filterCommands,
  invocation,
  loadCommandsFromFiles,
  parseCommand,
} from './commands'
import { commands as realCommands } from './commandsSource'
import { skills as realSkills } from './skillsSource'

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

  it('derives the related skill from the deferral in the template', () => {
    // Not from name equality: `/red-team` defers to `red-team-this`, because
    // nobody wants to type a skill's full name as a slash command.
    const linked = parseCommand(
      '../../commands/red-team.md',
      '---\ndescription: d\n---\nDo the thing.\n\nLoad the `red-team-this` skill for the rest.',
      { skillNames: new Set(['red-team-this']) }
    )!
    expect(linked.relatedSkills).toEqual(['red-team-this'])
  })

  it('records several references in template order', () => {
    const composite = parseCommand(
      '../../commands/handoff.md',
      '---\ndescription: d\n---\nSee `parallel-research-handoff`, then `session-handoff`.',
      { skillNames: new Set(['session-handoff', 'parallel-research-handoff']) }
    )!
    expect(composite.relatedSkills).toEqual(['parallel-research-handoff', 'session-handoff'])
  })

  it('reports no relation when the template names no skill', () => {
    const standalone = parseCommand('../../commands/standup.md', '---\ndescription: d\n---\nbody', {
      skillNames: new Set(['grill-me']),
    })!
    expect(standalone.relatedSkills).toEqual([])
  })

  it('ignores a skill name that only appears inside a shell interpolation', () => {
    const shelled = parseCommand(
      '../../commands/x.md',
      '---\ndescription: d\n---\n!`grill-me --version`\n',
      { skillNames: new Set(['grill-me']) }
    )!
    expect(shelled.relatedSkills).toEqual([])
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
  it('loads every command file', () => {
    expect(realCommands.length).toBeGreaterThan(0)
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
    '%s only references skills that exist',
    (_name, command) => {
      for (const skill of command.relatedSkills) {
        expect(realSkills.some((s) => s.name === skill)).toBe(true)
      }
    }
  )

  it.each(realCommands.map((c) => [c.name, c] as const))(
    '%s never restates a skill failure-mode table',
    (_name, command) => {
      // The house rule: a command carries the happy path, the skill carries
      // the failure modes. Two copies of a failure-mode table drift.
      expect(command.body).not.toMatch(/\|\s*Symptom\s*\|/)
    }
  )

  it('showcases every distinctive command capability at least once', () => {
    // The catalogue exists to demonstrate what a command can do that a skill
    // cannot. Losing the last example of one of these would make the point
    // silently unprovable.
    expect(realCommands.some((c) => c.takesArguments)).toBe(true)
    expect(realCommands.some((c) => c.runsShell)).toBe(true)
    expect(realCommands.some((c) => c.subtask)).toBe(true)
    expect(realCommands.some((c) => c.agent === 'plan')).toBe(true)
    expect(realCommands.some((c) => c.relatedSkills.length === 1)).toBe(true)
    expect(realCommands.some((c) => c.relatedSkills.length > 1)).toBe(true)
    expect(realCommands.some((c) => c.relatedSkills.length === 0)).toBe(true)
  })

  it('gives every shipped skill its own one-to-one command', () => {
    const uncovered = realSkills
      .filter(
        (skill) =>
          !realCommands.some(
            (command) =>
              command.relatedSkills.length === 1 && command.relatedSkills[0] === skill.name,
          ),
      )
      .map((skill) => skill.name)

    // Composite commands do not count. `/handoff` names two skills, so both
    // still need dedicated short forms whose reverse links can be unambiguous.
    expect(uncovered).toEqual([])
  })
})
