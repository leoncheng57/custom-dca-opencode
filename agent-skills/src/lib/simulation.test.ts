import { describe, expect, it } from 'vitest'
import { loadSimulationsFromFiles, parseSimulation } from './simulation'
import { skills as realSkills } from './skillsSource'

/**
 * Skills that ship without a worked example.
 *
 * Same device as TAG_VOCABULARY in skills.test.ts: a deliberately-reviewed
 * list, so landing a skill with no `SIMULATION.md` means editing this on
 * purpose, in review, rather than letting coverage quietly rot.
 *
 * Currently empty — every shipped skill has one. An entry here is allowed to
 * be permanent if a transcript genuinely does not suit the skill; "no
 * simulation" is a legitimate outcome, but it has to be a decision someone
 * made rather than an omission nobody noticed.
 */
const WITHOUT_SIMULATION: readonly string[] = []

/** Past this the example is trying to be the instructions. */
const MAX_TURNS = 12

const FILLER_CAVEATS = new Set(['none', 'n/a', 'na', '-', 'nothing'])

/**
 * Trigger phrases are matched against hard-wrapped markdown, where a phrase
 * routinely straddles a line break. Line wrapping is not semantic, so it is
 * flattened before comparing.
 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Drops fenced blocks, so a shell comment (`# from the root of your project`)
 * is not mistaken for a markdown heading.
 */
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
    if (openFence === null) {
      lines.push(line)
    }
  }

  return lines
}

const SIMULATION_MD = [
  '---',
  'title: Stress-testing a cache plan',
  'trigger: grill me',
  'caveat: Round 1 only; a real session runs three to five rounds.',
  '---',
  '',
  '# Worked example',
  '',
  '## user',
  '',
  'Grill me on this caching plan.',
  '',
  '## assistant',
  '',
  'Four questions on the frontier.',
  '',
  '## tool — bash',
  '',
  '```',
  '$ rg -n cache server/',
  '```',
  '',
  '## note',
  '',
  'The whole frontier goes out in one round.',
  '',
].join('\n')

describe('parseSimulation', () => {
  const simulation = parseSimulation(SIMULATION_MD)!

  it('reads the frontmatter', () => {
    expect(simulation.title).toBe('Stress-testing a cache plan')
    expect(simulation.trigger).toBe('grill me')
    expect(simulation.caveat).toContain('Round 1 only')
  })

  it('splits the body into turns and drops the leading H1', () => {
    expect(simulation.turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'tool', 'note'])
    expect(simulation.turns[0].body).toBe('Grill me on this caching plan.')
  })

  it('captures the label after the em dash', () => {
    expect(simulation.turns[2].label).toBe('bash')
    expect(simulation.turns[0].label).toBeUndefined()
  })

  it('keeps fenced content intact inside a turn', () => {
    expect(simulation.turns[2].body).toBe(['```', '$ rg -n cache server/', '```'].join('\n'))
  })
})

describe('parseSimulation rejects', () => {
  const withTurns = (...lines: string[]): string =>
    ['---', 'title: T', 'trigger: go', 'caveat: c', '---', '', ...lines].join('\n')

  it('a file missing any required frontmatter field', () => {
    expect(parseSimulation(['---', 'title: T', 'trigger: go', '---', '## user', 'hi'].join('\n'))).toBeNull()
    expect(parseSimulation(['---', 'title: T', 'caveat: c', '---', '## user', 'hi'].join('\n'))).toBeNull()
    expect(parseSimulation(['---', 'trigger: go', 'caveat: c', '---', '## user', 'hi'].join('\n'))).toBeNull()
  })

  it('a file with no frontmatter at all', () => {
    expect(parseSimulation('## user\n\nhi')).toBeNull()
  })

  it('a role outside the closed vocabulary', () => {
    expect(parseSimulation(withTurns('## user', 'hi', '', '## system', 'nope'))).toBeNull()
  })

  it('a transcript that does not open on the user', () => {
    expect(parseSimulation(withTurns('## assistant', 'unprompted'))).toBeNull()
  })

  it('prose before the first turn heading', () => {
    expect(parseSimulation(withTurns('Some preamble.', '', '## user', 'hi'))).toBeNull()
  })

  it('a file with no turns', () => {
    expect(parseSimulation(withTurns('# Worked example', ''))).toBeNull()
  })

  it('a transcript whose only turns are empty', () => {
    expect(parseSimulation(withTurns('## user', '', '## assistant', ''))).toBeNull()
  })
})

