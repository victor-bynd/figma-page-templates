// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    createCoverPage,
    placeCoverComponent,
    getTextLayers,
    applyTextOverrides,
    swapCoverImage
} from '../src/plugin/cover'

describe('cover.ts', () => {
    let createdPages: any[] = []

    beforeEach(() => {
        createdPages = []

        global.figma = {
            root: {
                children: [],
                insertChild: vi.fn((idx, p) => {
                    global.figma.root.children.splice(idx, 0, p)
                })
            },
            createPage: vi.fn(() => {
                const p = { name: '', children: [], appendChild: vi.fn() }
                createdPages.push(p)
                return p
            }),
            importComponentByKeyAsync: vi.fn().mockResolvedValue({
                createInstance: vi.fn(() => ({
                    x: 10,
                    y: 20,
                    type: 'INSTANCE',
                    children: [],
                    findOne: vi.fn()
                }))
            }),
            getNodeById: vi.fn(),
            loadFontAsync: vi.fn().mockResolvedValue(undefined),
            createImage: vi.fn(() => ({ hash: 'img_hash_123' }))
        } as any
    })

    afterEach(() => {
        vi.restoreAllMocks()
        delete (global as any).figma
    })

    describe('createCoverPage', () => {
        it('creates a Cover page at index 0 if it does not exist', () => {
            global.figma.root.children = [
                { name: 'P1' } as any,
                { name: 'P2' } as any
            ]

            const page = createCoverPage()

            expect(global.figma.createPage).toHaveBeenCalledTimes(1)
            expect(page.name).toBe('Cover')
            expect(global.figma.root.insertChild).toHaveBeenCalledWith(0, page)
            expect(global.figma.root.children[0]).toBe(page)
        })

        it('returns the existing Cover page without creating a new one', () => {
            const existingCover = { name: 'Cover' } as any
            global.figma.root.children = [
                { name: 'P1' } as any,
                existingCover
            ]

            const page = createCoverPage()

            expect(global.figma.createPage).not.toHaveBeenCalled()
            expect(page).toBe(existingCover)
        })

        it('returns first existing alias page when no preferred name is provided', () => {
            const existingThumbnail = { name: 'Thumbnail' } as any
            global.figma.root.children = [
                { name: 'P1' } as any,
                existingThumbnail
            ]

            const page = createCoverPage()

            expect(global.figma.createPage).not.toHaveBeenCalled()
            expect(page).toBe(existingThumbnail)
        })

        it('uses preferred page name when provided', () => {
            const page = createCoverPage('Thumbnail')

            expect(global.figma.createPage).toHaveBeenCalledTimes(1)
            expect(page.name).toBe('Thumbnail')
        })
    })

    describe('placeCoverComponent', () => {
        it('imports component and places instance securely on the given page', async () => {
            const page = { appendChild: vi.fn() } as any
            const instance = await placeCoverComponent(page, 'test-key')

            expect(global.figma.importComponentByKeyAsync).toHaveBeenCalledWith('test-key')
            expect(page.appendChild).toHaveBeenCalledWith(instance)
            expect(instance.x).toBe(0)
            expect(instance.y).toBe(0)
        })

        it('throws COMPONENT_NOT_PUBLISHED if import fails', async () => {
            global.figma.importComponentByKeyAsync = vi.fn().mockRejectedValue(new Error('Network error'))
            const page = { appendChild: vi.fn() } as any

            await expect(placeCoverComponent(page, 'invalid-key')).rejects.toThrow('COMPONENT_NOT_PUBLISHED')
        })
    })

    describe('getTextLayers', () => {
        it('extracts TEXT nodes dynamically through children hierarchy', () => {
            const instance = {
                type: 'INSTANCE',
                children: [
                    { type: 'RECTANGLE', id: '1' },
                    {
                        type: 'FRAME',
                        id: '2',
                        children: [
                            { type: 'TEXT', id: 't1', name: 'Title', characters: 'Hello' },
                            { type: 'TEXT', id: 't2', name: 'Subtitle', characters: 'World' }
                        ]
                    }
                ]
            } as any

            // We need to match our recursive structure locally since simple mock objects need to match the type structure tested
            const result = getTextLayers(instance)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ nodeId: 't1', layerName: 'Title', currentValue: 'Hello' })
            expect(result[1]).toEqual({ nodeId: 't2', layerName: 'Subtitle', currentValue: 'World' })
        })

        it('returns empty if no text nodes', () => {
            const instance = { type: 'INSTANCE', children: [{ type: 'RECTANGLE' }] } as any
            expect(getTextLayers(instance)).toEqual([])
        })
    })

    describe('applyTextOverrides', () => {
        it('updates text after successfully loading fonts', async () => {
            const mockNode1 = { id: 't1', type: 'TEXT', fontName: { family: 'Inter', style: 'Regular' }, characters: 'Old 1' }
            const mockNode2 = { id: 't2', type: 'TEXT', fontName: { family: 'Roboto', style: 'Bold' }, characters: 'Old 2' }
            const mockNode3 = { id: 't3', type: 'TEXT', fontName: Symbol('mixed'), characters: 'Mixed' }

            global.figma.getNodeById = vi.fn((id: string) => {
                if (id === 't1') return mockNode1 as any
                if (id === 't2') return mockNode2 as any
                if (id === 't3') return mockNode3 as any
                return null
            })

            const overrides = [
                { nodeId: 't1', layerName: 'L1', currentValue: 'New 1' },
                { nodeId: 't2', layerName: 'L2', currentValue: 'New 2' },
                { nodeId: 't3', layerName: 'L3', currentValue: 'New 3' }, // Should bypass font load but perform apply
                { nodeId: 'missing', layerName: 'L4', currentValue: 'New 4' } // Should ignore
            ]

            await applyTextOverrides({} as any, overrides)

            expect(global.figma.loadFontAsync).toHaveBeenCalledTimes(2) // Only 2 non-symbol fonts
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Inter', style: 'Regular' })
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Roboto', style: 'Bold' })

            expect(mockNode1.characters).toBe('New 1')
            expect(mockNode2.characters).toBe('New 2')
            expect(mockNode3.characters).toBe('New 3')
        })

        it('throws FONT_LOAD_FAILED if font load rejects', async () => {
            global.figma.getNodeById = vi.fn(() => ({ type: 'TEXT', fontName: { family: 'Arial' } } as any))
            global.figma.loadFontAsync = vi.fn().mockRejectedValue(new Error('Missing font'))

            const overrides = [{ nodeId: 't1', layerName: 'L1', currentValue: 'New' }]

            await expect(applyTextOverrides({} as any, overrides)).rejects.toThrow('FONT_LOAD_FAILED')
        })
    })

    describe('swapCoverImage', () => {
        it('replaces fills on first exact matching "Cover Image" layer', () => {
            const mockImageNode = { name: 'Cover Image', type: 'RECTANGLE', fills: [] as any[] }
            const instance = {
                findOne: vi.fn((predicate) => predicate(mockImageNode) ? mockImageNode : null)
            } as any

            const dummyBytes = new Uint8Array([1, 2, 3])
            swapCoverImage(instance, dummyBytes)

            expect(global.figma.createImage).toHaveBeenCalledWith(dummyBytes)
            expect(mockImageNode.fills).toEqual([
                { type: 'IMAGE', imageHash: 'img_hash_123', scaleMode: 'FILL' }
            ])
        })

        it('bypasses silently if no matching layer found', () => {
            const instance = { findOne: vi.fn().mockReturnValue(null) } as any
            swapCoverImage(instance, new Uint8Array([1]))
            // If it doesn't throw and does not create image, it passes
            expect(global.figma.createImage).not.toHaveBeenCalled()
        })
    })
})
