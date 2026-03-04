import { useEffect, useState } from 'preact/hooks'

/** Lightweight representation of a Figma component returned by the REST API. */
export interface FigmaComponent {
    /** The component key used with `figma.importComponentByKeyAsync`. */
    key: string
    /** Human-readable component name. */
    name: string
    /** Description of the component, if any. */
    description: string
    /** URL to the thumbnail image (hosted by Figma). */
    thumbnailUrl: string | null
}

const CACHE_PREFIX = 'figma_lib_'

function readCache(fileKey: string): FigmaComponent[] | null {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + fileKey)
        return raw ? (JSON.parse(raw) as FigmaComponent[]) : null
    } catch {
        return null
    }
}

function writeCache(fileKey: string, components: FigmaComponent[]): void {
    try {
        localStorage.setItem(CACHE_PREFIX + fileKey, JSON.stringify(components))
    } catch {
        // Storage full — ignore
    }
}

/**
 * Fetches the published components from a Figma file via the REST API.
 *
 * Returns cached data immediately (if available) while re-fetching in the
 * background. Requires both `fileKey` and `pat` to be non-null to trigger
 * a fetch.
 */
export function useFigmaLibrary(fileKey: string | null, pat: string | null) {
    const [components, setComponents] = useState<FigmaComponent[]>(
        () => (fileKey ? readCache(fileKey) : null) ?? []
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!fileKey || !pat) {
            setComponents([])
            setLoading(false)
            setError(null)
            return
        }

        // Return cached results immediately while re-fetching
        const cached = readCache(fileKey)
        if (cached) setComponents(cached)

        let cancelled = false
        setLoading(true)
        setError(null)

        fetch(`https://api.figma.com/v1/files/${fileKey}/components`, {
            headers: { 'X-Figma-Token': pat }
        })
            .then(async res => {
                if (!res.ok) {
                    const body = await res.text().catch(() => '')
                    throw new Error(
                        res.status === 403
                            ? 'Access denied — check your PAT permissions and that the file is shared with you.'
                            : res.status === 404
                                ? 'File not found — check the URL is correct.'
                                : `Figma API error ${res.status}: ${body}`
                    )
                }
                return res.json() as Promise<{ meta: { components: Array<Record<string, unknown>> } }>
            })
            .then(data => {
                if (cancelled) return

                const result: FigmaComponent[] = (data.meta?.components ?? []).map(
                    (c: Record<string, unknown>) => ({
                        key: c.key as string,
                        name: c.name as string,
                        description: (c.description as string) ?? '',
                        thumbnailUrl: (c.thumbnail_url as string) ?? null
                    })
                )

                setComponents(result)
                writeCache(fileKey, result)
                setLoading(false)
            })
            .catch(err => {
                if (cancelled) return
                setError(err instanceof Error ? err.message : String(err))
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [fileKey, pat])

    return { components, loading, error }
}
