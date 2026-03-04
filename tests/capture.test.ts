// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { captureStructure } from '../src/plugin/capture'

describe('captureStructure', () => {
    beforeEach(() => {
        // Basic mock of figma.root.children
        global.figma = {
            root: {
                children: []
            }
        } as any
    })

    afterEach(() => {
        vi.restoreAllMocks()
        delete (global as any).figma
    })

    it('returns empty array when there are no pages', () => {
        expect(captureStructure()).toEqual([])
    })

    it('captures an empty page correctly', () => {
        global.figma.root.children = [
            { name: 'Empty Page', children: [] } as unknown as PageNode
        ]

        const result = captureStructure()
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Empty Page')
        expect(result[0].sections).toEqual([])
    })

    it('captures a page with only FrameNodes as sections', () => {
        global.figma.root.children = [
            {
                name: 'Page 1',
                children: [
                    { type: 'FRAME', name: 'Header', x: 10.4, y: 20.6, width: 100.1, height: 200.9 }
                ]
            } as unknown as PageNode
        ]

        const result = captureStructure()
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Page 1')
        expect(result[0].sections).toHaveLength(1)

        // Geometry should be rounded
        expect(result[0].sections[0]).toEqual({
            name: 'Header',
            x: 10,
            y: 21,
            width: 100,
            height: 201
        })
    })

    it('ignores non-FrameNodes silently', () => {
        global.figma.root.children = [
            {
                name: 'Mixed Page',
                children: [
                    { type: 'RECTANGLE', name: 'Background' },
                    { type: 'FRAME', name: 'Main Frame', x: 0, y: 0, width: 50, height: 50 },
                    { type: 'ELLIPSE', name: 'Circle' }
                ]
            } as unknown as PageNode
        ]

        const result = captureStructure()
        expect(result).toHaveLength(1)
        expect(result[0].sections).toHaveLength(1)
        expect(result[0].sections[0].name).toBe('Main Frame')
    })

    it('processes multiple pages correctly', () => {
        global.figma.root.children = [
            {
                name: 'P1',
                children: [
                    { type: 'FRAME', name: 'F1', x: 0, y: 0, width: 10, height: 10 }
                ]
            } as unknown as PageNode,
            {
                name: 'P2',
                children: [
                    { type: 'TEXT', name: 'Text Only' }
                ]
            } as unknown as PageNode
        ]

        const result = captureStructure()
        expect(result).toHaveLength(2)

        expect(result[0].name).toBe('P1')
        expect(result[0].sections).toHaveLength(1)
        expect(result[0].sections[0].name).toBe('F1')

        expect(result[1].name).toBe('P2')
        expect(result[1].sections).toHaveLength(0)
    })

    it('rounds negative coordinates correctly', () => {
        global.figma.root.children = [
            {
                name: 'P1',
                children: [
                    { type: 'FRAME', name: 'F1', x: -10.4, y: -20.6, width: 10, height: 10 }
                ]
            } as unknown as PageNode
        ]

        const result = captureStructure()
        expect(result[0].sections[0].x).toBe(-10)
        expect(result[0].sections[0].y).toBe(-21)
    })
})
