/**
 * Parses a Figma file URL and extracts the file key.
 *
 * Supports both legacy and current URL formats:
 * - https://www.figma.com/file/ABC123/Title
 * - https://figma.com/design/ABC123/Title
 * - https://www.figma.com/file/ABC123
 * - https://figma.com/design/ABC123?query=1
 *
 * @returns The file key string, or `null` if the URL is invalid.
 */
export function parseFigmaFileKey(url: string): string | null {
  if (!url || typeof url !== 'string') return null

  try {
    const parsed = new URL(url.trim())

    // Must be a figma.com hostname
    if (!parsed.hostname.endsWith('figma.com')) return null

    // Pathname format: /(file|design)/:key[/optional-title]
    const match = parsed.pathname.match(/^\/(file|design)\/([a-zA-Z0-9]+)/)
    return match ? match[2] : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Template export / import helpers
// ---------------------------------------------------------------------------

const TEMPLATE_SCHEMA_VERSION = 1

/**
 * Serializes a template to JSON for export.
 *
 * Strips environment-specific fields and any sensitive data.
 */
export function serializeTemplate(template: Template): string {
  const {
    // strip fields that should not be exported
    id: _id,
    createdBy: _createdBy,
    createdByEmail: _createdByEmail,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    coverConfig,
    ...rest
  } = template

  const sanitizedCoverConfig = coverConfig
    ? {
        componentKey: coverConfig.componentKey,
        library: {
          fileKey: coverConfig.library.fileKey
          // fileUrl intentionally omitted
        }
      }
    : null

  const payload = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    name: rest.name,
    description: rest.description ?? '',
    pages: rest.pages ?? [],
    coverConfig: sanitizedCoverConfig
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Validates an imported template JSON object.
 * Returns a normalized Template or null if validation fails.
 */
export function validateTemplateJSON(json: unknown): Template | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>

  const name = typeof obj.name === 'string' ? obj.name.trim() : ''
  if (!name) return null

  const rawPages = obj.pages
  if (!Array.isArray(rawPages)) return null

  const pages: TemplatePage[] = []
  for (const rawPage of rawPages) {
    if (!rawPage || typeof rawPage !== 'object') return null
    const pageObj = rawPage as Record<string, unknown>
    const pageName = typeof pageObj.name === 'string' ? pageObj.name : ''
    if (!pageName) return null

    const rawSections = pageObj.sections
    if (!Array.isArray(rawSections)) return null

    const sections: TemplateSection[] = []
    for (const rawSection of rawSections) {
      if (!rawSection || typeof rawSection !== 'object') return null
      const sectionObj = rawSection as Record<string, unknown>
      const sectionName = typeof sectionObj.name === 'string' ? sectionObj.name : ''
      const x = sectionObj.x
      const y = sectionObj.y
      const width = sectionObj.width
      const height = sectionObj.height
      if (
        !sectionName ||
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof width !== 'number' ||
        typeof height !== 'number'
      ) {
        return null
      }
      sections.push({ name: sectionName, x, y, width, height })
    }

    pages.push({ name: pageName, sections })
  }

  const description = typeof obj.description === 'string' ? obj.description : ''

  let coverConfig: CoverConfig | null = null
  if (obj.coverConfig && typeof obj.coverConfig === 'object') {
    const cc = obj.coverConfig as Record<string, unknown>
    const componentKey = typeof cc.componentKey === 'string' ? cc.componentKey : ''
    const lib = cc.library && typeof cc.library === 'object'
      ? (cc.library as Record<string, unknown>)
      : null
    const fileKey = lib && typeof lib.fileKey === 'string' ? lib.fileKey : ''
    const fileUrl = lib && typeof lib.fileUrl === 'string' ? lib.fileUrl : ''
    if (componentKey && fileKey) {
      coverConfig = {
        componentKey,
        library: {
          fileKey,
          fileUrl
        }
      }
    }
  }

  const schemaVersion =
    typeof obj.schemaVersion === 'number' ? obj.schemaVersion : undefined

  return {
    schemaVersion,
    id: '',
    name,
    description,
    pages,
    coverConfig,
    createdBy: '',
    createdByEmail: '',
    createdAt: null,
    updatedAt: null
  }
}
import type { CoverConfig, Template, TemplatePage, TemplateSection } from './types'
