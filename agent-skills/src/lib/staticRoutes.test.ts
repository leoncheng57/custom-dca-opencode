import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateStaticRoutes } from './staticRoutes'

const temporaryDirectories: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-skills-routes-'))
  temporaryDirectories.push(root)
  const outDir = join(root, 'docs')
  const skillsDir = join(root, 'skills')
  const commandsDir = join(root, 'commands')

  mkdirSync(outDir)
  mkdirSync(join(skillsDir, 'alpha'), { recursive: true })
  mkdirSync(join(skillsDir, 'beta'), { recursive: true })
  mkdirSync(commandsDir)
  writeFileSync(join(outDir, 'index.html'), '<main>app shell</main>')
  writeFileSync(join(skillsDir, 'alpha', 'SKILL.md'), 'alpha')
  writeFileSync(join(skillsDir, 'beta', 'SKILL.md'), 'beta')
  writeFileSync(join(commandsDir, 'verify.md'), 'verify')

  return { root, outDir, skillsDir, commandsDir }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('generateStaticRoutes', () => {
  it('emits entrypoints for the command index and every discovered detail page', () => {
    const dirs = fixture()

    expect(generateStaticRoutes({
      ...dirs,
      contentBase: 'agent-skills',
      staticRoutes: ['features', 'docs'],
    })).toEqual([
      'features',
      'docs',
      'agent-skills',
      join('agent-skills', 'commands'),
      join('agent-skills', 's', 'alpha'),
      join('agent-skills', 's', 'beta'),
      join('agent-skills', 'c', 'verify'),
    ])

    for (const path of [
      'features/index.html',
      'docs/index.html',
      'agent-skills/index.html',
      'agent-skills/commands/index.html',
      'agent-skills/s/alpha/index.html',
      'agent-skills/s/beta/index.html',
      'agent-skills/c/verify/index.html',
      '404.html',
    ]) {
      expect(readFileSync(join(dirs.outDir, path), 'utf8')).toBe('<main>app shell</main>')
    }
  })

  it('ignores skill directories without SKILL.md and non-markdown command files', () => {
    const dirs = fixture()
    mkdirSync(join(dirs.skillsDir, 'notes'))
    writeFileSync(join(dirs.commandsDir, 'README.txt'), 'not a command')

    generateStaticRoutes(dirs)

    expect(existsSync(join(dirs.outDir, 's/notes/index.html'))).toBe(false)
    expect(existsSync(join(dirs.outDir, 'c/README/index.html'))).toBe(false)
  })

  it('fails the build for a content name that cannot be a route segment', () => {
    const dirs = fixture()
    writeFileSync(join(dirs.commandsDir, 'Bad Name.md'), 'bad')

    expect(() => generateStaticRoutes(dirs)).toThrow(/invalid name "Bad Name"/)
  })

  it('fails the build for an unsafe fixed route', () => {
    const dirs = fixture()

    expect(() => generateStaticRoutes({ ...dirs, staticRoutes: ['Bad Route'] })).toThrow(
      /invalid name "Bad Route"/
    )
  })
})
