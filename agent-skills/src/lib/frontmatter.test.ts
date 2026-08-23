import { describe, expect, it } from 'vitest'
import { parseFrontmatter, parseScalar, stripLeadingHeading } from './frontmatter'

interface SkillFrontmatter {
  name?: string
  description?: string
  license?: string
  compatibility?: string
  tags?: string[]
  metadata?: Record<string, string>
  draft?: boolean
  version?: number
}

describe('parseFrontmatter', () => {
  it('parses simple scalars and returns the body', () => {
    const { data, content } = parseFrontmatter<SkillFrontmatter>(
      ['---', 'name: cmux-browser', 'description: Drive a browser.', '---', '', '# Title', 'Body.'].join('\n')
    )

    expect(data.name).toBe('cmux-browser')
    expect(data.description).toBe('Drive a browser.')
    expect(content).toBe('\n# Title\nBody.')
  })

  it('returns the document untouched when there is no frontmatter', () => {
    const raw = '# Just markdown\n\nNo frontmatter here.\n'
    const { data, content } = parseFrontmatter<SkillFrontmatter>(raw)

    expect(data).toEqual({})
    expect(content).toBe(raw)
  })

  it('returns the document untouched when the frontmatter is never closed', () => {
    const raw = '---\nname: broken\n\nstill going\n'
    const { data, content } = parseFrontmatter<SkillFrontmatter>(raw)

    expect(data).toEqual({})
    expect(content).toBe(raw)
  })

  // Bug 1 in the upstream parser: a folded block scalar became the literal
  // two-character string ">-" and the actual description was dropped.
  describe('block scalars', () => {
    it('folds a ">-" description into one line with no trailing newline', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        [
          '---',
          'name: folded',
          'description: >-',
          '  Research several independent feature ideas in parallel,',
          '  then hand them off.',
          '  Use when the user drops a list of 2+ unrelated tasks.',
          '---',
          'body',
        ].join('\n')
      )

      expect(data.description).toBe(
        'Research several independent feature ideas in parallel, then hand them off. Use when the user drops a list of 2+ unrelated tasks.'
      )
    })

    it('turns a blank line inside a folded scalar into a newline', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: >-', '  First paragraph.', '', '  Second paragraph.', '---', ''].join('\n')
      )

      expect(data.description).toBe('First paragraph.\nSecond paragraph.')
    })

    it('clips a plain ">" scalar to exactly one trailing newline', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: >', '  one', '  two', '---', ''].join('\n')
      )

      expect(data.description).toBe('one two\n')
    })

    it('preserves line breaks in a literal "|" scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: |', '  line one', '  line two', '---', ''].join('\n')
      )

      expect(data.description).toBe('line one\nline two\n')
    })

    it('strips the trailing newline for "|-"', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: |-', '  line one', '  line two', '---', ''].join('\n')
      )

      expect(data.description).toBe('line one\nline two')
    })

    it('keeps trailing newlines for "|+"', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: |+', '  text', '', '', 'name: after', '---', ''].join('\n')
      )

      expect(data.description).toBe('text\n\n\n')
      expect(data.name).toBe('after')
    })

    it('preserves relative indentation inside a literal scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: |-', '  root', '    nested', '  root again', '---', ''].join('\n')
      )

      expect(data.description).toBe('root\n  nested\nroot again')
    })

    it('does not swallow the next key after a block scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: >-', '  folded text', 'name: still-parsed', 'license: MIT', '---', ''].join('\n')
      )

      expect(data.description).toBe('folded text')
      expect(data.name).toBe('still-parsed')
      expect(data.license).toBe('MIT')
    })
  })

  // Bug 2: values that merely begin and end with a quote had their outer
  // characters sliced off, mangling the value.
  describe('quoting', () => {
    it('unquotes a genuinely quoted scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'name: "quoted-name"', "license: 'MIT'", '---', ''].join('\n')
      )

      expect(data.name).toBe('quoted-name')
      expect(data.license).toBe('MIT')
    })

    it('leaves a value that only starts and ends with a quote intact', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: "research these" or "spin these up"', '---', ''].join('\n')
      )

      expect(data.description).toBe('"research these" or "spin these up"')
    })

    it('leaves a lone quote character intact', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(['---', 'name: "', '---', ''].join('\n'))

      expect(data.name).toBe('"')
    })

    it('handles escaped quotes inside a double-quoted scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: "says \\"do it\\" first"', '---', ''].join('\n')
      )

      expect(data.description).toBe('says "do it" first')
    })

    it('handles doubled quotes inside a single-quoted scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', "description: 'it''s fine'", '---', ''].join('\n')
      )

      expect(data.description).toBe("it's fine")
    })

    it('keeps a "#" that is inside a quoted scalar', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: "tag #1 matters"', '---', ''].join('\n')
      )

      expect(data.description).toBe('tag #1 matters')
    })
  })

  // Bug 3: CRLF documents were treated as having no frontmatter at all.
  describe('line endings', () => {
    it('parses a CRLF document', () => {
      const { data, content } = parseFrontmatter<SkillFrontmatter>(
        '---\r\nname: crlf-skill\r\ndescription: >-\r\n  folded over\r\n  two lines\r\n---\r\n\r\n# Body\r\n'
      )

      expect(data.name).toBe('crlf-skill')
      expect(data.description).toBe('folded over two lines')
      expect(content).toBe('\n# Body\n')
    })

    it('strips a UTF-8 BOM before looking for the delimiter', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>('\uFEFF---\nname: bom-skill\n---\n')

      expect(data.name).toBe('bom-skill')
    })
  })

  // Bug 4: the nested `metadata` map became an empty array.
  describe('nested metadata map', () => {
    it('parses a string to string map', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        [
          '---',
          'name: mapped',
          'metadata:',
          '  title: Parallel Research',
          '  tags: research, agents, worktrees',
          '  version: "2"',
          'license: MIT',
          '---',
          '',
        ].join('\n')
      )

      expect(data.metadata).toEqual({
        title: 'Parallel Research',
        tags: 'research, agents, worktrees',
        version: '2',
      })
      expect(data.license).toBe('MIT')
    })

    it('does not coerce nested values to numbers or booleans', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'metadata:', '  version: 2', '  stable: true', '---', ''].join('\n')
      )

      expect(data.metadata).toEqual({ version: '2', stable: 'true' })
    })

    it('supports a block scalar inside the map', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'metadata:', '  summary: >-', '    folded', '    inside a map', 'name: after', '---', ''].join(
          '\n'
        )
      )

      expect(data.metadata).toEqual({ summary: 'folded inside a map' })
      expect(data.name).toBe('after')
    })
  })

  describe('sequences', () => {
    it('parses a block sequence of strings', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'tags:', '  - research', '  - "agents"', 'name: seq', '---', ''].join('\n')
      )

      expect(data.tags).toEqual(['research', 'agents'])
      expect(data.name).toBe('seq')
    })

    it('parses a sequence indented at the same level as its key', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'tags:', '- one', '- two', '---', ''].join('\n')
      )

      expect(data.tags).toEqual(['one', 'two'])
    })
  })

  describe('scalar edge cases', () => {
    it('keeps a colon that appears inside a value', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'description: Use for: deploying things', '---', ''].join('\n')
      )

      expect(data.description).toBe('Use for: deploying things')
    })

    it('ignores comment lines', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', '# a comment', 'name: commented', '---', ''].join('\n')
      )

      expect(data).toEqual({ name: 'commented' })
    })

    it('coerces top-level booleans and numbers', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'draft: true', 'version: 3', '---', ''].join('\n')
      )

      expect(data.draft).toBe(true)
      expect(data.version).toBe(3)
    })

    it('treats a key with no value and no children as an empty string', () => {
      const { data } = parseFrontmatter<SkillFrontmatter>(
        ['---', 'name: solo', 'description:', '---', ''].join('\n')
      )

      expect(data.description).toBe('')
    })
  })
})

describe('parseScalar', () => {
  it('keeps version-like strings as strings', () => {
    expect(parseScalar('1.2.3')).toBe('1.2.3')
  })

  it('coerces numbers', () => {
    expect(parseScalar('42')).toBe(42)
  })
})

describe('stripLeadingHeading', () => {
  it('removes a leading H1', () => {
    expect(stripLeadingHeading('# Title\n\nBody')).toBe('Body')
  })

  it('leaves a body without a leading H1 alone', () => {
    expect(stripLeadingHeading('Body first\n\n# Later heading')).toBe('Body first\n\n# Later heading')
  })
})
