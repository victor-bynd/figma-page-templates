import { describe, it, expect } from 'vitest'
import { parseFigmaFileKey, validateTemplateJSON, serializeTemplate } from '../src/shared/utils'

describe('parseFigmaFileKey', () => {
    it('parses modern /design/ URLs', () => {
        expect(parseFigmaFileKey('https://www.figma.com/design/abc123xyz/My-File?node-id=1-2&t=foo')).toBe('abc123xyz')
    })

    it('parses legacy /file/ URLs', () => {
        expect(parseFigmaFileKey('https://www.figma.com/file/def456uvw/Legacy-File')).toBe('def456uvw')
    })

    it('handles URLs without trailing paths/queries', () => {
        expect(parseFigmaFileKey('https://figma.com/design/ghi789rst')).toBe('ghi789rst')
    })

    it('returns null for invalid domains', () => {
        expect(parseFigmaFileKey('https://example.com/design/abc')).toBeNull()
    })

    it('returns null for invalid paths', () => {
        expect(parseFigmaFileKey('https://figma.com/other/abc')).toBeNull()
    })

    it('returns null for empty or malformed strings', () => {
        expect(parseFigmaFileKey('')).toBeNull()
        expect(parseFigmaFileKey('not-a-url')).toBeNull()
    })
})

describe('validateTemplateJSON', () => {
    const validMock = {
        name: 'Valid Template',
        description: 'A description',
        schemaVersion: 1,
        pages: [
            {
                name: 'Page 1',
                sections: [
                    { name: 'Header', x: 0, y: 0, width: 1440, height: 100 }
                ]
            }
        ],
        coverConfig: {
            componentKey: 'comp-123',
            library: {
                fileKey: 'file-123',
                fileUrl: 'https://figma.com/design/file-123/Lib'
            }
        }
    }

    it('validates a correct template JSON', () => {
        const result = validateTemplateJSON(validMock)
        expect(result).not.toBeNull()
        expect(result?.name).toBe('Valid Template')
        expect(result?.pages[0].name).toBe('Page 1')
        expect(result?.pages[0].sections[0].width).toBe(1440)
        expect(result?.coverConfig?.componentKey).toBe('comp-123')
    })

    it('returns null if name is missing or non-string', () => {
        expect(validateTemplateJSON({ ...validMock, name: undefined })).toBeNull()
        expect(validateTemplateJSON({ ...validMock, name: 123 })).toBeNull()
        expect(validateTemplateJSON({ ...validMock, name: '   ' })).toBeNull() // Empty after trim
    })

    it('returns null if pages is missing or not an array', () => {
        expect(validateTemplateJSON({ ...validMock, pages: undefined })).toBeNull()
        expect(validateTemplateJSON({ ...validMock, pages: {} })).toBeNull()
    })

    it('returns null if a page is malformed', () => {
        // Missing page name
        expect(validateTemplateJSON({ ...validMock, pages: [{ sections: [] }] })).toBeNull()
        // Sections not an array
        expect(validateTemplateJSON({ ...validMock, pages: [{ name: 'P1', sections: {} }] })).toBeNull()
    })

    it('returns null if a section is malformed', () => {
        // Missing required geometry properties
        expect(validateTemplateJSON({
            ...validMock,
            pages: [{ name: 'P1', sections: [{ name: 'S1', x: 0, y: 0, width: 100 }] }] // missing height
        })).toBeNull()

        // Invalid types for geometry
        expect(validateTemplateJSON({
            ...validMock,
            pages: [{ name: 'P1', sections: [{ name: 'S1', x: '0', y: 0, width: 100, height: 100 }] }]
        })).toBeNull()
    })

    it('returns null for completely invalid inputs', () => {
        expect(validateTemplateJSON(null)).toBeNull()
        expect(validateTemplateJSON(undefined)).toBeNull()
        expect(validateTemplateJSON('string')).toBeNull()
        expect(validateTemplateJSON(123)).toBeNull()
    })

    it('gracefully handles missing or malformed coverConfig', () => {
        // Missing coverConfig entirely is valid
        const noCover = validateTemplateJSON({ ...validMock, coverConfig: undefined })
        expect(noCover).not.toBeNull()
        expect(noCover?.coverConfig).toBeNull()

        // Malformed coverConfig (missing componentKey) should result in null coverConfig but valid template
        const malformedCover = validateTemplateJSON({ ...validMock, coverConfig: { library: { fileKey: 'abc' } } })
        expect(malformedCover).not.toBeNull()
        expect(malformedCover?.coverConfig).toBeNull()
    })
})

describe('serializeTemplate', () => {
    const mockTemplate = {
        id: 'doc-123',
        name: 'My Template',
        description: 'Test description',
        pages: [{ name: 'P1', sections: [{ name: 'S1', x: 0, y: 0, width: 100, height: 100 }] }],
        coverConfig: {
            componentKey: 'comp-123',
            library: {
                fileKey: 'file-123',
                fileUrl: 'https://figma.com/design/file-123/Lib'
            }
        },
        createdBy: 'user-123',
        createdByEmail: 'test@example.com',
        createdAt: null,
        updatedAt: null
    }

    it('serializes to JSON, stripping sensitive and runtime-specific data', () => {
        const jsonStr = serializeTemplate(mockTemplate)
        const parsed = JSON.parse(jsonStr)

        // Should include these fields
        expect(parsed.name).toBe('My Template')
        expect(parsed.description).toBe('Test description')
        expect(parsed.pages[0].name).toBe('P1')
        expect(parsed.schemaVersion).toBe(1)

        // Should extract specific coverConfig fields
        expect(parsed.coverConfig.componentKey).toBe('comp-123')
        expect(parsed.coverConfig.library.fileKey).toBe('file-123')

        // Should strip these fields
        expect(parsed.id).toBeUndefined()
        expect(parsed.createdBy).toBeUndefined()
        expect(parsed.createdByEmail).toBeUndefined()
        expect(parsed.createdAt).toBeUndefined()
        expect(parsed.updatedAt).toBeUndefined()
        expect(parsed.coverConfig.library.fileUrl).toBeUndefined()
    })
})
