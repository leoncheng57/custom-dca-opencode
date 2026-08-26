export const REPO_OWNER = 'leoncheng57'
export const REPO_NAME = 'custom-dca-opencode'
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`
export const REPO_URL = `https://github.com/${REPO_SLUG}`
export const CONTENT_ROOT = 'agent-skills'

/**
 * The repository's default branch.
 *
 * This is not cosmetic: `codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>`
 * produces a tarball whose single top-level directory is named
 * `<repo>-<branch>` — which is why the curl install command has to name
 * `custom-dca-opencode-main/agent-skills/skills/<skill>` as the path to
 * extract. Renaming the
 * default branch away from `main` silently breaks that command (tar exits
 * "not found in archive"), so change it here and nowhere else.
 */
export const DEFAULT_BRANCH = 'main'

/** Top-level directory inside the codeload tarball: `<repo>-<branch>`. */
export const TARBALL_ROOT = `${REPO_NAME}-${DEFAULT_BRANCH}`

export function skillSourceUrl(skillName: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/skills/${skillName}/SKILL.md`
}

/** The worked example beside a skill. Only linked when the file exists. */
export function simulationSourceUrl(skillName: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/skills/${skillName}/SIMULATION.md`
}

export function commandSourceUrl(name: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/commands/${name}.md`
}

/** Command worked examples sit outside `commands/` — see commandsSource.ts. */
export function commandSimulationSourceUrl(name: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/command-simulations/${name}.md`
}
