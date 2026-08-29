export const REPO_OWNER = 'leoncheng57'
export const REPO_NAME = 'custom-dca-opencode'
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`
export const REPO_URL = `https://github.com/${REPO_SLUG}`
export const CONTENT_ROOT = 'agent-skills'

/**
 * The repository's default branch.
 *
 * This is not cosmetic: `codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>`
 * Source and install links deliberately follow this moving branch and label it
 * as such. Change the default in one place if the repository renames it.
 */
export const DEFAULT_BRANCH = 'main'

export function commandSourceUrl(name: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/commands/${name}.md`
}

/** Command worked examples sit outside `commands/` — see commandsSource.ts. */
export function commandSimulationSourceUrl(name: string): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${CONTENT_ROOT}/command-simulations/${name}.md`
}
