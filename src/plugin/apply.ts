import type { TemplatePage } from '@shared/types'
import { createCoverPage } from './cover'

/**
 * Recreates the page and frame structure from a saved template.
 *
 * - Pages that already exist in the file are skipped (not overwritten),
 *   unless `options.replaceAll` is true.
 * - The "Cover" page is ensured to exist, but its contents are managed by the cover flow.
 * - For each page, all template sections are created as FrameNodes.
 * - When `replaceAll` is true: existing non-Cover pages are recorded first,
 *   then removed AFTER the new pages are created (avoids the Figma constraint
 *   of requiring at least one page in a file at all times).
 */
export function applyTemplate(
  pages: TemplatePage[],
  options: { replaceAll?: boolean; coverInsertIndex?: number | null } = {}
): void {
  const coverPage = createCoverPage()

  // Snapshot the pages that exist BEFORE we start, so we only reuse truly
  // pre-existing pages — not pages we create during this apply run.
  // Using a Map<name, PageNode[]> to support multiple pre-existing pages with
  // the same name (e.g. two "---" dividers already in the file).
  const preExisting = new Map<string, PageNode[]>()
  for (const child of figma.root.children) {
    const p = child as PageNode
    if (!preExisting.has(p.name)) preExisting.set(p.name, [])
    preExisting.get(p.name)!.push(p)
  }

  // When replaceAll: navigate away from the current page first (Figma forbids
  // removing the active page), then delete all non-Cover pages.
  if (options.replaceAll) {
    // We'll create new pages before deleting — navigate to a safe landing spot.
    // For now just clear the pre-existing map so nothing is reused.
    preExisting.clear()

    const pagesToRemove = figma.root.children.filter(
      (p): p is PageNode => p.name !== 'Cover'
    ) as PageNode[]

    // Create a temporary landing page so we can navigate away before deleting.
    // We'll delete it at the end if it's still empty.
    const tempPage = figma.createPage()
    tempPage.name = '__temp__'
    figma.currentPage = coverPage ?? tempPage

    for (const page of pagesToRemove) {
      if (figma.root.children.length > 1) page.remove()
    }
  }

  let firstCreatedPage: PageNode | null = null
  const appliedPages: PageNode[] = []

  for (const templatePage of pages) {
    if (templatePage.name === 'Cover') continue

    let page: PageNode | undefined

    // Reuse a pre-existing page (consume one slot so duplicates are created fresh).
    const pool = preExisting.get(templatePage.name)
    if (pool && pool.length > 0) {
      page = pool.shift()
    }

    if (!page) {
      page = figma.createPage()
      page.name = templatePage.name
    }
    appliedPages.push(page)

    if (!firstCreatedPage) {
      firstCreatedPage = page
    }

    for (const section of templatePage.sections) {
      const frame = figma.createFrame()
      frame.name = section.name
      frame.x = section.x
      frame.y = section.y
      frame.resize(section.width, section.height)
      page.appendChild(frame)
    }
  }

  // Force a page change to the first created page if we made one.
  if (firstCreatedPage) {
    figma.currentPage = firstCreatedPage
  }

  repositionCoverPage(coverPage, appliedPages, options.coverInsertIndex)

  // Clean up temp landing page if it still exists and is empty.
  const temp = figma.root.children.find(p => p.name === '__temp__') as PageNode | undefined
  if (temp) {
    // Figma forbids removing the active page; hop away first.
    if (figma.currentPage === temp) {
      const landing = figma.root.children.find(p => p !== temp) as PageNode | undefined
      if (landing) figma.currentPage = landing
    }
    if (temp.children.length === 0 && figma.root.children.length > 1) {
      temp.remove()
    }
  }
}

function repositionCoverPage(
  coverPage: PageNode,
  appliedPages: PageNode[],
  coverInsertIndex?: number | null
): void {
  if (coverInsertIndex === null || coverInsertIndex === undefined) return
  if (appliedPages.length === 0) return

  const clampedIndex = Math.max(0, Math.min(coverInsertIndex, appliedPages.length))
  let targetIndex: number | null = null

  if (clampedIndex === appliedPages.length) {
    const afterPage = appliedPages[appliedPages.length - 1]
    const afterIndex = figma.root.children.indexOf(afterPage)
    if (afterIndex !== -1) targetIndex = afterIndex + 1
  } else {
    const beforePage = appliedPages[clampedIndex]
    const beforeIndex = figma.root.children.indexOf(beforePage)
    if (beforeIndex !== -1) targetIndex = beforeIndex
  }

  if (targetIndex === null) return
  const currentIndex = figma.root.children.indexOf(coverPage)
  if (currentIndex === targetIndex) return

  figma.root.insertChild(targetIndex, coverPage)
}
