import { describe, expect, it } from 'vitest'
import { commands as realCommands } from './commandsSource'

/**
 * Commands that ship without a worked example.
 *
 * A reviewed exception list: currently empty, and adding an entry has to be a
 * decision someone made rather than an omission nobody noticed.
 */
const WITHOUT_SIMULATION: readonly string[] = []

const MAX_TURNS = 12

const FILLER_CAVEATS = new Set(['none', 'n/a', 'na', '-', 'nothing'])

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').toLowerCase()
}

/** Drops fenced blocks so a shell comment is not read as a markdown heading. */
function proseLines(body: string): string[] {
  const lines: string[] = []
  let openFence: string | null = null

  for (const line of body.split('\n')) {
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      const [, marker, rest] = fence
      if (openFence === null) {
        openFence = marker
      } else if (marker[0] === openFence[0] && marker.length >= openFence.length && rest.trim() === '') {
        openFence = null
      }
      continue
    }
    if (openFence === null) lines.push(line)
  }

  return lines
}

describe('the shipped command simulations', () => {
  const withSimulation = realCommands.filter((command) => command.simulation)

  it('covers every command except the reviewed exceptions', () => {
    const missing = realCommands
      .filter((command) => !command.simulation)
      .map((command) => command.name)
      .filter((name) => !WITHOUT_SIMULATION.includes(name))

    expect(missing).toEqual([])
  })

  it('parses at least one, so the glob and the re-keying are actually wired up', () => {
    expect(withSimulation.length).toBeGreaterThan(0)
  })

  it.each(withSimulation.map((c) => [c.name, c] as const))(
    '%s opens on the user typing the command',
    (_name, command) => {
      const simulation = command.simulation!
      const opening = simulation.turns[0]

      expect(opening.role).toBe('user')
      expect(flatten(opening.body)).toContain(flatten(simulation.trigger))
    }
  )

  it.each(withSimulation.map((c) => [c.name, c] as const))(
    '%s uses its own slash invocation as the trigger',
    (_name, command) => {
      // A command has no retrieval description to drift against, so the
      // invariant is different from a skill's: the trigger must be the literal
      // thing a human types. Rename the file and this fails.
      expect(command.simulation!.trigger).toBe(`/${command.name}`)
    }
  )

  it.each(withSimulation.map((c) => [c.name, c] as const))(
    '%s names what its transcript compresses',
    (_name, command) => {
      const caveat = command.simulation!.caveat
      expect(caveat.length).toBeGreaterThan(20)
      expect(FILLER_CAVEATS.has(caveat.trim().toLowerCase().replace(/[.]$/, ''))).toBe(false)
    }
  )

  it.each(withSimulation.map((c) => [c.name, c] as const))(
    `%s stays under ${MAX_TURNS} turns`,
    (_name, command) => {
      expect(command.simulation!.turns.length).toBeLessThanOrEqual(MAX_TURNS)
    }
  )

  it.each(withSimulation.map((c) => [c.name, c] as const))(
    '%s puts no headings inside a turn body',
    (_name, command) => {
      const offenders = command
        .simulation!.turns.flatMap((turn) => proseLines(turn.body))
        .filter((line) => /^#{1,6}\s/.test(line))

      expect(offenders).toEqual([])
    }
  )
})