describe('parseSimulation is fence-aware', () => {
  /* Transcripts are mostly code fences, and a fence will eventually contain a
     line starting `## user` — a diff hunk, a markdown example, a heredoc. A
     naive line scan swallows the rest of the file into one turn, which reads
     as an authoring mistake rather than a parser bug. */
  it('does not split on a role heading inside a fenced block', () => {
    const simulation = parseSimulation(
      [
        '---',
        'title: T',
        'trigger: go',
        'caveat: c',
        '---',
        '',
        '## user',
        '',
        'Write me a transcript.',
        '',
        '## assistant',
        '',
        '```markdown',
        '## user',
        'this is example content, not a turn',
        '## assistant',
        'nor is this',
        '```',
        '',
        'Done.',
      ].join('\n')
    )!

    expect(simulation.turns).toHaveLength(2)
    expect(simulation.turns[1].body).toContain('not a turn')
    expect(simulation.turns[1].body.endsWith('Done.')).toBe(true)
  })

  it('handles tilde fences and longer backtick runs', () => {
    const simulation = parseSimulation(
      [
        '---',
        'title: T',
        'trigger: go',
        'caveat: c',
        '---',
        '',
        '## user',
        '',
        '~~~',
        '## note',
        '~~~',
        '',
        '````',
        '```',
        '## tool',
        '```',
        '````',
      ].join('\n')
    )!

    expect(simulation.turns).toHaveLength(1)
    expect(simulation.turns[0].body).toContain('## note')
    expect(simulation.turns[0].body).toContain('## tool')
  })
})

describe('parseSimulation tolerates', () => {
  it('CRLF line endings', () => {
    const simulation = parseSimulation(SIMULATION_MD.replace(/\n/g, '\r\n'))!

    expect(simulation.turns).toHaveLength(4)
    expect(simulation.turns[0].body).toBe('Grill me on this caching plan.')
  })

  it('a thematic break inside a turn body', () => {
    const simulation = parseSimulation(
      ['---', 'title: T', 'trigger: go', 'caveat: c', '---', '', '## user', '', 'Q1', '', '---', '', 'Q2'].join(
        '\n'
      )
    )!

    expect(simulation.turns).toHaveLength(1)
    expect(simulation.turns[0].body).toContain('---')
  })
})

describe('loadSimulationsFromFiles', () => {
  it('keys simulations by their skill directory', () => {
    const loaded = loadSimulationsFromFiles({ '../../skills/grill-me/SIMULATION.md': SIMULATION_MD })

    expect([...loaded.keys()]).toEqual(['grill-me'])
  })

  it('skips a malformed file rather than throwing', () => {
    // The glob is eager: throwing here would take the whole site down over one
    // typo. CI catches it instead, in "the shipped simulations" below.
    const loaded = loadSimulationsFromFiles({
      '../../skills/good/SIMULATION.md': SIMULATION_MD,
      '../../skills/bad/SIMULATION.md': 'no frontmatter, no turns',
    })

    expect([...loaded.keys()]).toEqual(['good'])
  })
})

describe('the shipped simulations', () => {
  const withSimulation = realSkills.filter((skill) => skill.simulation)

  it('covers every skill except the reviewed exceptions', () => {
    const missing = realSkills
      .filter((skill) => !skill.simulation)
      .map((skill) => skill.name)
      .filter((name) => !(WITHOUT_SIMULATION as readonly string[]).includes(name))

    expect(missing).toEqual([])
  })

  it('has no stale entries in the exception list', () => {
    const stale = WITHOUT_SIMULATION.filter((name) =>
      realSkills.some((skill) => skill.name === name && skill.simulation)
    )

    expect(stale).toEqual([])
  })

  it('lists only real skills in the exception list', () => {
    const unknown = WITHOUT_SIMULATION.filter((name) => !realSkills.some((skill) => skill.name === name))

    expect(unknown).toEqual([])
  })

  it('parses at least one simulation, so the glob is actually wired up', () => {
    expect(withSimulation.length).toBeGreaterThan(0)
  })

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    '%s opens on the user speaking its trigger phrase',
    (_name, skill) => {
      const simulation = skill.simulation!
      const opening = simulation.turns[0]

      expect(opening.role).toBe('user')
      expect(flatten(opening.body)).toContain(flatten(simulation.trigger))
    }
  )

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    '%s uses a trigger the description actually documents',
    (_name, skill) => {
      // The drift detector. Rename a trigger in SKILL.md and this fails,
      // rather than leaving a worked example quietly describing the old skill.
      expect(flatten(skill.description)).toContain(flatten(skill.simulation!.trigger))
    }
  )

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    '%s names what its transcript compresses',
    (_name, skill) => {
      const caveat = skill.simulation!.caveat
      expect(caveat.length).toBeGreaterThan(20)
      expect(FILLER_CAVEATS.has(caveat.trim().toLowerCase().replace(/[.]$/, ''))).toBe(false)
    }
  )

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    `%s stays under ${MAX_TURNS} turns`,
    (_name, skill) => {
      expect(skill.simulation!.turns.length).toBeLessThanOrEqual(MAX_TURNS)
    }
  )

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    '%s is pointed at from its SKILL.md',
    (_name, skill) => {
      // The other direction of the same drift guard: a worked example nobody
      // links to is invisible to the agent that installed the skill.
      expect(skill.body).toContain('SIMULATION.md')
    }
  )

  it.each(withSimulation.map((skill) => [skill.name, skill] as const))(
    '%s puts no headings inside a turn body',
    (_name, skill) => {
      // rehype-slug would mint ids for them, colliding with the instruction
      // body rendered further down the same page.
      const offenders = skill
        .simulation!.turns.flatMap((turn) => proseLines(turn.body))
        .filter((line) => /^#{1,6}\s/.test(line))

      expect(offenders).toEqual([])
    }
  )
})
