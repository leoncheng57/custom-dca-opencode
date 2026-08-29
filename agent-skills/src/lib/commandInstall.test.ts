import { describe, expect, it } from 'vitest'

import { commandInstallMethods, COMMAND_SCOPES } from './commandInstall'

describe('commandInstallMethods', () => {
  it('generates global and project installs from the repository command URL', () => {
    const methods = commandInstallMethods('verify')
    const raw = 'https://raw.githubusercontent.com/leoncheng57/custom-dca-opencode/main/agent-skills/commands/verify.md'

    expect(methods.map(({ id }) => id)).toEqual(['curl-global', 'curl-project', 'symlink'])
    expect(methods[0].command).toContain(raw)
    expect(methods[0].command).toContain('-o ~/.config/opencode/commands/verify.md')
    expect(methods[1].command).toContain(raw)
    expect(methods[1].command).toContain('-o .opencode/commands/verify.md')
    expect(methods[2].command).toContain('agent-skills/commands/verify.md')
  })

  it('rejects names that could escape or alter an install command', () => {
    for (const name of ['../verify', 'verify;rm', 'Verify', 'verify.md', 'verify--now']) {
      expect(() => commandInstallMethods(name)).toThrow('Invalid command name')
    }
  })
})

describe('COMMAND_SCOPES', () => {
  it('documents both OpenCode install locations', () => {
    expect(COMMAND_SCOPES.filter(({ readBy }) => readBy === 'OpenCode').map(({ path }) => path)).toEqual([
      '~/.config/opencode/commands/<name>.md',
      '.opencode/commands/<name>.md',
    ])
  })
})
