import type { TextLayerOverride } from '@shared/types'

/**
 * Creates a new "Cover" page at index 0, or returns the existing one.
 */
export function createCoverPage(): PageNode {
    const existing = figma.root.children.find(p => p.name === 'Cover')
    if (existing) return existing

    const page = figma.createPage()
    page.name = 'Cover'
    figma.root.insertChild(0, page)
    return page
}

/**
 * Imports a component by key and places an instance centered on the given page.
 */
export async function placeCoverComponent(
    page: PageNode,
    componentKey: string
): Promise<InstanceNode> {
    try {
        const component = await figma.importComponentByKeyAsync(componentKey)
        const instance = component.createInstance()
        page.appendChild(instance)

        // Center it on the page
        instance.x = 0
        instance.y = 0

        return instance
    } catch (err) {
        throw new Error('COMPONENT_NOT_PUBLISHED')
    }
}

/**
 * Traverses an instance and collects all text nodes for overriding.
 */
export function getTextLayers(instance: InstanceNode): TextLayerOverride[] {
    const overrides: TextLayerOverride[] = []

    // Recursive traversal
    function walk(node: SceneNode) {
        if (node.type === 'TEXT') {
            overrides.push({
                nodeId: node.id,
                layerName: node.name,
                currentValue: node.characters
            })
        }

        // We conditionally try to walk children if the node supports it
        if ('children' in node && typeof (node as any).children === 'object') {
            for (const child of node.children) {
                walk(child)
            }
        }
    }

    walk(instance)
    return overrides
}

/**
 * Applies text overrides to matching child nodes.
 */
export async function applyTextOverrides(
    instance: InstanceNode,
    overrides: TextLayerOverride[]
): Promise<void> {
    const fontsToLoad = new Set<FontName>()
    const updates: Array<{ node: TextNode; newText: string }> = []

    // Pre-process nodes and collect fonts
    for (const override of overrides) {
        const node = figma.getNodeById(override.nodeId)
        // Ignore nodes that no longer exist, or aren't text nodes
        if (!node || node.type !== 'TEXT') continue

        // A text node can have multiple fonts if mixed; this simple implementation
        // assumes the entire node has a single font style. For a cover template
        // this is usually a safe assumption.
        const fontName = node.fontName as FontName
        if (fontName && typeof fontName !== 'symbol') {
            fontsToLoad.add(fontName)
        }

        updates.push({ node, newText: override.currentValue })
    }

    // Load all unique fonts required
    try {
        await Promise.all(Array.from(fontsToLoad).map(f => figma.loadFontAsync(f)))
    } catch {
        throw new Error('FONT_LOAD_FAILED')
    }

    // Apply the text changes
    for (const update of updates) {
        update.node.characters = update.newText
    }
}

/**
 * Swaps a cover image into the first layer named exactly "Cover Image".
 */
export function swapCoverImage(instance: InstanceNode, imageBytes: Uint8Array): void {
    const imageNode = instance.findOne(
        n => n.name.toLowerCase() === 'cover image' && (n.type === 'RECTANGLE' || n.type === 'FRAME')
    ) as RectangleNode | FrameNode | null

    if (!imageNode) return // Silently ignore if no compatible layer is found

    const image = figma.createImage(imageBytes)
    imageNode.fills = [
        {
            type: 'IMAGE',
            imageHash: image.hash,
            scaleMode: 'FILL'
        }
    ]
}
