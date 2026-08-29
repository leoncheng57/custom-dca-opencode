import { CONTENT_ROOT, DEFAULT_BRANCH, REPO_SLUG, REPO_URL } from './repo'
import { isValidCommandName } from './commands'

export interface CommandInstallMethod {
  id: string
  label: string
  scope: 'global' | 'project'
  note: string
  command: string
}

/**
 * Installing a command is copying one file; cloning a content tree just to
 * place one Markdown file would add unnecessary machinery.
 */
export function commandInstallMethods(name: string): CommandInstallMethod[] {
  if (!isValidCommandName(name)) throw new Error(`Invalid command name: ${name}`)
  const raw = `https://raw.githubusercontent.com/${REPO_SLUG}/${DEFAULT_BRANCH}/${CONTENT_ROOT}/commands/${name}.md`

  return [
    {
      id: 'curl-global',
      label: 'curl',
      scope: 'global',
      note: 'Recommended. Available in every project you open with OpenCode.',
      command: [
        'mkdir -p ~/.config/opencode/commands && \\',
        `curl -sL ${raw} \\`,
        `  -o ~/.config/opencode/commands/${name}.md`,
      ].join('\n'),
    },
    {
      id: 'curl-project',
      label: 'curl into a project',
      scope: 'project',
      note: 'Commits with the repo, so the command travels with the codebase and loads only there.',
      command: [
        '# from the root of your project',
        'mkdir -p .opencode/commands && \\',
        `curl -sL ${raw} \\`,
        `  -o .opencode/commands/${name}.md`,
      ].join('\n'),
    },
    {
      id: 'symlink',
      label: 'clone + symlink',
      scope: 'global',
      note: 'Stays updatable: git pull in the clone refreshes the live command.',
      command: [
        `git clone ${REPO_URL}.git ~/src/custom-dca-opencode   # once`,
        'mkdir -p ~/.config/opencode/commands',
        `ln -s ~/src/custom-dca-opencode/${CONTENT_ROOT}/commands/${name}.md \\`,
        `      ~/.config/opencode/commands/${name}.md`,
      ].join('\n'),
    },
  ]
}

export interface CommandScope {
  path: string
  scope: 'Global' | 'Project'
  readBy: string
  note: string
}

/**
 * Where a command file has to live to be discovered.
 *
 * A repository command has two OpenCode discovery paths. Claude Code's
 * `.claude/commands/` is listed so the difference is
 * visible rather than implied, but this repository does not ship that dialect.
 */
export const COMMAND_SCOPES: CommandScope[] = [
  {
    path: '~/.config/opencode/commands/<name>.md',
    scope: 'Global',
    readBy: 'OpenCode',
    note: 'Every project. Start here.',
  },
  {
    path: '.opencode/commands/<name>.md',
    scope: 'Project',
    readBy: 'OpenCode',
    note: 'Committed with the repo; loads only inside it.',
  },
  {
    path: '.claude/commands/<name>.md',
    scope: 'Project',
    readBy: 'Claude Code',
    note: 'Different frontmatter dialect (argument-hint, allowed-tools). Not shipped here.',
  },
]
