import type { TemplatePage } from '@shared/types'
import { isCoverPageName } from '@shared/coverPage'
import { createCoverPage } from './cover'

/**
 * Recreates the page and frame structure from a saved template.
 *
 * - Pages that already exist in the file are skipped (not overwritten),
 *   unless `options.replaceAll` is true.
 * - The cover page is only ensured when `options.includeCover` is true.
 * - For each page, all template sections are created as FrameNodes.
 * - When `replaceAll` is true: existing non-cover pages are recorded first,
 *   then removed AFTER the new pages are created (avoids the Figma constraint
 *   of requiring at least one page in a file at all times).
 */
export function applyTemplate(
  pages: TemplatePage[],
  options: {
    includeCover?: boolean
    replaceAll?: boolean
    coverInsertIndex?: number | null
    coverPageName?: string | null
  } = {}
): void {
  const includeCover = options.includeCover === true
  const coverPage = includeCover ? createCoverPage(options.coverPageName) : null
  const failedRemovalNames = new Map<PageNode, string>()

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
  // removing the active page), then delete all non-cover pages.
  if (options.replaceAll) {
    // We'll create new pages before deleting — navigate to a safe landing spot.
    // For now just clear the pre-existing map so nothing is reused.
    preExisting.clear()

    const pagesToRemove = figma.root.children.filter(
      (p): p is PageNode => p !== coverPage
    ) as PageNode[]

    // Create a temporary landing page so we can navigate away before deleting.
    // We'll delete it at the end if it's still empty.
    const tempPage = figma.createPage()
    tempPage.name = '__temp__'
    figma.currentPage = coverPage ?? tempPage

    for (const page of pagesToRemove) {
      if (figma.root.children.length > 1) {
        try {
          page.remove()
        } catch {
          // Figma may forbid removing certain pages (e.g. the active page
          // in another tab, or a system-protected node). Clear it instead
          // so it becomes an empty shell, then rename to mark for cleanup.
          for (const child of [...page.children]) {
            try { child.remove() } catch { /* skip locked children */ }
          }
          failedRemovalNames.set(page, page.name)
          page.name = '__removed__'
        }
      }
    }
  }

  let firstCreatedPage: PageNode | null = null
  const appliedPages: PageNode[] = []

  for (const templatePage of pages) {
    if (includeCover && isTemplateCoverPage(templatePage.name, options.coverPageName)) continue

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

  if (coverPage) {
    repositionCoverPage(coverPage, appliedPages, options.coverInsertIndex)
  }

  // Clean up temp and leftover "__removed__" pages.
  const cleanup = figma.root.children.filter(
    p => p.name === '__temp__' || p.name === '__removed__'
  ) as PageNode[]
  for (const page of cleanup) {
    if (figma.currentPage === page) {
      const landing = figma.root.children.find(p => p !== page) as PageNode | undefined
      if (landing) figma.currentPage = landing
    }
    if (figma.root.children.length > 1) {
      try {
        page.remove()
      } catch {
        // If a page can't be removed (active in another tab, protected, etc.),
        // restore its original name so we don't leave "__removed__" behind.
        const originalName = failedRemovalNames.get(page)
        if (originalName) {
          page.name = originalName
        }
      }
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

function isTemplateCoverPage(
  templatePageName: string,
  configuredCoverPageName?: string | null
): boolean {
  const normalizedPageName = templatePageName.trim().toLowerCase()
  const normalizedConfigured = configuredCoverPageName?.trim().toLowerCase()

  if (normalizedConfigured) {
    return normalizedPageName === normalizedConfigured
  }

  return isCoverPageName(templatePageName)
}
