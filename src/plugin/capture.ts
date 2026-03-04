import type { TemplatePage, TemplateSection } from '@shared/types'

/**
 * Serializes the current Figma file's page and section structure.
 *
 * For each page in the file, captures all top-level FrameNodes as sections.
 * Non-frame nodes (groups, components, etc.) are silently skipped.
 *
 * @returns Array of `TemplatePage`, one per Figma page.
 */
export function captureStructure(): TemplatePage[] {
  return figma.root.children.map(page => {
    const sections: TemplateSection[] = page.children
      .filter((node): node is FrameNode => node.type === 'FRAME')
      .map(frame => ({
        name: frame.name,
        x: Math.round(frame.x),
        y: Math.round(frame.y),
        width: Math.round(frame.width),
        height: Math.round(frame.height)
      }))

    return { name: page.name, sections }
  })
}
