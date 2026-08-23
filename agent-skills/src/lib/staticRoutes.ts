import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface StaticRouteOptions {
  outDir: string
  skillsDir: string
  commandsDir: string
  contentBase?: string
  staticRoutes?: string[]
}

function assertRouteName(name: string, source: string): void {
  if (!ROUTE_NAME.test(name)) {
    throw new Error(`Cannot generate a route for invalid name "${name}" from ${source}`)
  }
}

function skillNames(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, 'SKILL.md')))
    .map((entry) => {
      assertRouteName(entry.name, join(directory, entry.name))
      return entry.name
    })
    .sort()
}

function commandNames(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const name = entry.name.slice(0, -3)
      assertRouteName(name, join(directory, entry.name))
      return name
    })
    .sort()
}

function copyEntry(indexPath: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  copyFileSync(indexPath, join(destination, 'index.html'))
}

/**
 * Materialises one real HTML entrypoint for every generated content route.
 *
 * React Router still owns rendering after the page loads; these files only
 * make a direct request reach the app with HTTP 200. Without them GitHub Pages
 * serves `404.html`: the SPA eventually paints, but the response remains a 404,
 * which breaks link checkers, previews, crawlers and clients that do not run
 * JavaScript.
 *
 * Discovery mirrors the app's content globs. Adding a skill directory or a
 * command file is still the only step needed to add both its page and its
 * deploy-time entrypoint — there is no second route registry to drift.
 */
export function generateStaticRoutes({
  outDir,
  skillsDir,
  commandsDir,
  contentBase = '',
  staticRoutes = [],
}: StaticRouteOptions): string[] {
  const indexPath = join(outDir, 'index.html')
  if (!existsSync(indexPath)) {
    throw new Error(`Vite output is missing ${indexPath}`)
  }

  const routes = [
    ...staticRoutes,
    contentBase,
    join(contentBase, 'commands'),
    ...skillNames(skillsDir).map((name) => join(contentBase, 's', name)),
    ...commandNames(commandsDir).map((name) => join(contentBase, 'c', name)),
  ].filter(Boolean)

  for (const route of routes) {
    for (const segment of route.split('/').filter(Boolean)) {
      assertRouteName(segment, `static route ${route}`)
    }
  }

  for (const route of routes) {
    copyEntry(indexPath, join(outDir, route))
  }

  // Unknown paths still need the SPA shell so React Router can apply its own
  // catch-all redirect. Known paths no longer rely on this 404 fallback.
  copyFileSync(indexPath, join(outDir, '404.html'))

  return routes
}
