import { describe, expect, it } from 'vitest'
import {
  directoryNameFromPath,
  filterSkills,
  firstSentence,
  loadSkillsFromFiles,
  parseSkill,
  parseTags,
  titleFromName,
} from './skills'
import { skills as realSkills } from './skillsSource'

/**
 * The shared tag vocabulary, deliberately small and reviewed explicitly.
 * Singleton tags are valid: they still describe and filter the skill, while
 * this list prevents unreviewed bespoke tags from silently accumulating.
 */
const TAG_VOCABULARY = [
  'critique',
  'diagrams',
  'docs',
  'funny',
  'long-running',
  'output-style',
  'planning',
  'research',
  'subagents',
  'verification',
  'worktrees',
] as const

const MAX_TAGS_PER_SKILL = 3

const SKILL_MD = [
  '---',
  'name: parallel-research-handoff',
  'description: >-',
  '  Research several independent feature ideas in parallel with read-only',
  '  subagents. Use when the user drops a list of 2+ unrelated tasks.',
  'license: MIT',
  'metadata:',
  '  tags: research, agents',
  '---',
  '',
  '# Parallel research',
  '',
  'Three phases, strictly ordered.',
  '',
].join('\n')

describe('directoryNameFromPath', () => {
  it('reads the directory that owns SKILL.md', () => {
    expect(directoryNameFromPath('../../skills/cmux-browser/SKILL.md')).toBe('cmux-browser')
  })

  it('returns an empty string for a path with no directory', () => {
    expect(directoryNameFromPath('SKILL.md')).toBe('')
  })
})

describe('titleFromName', () => {
  it('title-cases a hyphenated name', () => {
    expect(titleFromName('parallel-research-handoff')).toBe('Parallel Research Handoff')
  })

  it('leaves already-cased tokens alone', () => {
    expect(titleFromName('deploy-AWS-stack')).toBe('Deploy AWS Stack')
  })

  it('handles underscores', () => {
    expect(titleFromName('repo_learning_guide')).toBe('Repo Learning Guide')
  })
})

describe('firstSentence', () => {
  it('stops at the first sentence', () => {
    expect(firstSentence('Does a thing. Use when the user asks for a thing.')).toBe('Does a thing.')
  })

  it('does not break on common abbreviations', () => {
    expect(firstSentence('Handles configs, e.g. tsconfig. Use for setup.')).toBe(
      'Handles configs, e.g. tsconfig.'
    )
  })

  it('collapses newlines from a folded description', () => {
    expect(firstSentence('Research ideas\nin parallel. Then hand off.')).toBe('Research ideas in parallel.')
  })

  it('truncates a single enormous sentence on a word boundary', () => {
    const long = `${'word '.repeat(200)}end.`
    const summary = firstSentence(long, 60)

    expect(summary.length).toBeLessThanOrEqual(61)
    expect(summary.endsWith('\u2026')).toBe(true)
    expect(summary).not.toContain('  ')
  })

  it('returns an empty string for an empty description', () => {
    expect(firstSentence('')).toBe('')
  })
})

describe('parseTags', () => {
  it('splits a comma-separated list', () => {
    expect(parseTags('research, agents,  worktrees')).toEqual(['research', 'agents', 'worktrees'])
  })

  it('drops blanks and case-insensitive duplicates', () => {
    expect(parseTags('a,,A, b,')).toEqual(['a', 'b'])
  })

  it('returns an empty array when metadata.tags is absent', () => {
    expect(parseTags(undefined)).toEqual([])
  })
})

describe('parseSkill', () => {
  const skill = parseSkill('../../skills/parallel-research-handoff/SKILL.md', SKILL_MD)!

  it('derives the identity fields', () => {
    expect(skill.name).toBe('parallel-research-handoff')
    expect(skill.title).toBe('Parallel Research Handoff')
    expect(skill.license).toBe('MIT')
    expect(skill.tags).toEqual(['research', 'agents'])
  })

  it('keeps the full folded description and derives a short summary', () => {
    expect(skill.description).toContain('Use when the user drops a list')
    expect(skill.summary).toBe(
      'Research several independent feature ideas in parallel with read-only subagents.'
    )
  })

  it('strips the leading H1 from the body', () => {
    expect(skill.body).toBe('Three phases, strictly ordered.')
  })

  it('lets metadata.title override the derived title', () => {
    const overridden = parseSkill(
      '../../skills/x/SKILL.md',
      ['---', 'name: x', 'metadata:', '  title: Custom Title', '---', 'body'].join('\n')
    )!

    expect(overridden.title).toBe('Custom Title')
  })

  it('prefers the directory name over a mismatched frontmatter name', () => {
    const mismatched = parseSkill(
      '../../skills/on-disk-name/SKILL.md',
      ['---', 'name: something-else', '---', 'body'].join('\n')
    )!

    expect(mismatched.name).toBe('on-disk-name')
  })

  it('survives a SKILL.md with no frontmatter at all', () => {
    const bare = parseSkill('../../skills/bare/SKILL.md', 'Just a body.')!

    expect(bare.name).toBe('bare')
    expect(bare.description).toBe('')
    expect(bare.summary).toBe('')
    expect(bare.tags).toEqual([])
  })
})

