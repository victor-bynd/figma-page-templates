import type { TemplatePage } from '@shared/types'

/**
 * Recreates the page and frame structure from a saved template.
 *
 * - Pages that already exist in the file are skipped (not overwritten).
 * - The "Cover" page is never touched — managed by the cover flow.
 * - For each page, all template sections are created as FrameNodes.
 */
export function applyTemplate(pages: TemplatePage[]): void {
  for (const templatePage of pages) {
    if (templatePage.name === 'Cover') continue

    let page = figma.root.children.find(
      (p): p is PageNode => p.name === templatePage.name
    )

    if (!page) {
      page = figma.createPage()
      page.name = templatePage.name
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
}
