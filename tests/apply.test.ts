// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyTemplate } from '../src/plugin/apply'
import type { TemplatePage } from '@shared/types'

describe('applyTemplate', () => {
    let createdPages: any[] = []
    let createdFrames: any[] = []

    beforeEach(() => {
        createdPages = []
        createdFrames = []

        global.figma = {
            root: {
                children: []
            },
            createPage: vi.fn(() => {
                const p = { name: '', children: [], appendChild: vi.fn() }
                createdPages.push(p)
                return p
            }),
            createFrame: vi.fn(() => {
                let _width = 0, _height = 0
                const f = {
                    name: '',
                    x: 0,
                    y: 0,
                    resize: vi.fn((w, h) => { _width = w; _height = h }),
                    get width() { return _width },
                    get height() { return _height }
                }
                createdFrames.push(f)
                return f
            })
        } as any
    })

    afterEach(() => {
        vi.restoreAllMocks()
        delete (global as any).figma
    })

    const mockPages: TemplatePage[] = [
        {
            name: 'Page 1',
            sections: [
                { name: 'Sec 1', x: 10, y: 20, width: 100, height: 200 },
                { name: 'Sec 2', x: 120, y: 20, width: 100, height: 200 }
            ]
        },
        {
            name: 'Page 2',
            sections: []
        }
    ]

    it('creates pages and frames correctly for an empty file', () => {
        applyTemplate(mockPages)

        expect(global.figma.createPage).toHaveBeenCalledTimes(2)
        expect(createdPages[0].name).toBe('Page 1')
        expect(createdPages[1].name).toBe('Page 2')

        expect(global.figma.createFrame).toHaveBeenCalledTimes(2)
        expect(createdFrames[0].name).toBe('Sec 1')
        expect(createdFrames[0].x).toBe(10)
        expect(createdFrames[0].y).toBe(20)
        expect(createdFrames[0].resize).toHaveBeenCalledWith(100, 200)

        expect(createdPages[0].appendChild).toHaveBeenCalledTimes(2)
        expect(createdPages[1].appendChild).toHaveBeenCalledTimes(0)
    })

    it('skips existing pages by name', () => {
        global.figma.root.children = [
            { name: 'Page 1', children: [], appendChild: vi.fn() } as any
        ]

        applyTemplate(mockPages)

        // Should only create 'Page 2' since 'Page 1' exists
        expect(global.figma.createPage).toHaveBeenCalledTimes(1)
        expect(createdPages[0].name).toBe('Page 2')

        // Should still create the frames for 'Page 1' but append them to the existing page
        expect(global.figma.createFrame).toHaveBeenCalledTimes(2)
        expect(createdFrames[0].name).toBe('Sec 1')

        // The existing page should have been mutated
        expect(global.figma.root.children[0].appendChild).toHaveBeenCalledTimes(2)
    })

    it('skips the Cover page silently', () => {
        const pagesWithCover: TemplatePage[] = [
            { name: 'Cover', sections: [{ name: 'S1', x: 0, y: 0, width: 10, height: 10 }] },
            ...mockPages
        ]

        applyTemplate(pagesWithCover)

        expect(global.figma.createPage).toHaveBeenCalledTimes(2) // Only Page 1 and Page 2
        expect(createdPages.map(p => p.name)).not.toContain('Cover')
    })

    it('handles empty template silently', () => {
        applyTemplate([])
        expect(global.figma.createPage).toHaveBeenCalledTimes(0)
        expect(global.figma.createFrame).toHaveBeenCalledTimes(0)
    })
})
