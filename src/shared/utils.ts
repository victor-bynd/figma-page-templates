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
const ACCOUNT_SCHEMA_VERSION = 1

export type ExportedTemplate = {
  schemaVersion?: number
  name: string
  description: string
  pages: TemplatePage[]
  coverPageIndex?: number | null
  coverConfig: CoverConfig | null
  groupId?: string | null
}

export type ExportedGroup = {
  id: string
  name: string
  order: number
}

export type AccountExport = {
  schemaVersion: number
  templates: ExportedTemplate[]
  groups: ExportedGroup[]
}

/**
 * Serializes a template to JSON for export.
 *
 * Strips environment-specific fields and any sensitive data.
 */
export function serializeTemplate(template: Template): string {
  const payload = serializeTemplatePayload(template)
  if (!payload.coverConfig) {
    return JSON.stringify(payload, null, 2)
  }

  return JSON.stringify(
    {
      ...payload,
      coverConfig: {
        ...payload.coverConfig,
        library: {
          fileKey: payload.coverConfig.library.fileKey
        }
      }
    },
    null,
    2
  )
}

/**
 * Serializes all templates + groups for account-level export.
 */
export function serializeAccount(
  templates: Template[],
  groups: TemplateGroup[]
): string {
  const payload: AccountExport = {
    schemaVersion: ACCOUNT_SCHEMA_VERSION,
    templates: templates.map(serializeTemplatePayload),
    groups: groups.map(g => ({
      id: g.id,
      name: g.name,
      order: g.order
    }))
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
  const coverPageIndex = (() => {
    if (obj.coverPageIndex === null || obj.coverPageIndex === undefined) return null
    if (
      typeof obj.coverPageIndex === 'number' &&
      Number.isInteger(obj.coverPageIndex) &&
      obj.coverPageIndex >= 0 &&
      obj.coverPageIndex < pages.length
    ) {
      return obj.coverPageIndex
    }
    return null
  })()

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

  const groupId = (() => {
    if (typeof obj.groupId === 'string') {
      const trimmed = obj.groupId.trim()
      return trimmed ? trimmed : undefined
    }
    if (obj.groupId === null) return null
    return undefined
  })()

  return {
    schemaVersion,
    id: '',
    name,
    description,
    pages,
    coverPageIndex,
    coverConfig,
    createdBy: '',
    createdByEmail: '',
    createdAt: null,
    updatedAt: null,
    groupId
  }
}

/**
 * Validates an account-level export or a single-template JSON.
 * Returns normalized export payloads or null if validation fails.
 */
export function validateAccountJSON(json: unknown): {
  templates: ExportedTemplate[]
  groups: ExportedGroup[]
} | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>

  const normalizeTemplate = (input: unknown): ExportedTemplate | null => {
    const template = validateTemplateJSON(input)
    if (!template) return null
    return serializeTemplatePayload(template)
  }

  if (Array.isArray(obj.templates)) {
    const templates: ExportedTemplate[] = []
    for (const rawTemplate of obj.templates) {
      const normalized = normalizeTemplate(rawTemplate)
      if (!normalized) return null
      templates.push(normalized)
    }

    const groups: ExportedGroup[] = []
    if (obj.groups === undefined) {
      // ok
    } else if (Array.isArray(obj.groups)) {
      for (const rawGroup of obj.groups) {
        if (!rawGroup || typeof rawGroup !== 'object') return null
        const groupObj = rawGroup as Record<string, unknown>
        const id = typeof groupObj.id === 'string' ? groupObj.id.trim() : ''
        const name = typeof groupObj.name === 'string' ? groupObj.name.trim() : ''
        const order = groupObj.order
        if (!id || !name || typeof order !== 'number' || !Number.isFinite(order)) return null
        groups.push({ id, name, order })
      }
    } else {
      return null
    }

    return { templates, groups }
  }

  // Fallback: accept a single-template export
  const single = normalizeTemplate(obj)
  if (!single) return null
  return { templates: [single], groups: [] }
}

function serializeTemplatePayload(
  template: Template
): ExportedTemplate {
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
          fileKey: coverConfig.library.fileKey,
          fileUrl: coverConfig.library.fileUrl
        }
      }
    : null

  return {
    schemaVersion: template.schemaVersion ?? TEMPLATE_SCHEMA_VERSION,
    name: rest.name,
    description: rest.description ?? '',
    pages: rest.pages ?? [],
    coverPageIndex: rest.coverPageIndex ?? null,
    coverConfig: sanitizedCoverConfig,
    groupId: rest.groupId ?? null
  }
}

import type { CoverConfig, Template, TemplateGroup, TemplatePage, TemplateSection } from './types'
