import { describe, expect, it } from 'vitest'
import { commandInstallMethods } from './commandInstall'
import { INSTALL_SCOPES, installMethods } from './install'
import { CONTENT_ROOT, DEFAULT_BRANCH, REPO_NAME, TARBALL_ROOT } from './repo'

describe('installMethods', () => {
  const methods = installMethods('cmux-browser')
  const commandFor = (id: string): string => methods.find((method) => method.id === id)!.command

  it('offers the five documented install paths with unique ids', () => {
    expect(methods.map((method) => method.id)).toEqual([
      'skills-cli',
      'degit',
      'curl',
      'sparse-symlink',
      'project-local',
    ])
  })

  // The summary row on a skill page counts these, and the lede says "the first
  // four install globally … the last one installs into a project" — so both the
  // split and the ordering are load-bearing copy, not incidental.
  it('groups the global methods first and ends with the single project method', () => {
    expect(methods.map((method) => method.scope)).toEqual([
      'global',
      'global',
      'global',
      'global',
      'project',
    ])
  })

  it('renders the skills CLI command', () => {
    expect(commandFor('skills-cli')).toBe(
      'npx skills add https://github.com/leoncheng57/custom-dca-opencode/tree/main/agent-skills --skill cmux-browser -g'
    )
  })

  it('renders the degit command', () => {
    expect(commandFor('degit')).toBe(
      'npx degit leoncheng57/custom-dca-opencode/agent-skills/skills/cmux-browser ~/.agents/skills/cmux-browser'
    )
  })

  it('renders the curl command', () => {
    expect(commandFor('curl')).toBe(
      [
        'mkdir -p ~/.agents/skills && \\',
        'curl -sL https://codeload.github.com/leoncheng57/custom-dca-opencode/tar.gz/refs/heads/main \\',
        '  | tar -xz -C ~/.agents/skills --strip-components=3 \\',
        '      custom-dca-opencode-main/agent-skills/skills/cmux-browser',
      ].join('\n')
    )
  })

  it('renders the sparse clone + symlink command', () => {
    expect(commandFor('sparse-symlink')).toBe(
      [
        'git clone --filter=blob:none --sparse https://github.com/leoncheng57/custom-dca-opencode.git ~/src/custom-dca-opencode',
        'cd ~/src/custom-dca-opencode && git sparse-checkout set agent-skills/skills/cmux-browser',
        'ln -s ~/src/custom-dca-opencode/agent-skills/skills/cmux-browser ~/.agents/skills/cmux-browser',
      ].join('\n')
    )
  })

  it('renders the project-local command against a relative .agents/skills path', () => {
    expect(commandFor('project-local')).toBe(
      [
        '# from the root of your project',
        'npx degit leoncheng57/custom-dca-opencode/agent-skills/skills/cmux-browser .agents/skills/cmux-browser',
      ].join('\n')
    )
  })

  // The two scopes differ by exactly one character of destination, and `degit`
  // will happily write to either: a stray `~/` turns the project method into a
  // fifth global one, and a relative path in a global method silently installs
  // into whatever directory the user happened to be standing in.
  it('keeps the project destination relative and never relative in a global method', () => {
    for (const method of methods) {
      if (method.scope === 'project') {
        expect(method.command).toContain(' .agents/skills/cmux-browser')
        expect(method.command).not.toContain('~/')
      } else {
        expect(method.command).not.toMatch(/(^|\s)\.agents\//)
      }
    }
  })

  it('substitutes the skill name everywhere it appears', () => {
    for (const method of installMethods('another-skill')) {
      expect(method.command).toContain('another-skill')
      expect(method.command).not.toContain('cmux-browser')
    }
  })

  // Guards the coupling documented on DEFAULT_BRANCH: the tarball's top-level
  // directory is <repo>-<branch>, so a branch rename must update both halves.
  it('derives the tarball root from the branch instead of hardcoding it', () => {
    expect(TARBALL_ROOT).toBe(`${REPO_NAME}-${DEFAULT_BRANCH}`)
    expect(commandFor('curl')).toContain(`refs/heads/${DEFAULT_BRANCH}`)
    expect(commandFor('curl')).toContain(`${TARBALL_ROOT}/${CONTENT_ROOT}/skills/`)
  })
})

describe('commandInstallMethods', () => {
  const methods = commandInstallMethods('worktree-up')

  it('downloads commands from the migrated workspace', () => {
    expect(methods[0].command).toContain(
      'raw.githubusercontent.com/leoncheng57/custom-dca-opencode/main/agent-skills/commands/worktree-up.md'
    )
  })

  it('symlinks commands from the combined repository clone', () => {
    expect(methods.find((method) => method.id === 'symlink')?.command).toContain(
      '~/src/custom-dca-opencode/agent-skills/commands/worktree-up.md'
    )
  })
})

describe('INSTALL_SCOPES', () => {
  it('lists ~/.agents/skills first as the highest-reach location', () => {
    expect(INSTALL_SCOPES[0].path).toBe('~/.agents/skills/<skill>/')
    expect(INSTALL_SCOPES[0].readBy).toContain('OpenCode')
  })

  it('covers both global and project scopes', () => {
    expect(new Set(INSTALL_SCOPES.map((scope) => scope.scope))).toEqual(new Set(['Global', 'Project']))
  })

  // The project-local install method writes here, so the reference table has to
  // list it — and with the same reach as its global twin.
  it('lists .agents/skills as the highest-reach project path', () => {
    const project = INSTALL_SCOPES.filter((scope) => scope.scope === 'Project')
    expect(project[0].path).toBe('.agents/skills/<skill>/')
    expect(project[0].readBy).toBe(INSTALL_SCOPES[0].readBy)
  })

  it('documents a destination for every install method scope', () => {
    const documented = new Set(INSTALL_SCOPES.map((scope) => scope.scope.toLowerCase()))
    for (const method of installMethods('cmux-browser')) {
      expect(documented).toContain(method.scope)
    }
  })
})
