import { describe, expect, it } from 'vitest'
import { allTags } from './skills'

describe('allTags', () => {
  it('flattens, deduplicates, and alphabetizes loaded skill tags', () => {
    expect(
      allTags([
        { tags: ['worktrees', 'research'] },
        { tags: ['docs', 'research'] },
        { tags: ['critique'] },
      ])
    ).toEqual(['critique', 'docs', 'research', 'worktrees'])
  })

  it('returns an empty array when no tags are loaded', () => {
    expect(allTags([])).toEqual([])
    expect(allTags([{ tags: [] }])).toEqual([])
  })
})
