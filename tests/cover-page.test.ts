import { describe, it, expect } from 'vitest'
import {
  findFirstNamedCoverPageIndex,
  isCoverPageName,
  resolveCoverPageIndex
} from '../src/shared/coverPage'

describe('coverPage helpers', () => {
  it('matches cover aliases case-insensitively', () => {
    expect(isCoverPageName('Cover')).toBe(true)
    expect(isCoverPageName('thumbnail')).toBe(true)
    expect(isCoverPageName(' THUMBNAIL ')).toBe(true)
    expect(isCoverPageName('Hero')).toBe(false)
  })

  it('finds first cover-like page by name', () => {
    expect(
      findFirstNamedCoverPageIndex([
        { name: 'Intro' },
        { name: 'Thumbnail' },
        { name: 'Cover' }
      ])
    ).toBe(1)
  })

  it('resolves preferred index when valid, otherwise falls back to alias detection', () => {
    const pages = [{ name: 'Intro' }, { name: 'Thumbnail' }, { name: 'Specs' }]
    expect(resolveCoverPageIndex(pages, 2)).toBe(2)
    expect(resolveCoverPageIndex(pages, 9)).toBe(1)
    expect(resolveCoverPageIndex(pages, null)).toBe(1)
  })
})
