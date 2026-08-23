import { DEFAULT_BRANCH, REPO_SLUG, REPO_URL, TARBALL_ROOT } from './repo'

export interface InstallMethod {
  id: string
  label: string
  /**
   * Where the command puts the skill: `global` installs into the home
   * directory and loads in every project, `project` installs into the
   * repository you are standing in and only loads there.
   */
  scope: 'global' | 'project'
  /** One line explaining the trade-off, rendered above the command. */
  note: string
  command: string
}

/**
 * The verified ways to install a single skill.
 *
 * The global methods all target `~/.agents/skills/<skill>` because that is the
 * highest-reach location; the project method targets `.agents/skills/<skill>`
 * for the same reason at repository scope — see {@link INSTALL_SCOPES}. The
 * global ones come first, so the list reads recommendation-first and the two
 * scopes stay grouped.
 */
export function installMethods(skill: string): InstallMethod[] {
  return [
    {
      id: 'skills-cli',
      label: 'skills CLI',
      scope: 'global',
      note: 'Recommended. Resolves the repo\u2019s skills/ directory for you; -g installs globally.',
      command: `npx skills add ${REPO_SLUG} --skill ${skill} -g`,
    },
    {
      id: 'degit',
      label: 'degit',
      scope: 'global',
      note: 'Copies one directory with no git history attached.',
      command: `npx degit ${REPO_SLUG}/skills/${skill} ~/.agents/skills/${skill}`,
    },
    {
      id: 'curl',
      label: 'curl + tar',
      scope: 'global',
      note: 'No Node required. Extracts a single directory out of the tarball.',
      command: [
        'mkdir -p ~/.agents/skills && \\',
        `curl -sL https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${DEFAULT_BRANCH} \\`,
        '  | tar -xz -C ~/.agents/skills --strip-components=2 \\',
        `      ${TARBALL_ROOT}/skills/${skill}`,
      ].join('\n'),
    },
    {
      id: 'sparse-symlink',
      label: 'sparse clone + symlink',
      scope: 'global',
      note: 'Stays updatable: git pull in ~/src/agent-skills refreshes the live skill.',
      command: [
        `git clone --filter=blob:none --sparse ${REPO_URL}.git ~/src/agent-skills`,
        `cd ~/src/agent-skills && git sparse-checkout set skills/${skill}`,
        `ln -s ~/src/agent-skills/skills/${skill} ~/.agents/skills/${skill}`,
      ].join('\n'),
    },
    {
      // The comment is part of the copied text on purpose: the relative
      // destination only resolves from the repository root, and a stray `#`
      // line is harmless in every shell.
      id: 'project-local',
      label: 'project-local',
      scope: 'project',
      note: 'Commits with the repo, so the skill travels with the codebase and loads only there.',
      command: [
        '# from the root of your project',
        `npx degit ${REPO_SLUG}/skills/${skill} .agents/skills/${skill}`,
      ].join('\n'),
    },
  ]
}

export interface InstallScope {
  path: string
  scope: 'Global' | 'Project'
  readBy: string
  note: string
}

/** Where a `SKILL.md` directory has to live for each agent family to see it. */
export const INSTALL_SCOPES: InstallScope[] = [
  {
    path: '~/.agents/skills/<skill>/',
    scope: 'Global',
    readBy: 'OpenCode, Cursor, Codex, Copilot, Gemini CLI, Amp, Roo, Zed',
    note: 'Highest reach — install here unless you have a reason not to.',
  },
  {
    path: '~/.claude/skills/<skill>/',
    scope: 'Global',
    readBy: 'Claude Code',
    note: 'The Claude Code variant of the same layout.',
  },
  {
    path: '.agents/skills/<skill>/',
    scope: 'Project',
    readBy: 'OpenCode, Cursor, Codex, Copilot, Gemini CLI, Amp, Roo, Zed',
    note: 'Highest reach at project scope — commit it and every collaborator gets the skill.',
  },
  {
    path: '.opencode/skills/<skill>/',
    scope: 'Project',
    readBy: 'OpenCode',
    note: 'Committed with the repo, so the skill only loads inside that project.',
  },
  {
    path: '.claude/skills/<skill>/',
    scope: 'Project',
    readBy: 'Claude Code',
    note: 'Project-scoped equivalent for Claude Code.',
  },
]