describe('loadSkillsFromFiles', () => {
  const skills = loadSkillsFromFiles({
    '../../skills/zebra/SKILL.md': '---\nname: zebra\ndescription: Last one.\n---\nbody',
    '../../skills/alpha/SKILL.md': '---\nname: alpha\ndescription: First one.\n---\nbody',
  })

  it('sorts by name for a stable catalog order', () => {
    expect(skills.map((skill) => skill.name)).toEqual(['alpha', 'zebra'])
  })

  it('picks up any directory without a hand-maintained list', () => {
    expect(skills).toHaveLength(2)
  })
})

describe('the shipped skills', () => {
  it('loads every skill directory', () => {
    expect(realSkills.length).toBeGreaterThan(0)
  })

  it('discovers build-waves with its sustained-build tags', () => {
    expect(realSkills.find((skill) => skill.name === 'build-waves')?.tags).toEqual([
      'subagents',
      'long-running',
      'planning',
    ])
  })

  it('classifies duck-mode as output style and funny', () => {
    expect(realSkills.find((skill) => skill.name === 'duck-mode')?.tags).toEqual([
      'output-style',
      'funny',
    ])
  })

  it.each(realSkills.map((skill) => [skill.name, skill.tags] as const))(
    `%s has 1-${MAX_TAGS_PER_SKILL} tags, all from the shared vocabulary`,
    (_name, tags) => {
      expect(tags.length).toBeGreaterThanOrEqual(1)
      expect(tags.length).toBeLessThanOrEqual(MAX_TAGS_PER_SKILL)
      expect(TAG_VOCABULARY).toEqual(expect.arrayContaining(tags))
    }
  )

  it('uses every tag in the vocabulary on at least one skill', () => {
    const usage = new Map<string, number>(TAG_VOCABULARY.map((tag) => [tag, 0]))
    for (const skill of realSkills) {
      for (const tag of skill.tags) {
        usage.set(tag, (usage.get(tag) ?? 0) + 1)
      }
    }

    const unused = [...usage].filter(([, count]) => count < 1).map(([tag, count]) => `${tag} (${count})`)
    expect(unused).toEqual([])
  })

  it('makes every tag reachable through the filter', () => {
    for (const tag of TAG_VOCABULARY) {
      const matched = filterSkills(realSkills, tag).map((skill) => skill.name)
      const tagged = realSkills.filter((skill) => skill.tags.includes(tag)).map((skill) => skill.name)

      // Substring matching means the filter may also catch a name or
      // description, so this is a superset check rather than equality.
      expect(matched).toEqual(expect.arrayContaining(tagged))
    }
  })
})

describe('filterSkills', () => {
  const skills = loadSkillsFromFiles({
    '../../skills/alpha/SKILL.md':
      '---\nname: alpha\ndescription: Drives a browser session.\nmetadata:\n  tags: automation\n---\nbody',
    '../../skills/beta/SKILL.md': '---\nname: beta\ndescription: Ships a release.\n---\nbody',
  })

  it('returns everything for a blank query', () => {
    expect(filterSkills(skills, '   ')).toHaveLength(2)
  })

  it('matches on the description, where trigger phrases live', () => {
    expect(filterSkills(skills, 'browser').map((skill) => skill.name)).toEqual(['alpha'])
  })

  it('matches on tags and is case-insensitive', () => {
    expect(filterSkills(skills, 'AUTOMATION').map((skill) => skill.name)).toEqual(['alpha'])
  })

  it('returns nothing when there is no match', () => {
    expect(filterSkills(skills, 'kubernetes')).toEqual([])
  })
})
