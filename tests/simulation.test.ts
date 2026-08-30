import { describe, expect, it } from 'vitest'
import { loadSimulationsFromFiles, parseSimulation } from '../client/lib/simulation.js'

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
  it('keys simulations by their normalized parent directory', () => {
    const loaded = loadSimulationsFromFiles({ '../../commands/grill-me/SIMULATION.md': SIMULATION_MD })

    expect([...loaded.keys()]).toEqual(['grill-me'])
  })

  it('skips a malformed file rather than throwing', () => {
    // The glob is eager: throwing here would take the whole site down over one
    // typo. CI catches it instead, in "the shipped simulations" below.
    const loaded = loadSimulationsFromFiles({
      '../../commands/good/SIMULATION.md': SIMULATION_MD,
      '../../commands/bad/SIMULATION.md': 'no frontmatter, no turns',
    })

    expect([...loaded.keys()]).toEqual(['good'])
  })
})
