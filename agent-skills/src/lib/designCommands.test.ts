import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadCommandsFromFiles } from './commands'
import { parseSimulation } from './simulation'

const names = ['mini-design-doc', 'review-learning', 'system-design-artifacts'] as const

const commandFiles = Object.fromEntries(
  names.map((name) => {
    const url = new URL(`../../commands/${name}.md`, import.meta.url)
    return [fileURLToPath(url), readFileSync(url, 'utf8')]
  }),
)

const commands = loadCommandsFromFiles(commandFiles)

describe('design commands', () => {
  it('loads exactly the three self-contained commands', () => {
    expect(commands.map((command) => command.name)).toEqual([...names])
    expect(commands.every((command) => command.description.length > 10)).toBe(true)
    expect(commands.every((command) => command.body.includes('This command is self-contained.'))).toBe(true)
    expect(commands.every((command) => command.takesArguments)).toBe(true)
  })

  it.each(names)('%s has a matching command simulation', (name) => {
    const url = new URL(`../../command-simulations/${name}.md`, import.meta.url)
    const simulation = parseSimulation(readFileSync(url, 'utf8'))

    expect(simulation).not.toBeNull()
    expect(simulation?.trigger).toBe(`/${name}`)
    expect(simulation?.turns[0]).toMatchObject({ role: 'user' })
    expect(simulation?.turns[0].body).toContain(`/${name}`)
  })

  it('keeps mutation and publication opt-in', () => {
    const system = commands.find((command) => command.name === 'system-design-artifacts')!
    const review = commands.find((command) => command.name === 'review-learning')!

    expect(system.body).toContain('Do not create files or publish anything unless requested.')
    expect(system.body).toContain('use a draft PR')
    expect(review.body).toMatch(/Do not change\s+code/)
  })
})
