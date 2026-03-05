import type { TemplatePage } from './types'

const COVER_PAGE_ALIASES = ['cover', 'thumbnail'] as const

function normalizePageName(name: string): string {
  return name.trim().toLowerCase()
}

export function isCoverPageName(name: string): boolean {
  return COVER_PAGE_ALIASES.includes(
    normalizePageName(name) as (typeof COVER_PAGE_ALIASES)[number]
  )
}

export function findFirstNamedCoverPageIndex(
  pages: Array<Pick<TemplatePage, 'name'>>
): number | null {
  const index = pages.findIndex(page => isCoverPageName(page.name))
  return index === -1 ? null : index
}

export function resolveCoverPageIndex(
  pages: Array<Pick<TemplatePage, 'name'>>,
  preferredIndex: number | null | undefined
): number | null {
  if (
    typeof preferredIndex === 'number' &&
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < pages.length
  ) {
    return preferredIndex
  }

  return findFirstNamedCoverPageIndex(pages)
}
