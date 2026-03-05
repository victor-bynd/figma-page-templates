import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { FigmaComponent } from '../hooks/useFigmaLibrary'

interface ComponentPickerProps {
    components: FigmaComponent[]
    loading: boolean
    onSelect: (componentKey: string) => void
    /** Override the max-height of the component grid. Default: '260px'. */
    gridMaxHeight?: string
}

export function ComponentPicker({ components, loading, onSelect, gridMaxHeight = '260px' }: ComponentPickerProps) {
    const [search, setSearch] = useState('')
    const [selectedKey, setSelectedKey] = useState<string | null>(null)

    const filtered = search.trim()
        ? components.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        : components

    function handleSelect(key: string) {
        setSelectedKey(key)
        onSelect(key)
    }

    if (loading) return <SkeletonGrid />

    if (components.length === 0) {
        return (
            <div style={styles.empty}>
                <p style={styles.emptyText}>No published components found in this library.</p>
            </div>
        )
    }

    return (
        <div style={styles.container}>
            <div style={styles.searchRow}>
                <input
                    style={styles.search}
                    type="text"
                    placeholder="Search components…"
                    value={search}
                    onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                />
            </div>

            {filtered.length === 0 ? (
                <div style={styles.empty}>
                    <p style={styles.emptyText}>No components match your search.</p>
                </div>
            ) : (
                <div style={{ ...styles.grid, maxHeight: gridMaxHeight }}>
                    {filtered.map(c => (
                        <button
                            key={c.key}
                            style={{
                                ...styles.card,
                                ...(selectedKey === c.key ? styles.cardSelected : {})
                            }}
                            onClick={() => handleSelect(c.key)}
                            title={c.description || c.name}
                        >
                            {c.thumbnailUrl ? (
                                <img
                                    src={c.thumbnailUrl}
                                    alt={c.name}
                                    style={styles.thumbnail}
                                />
                            ) : (
                                <div style={styles.thumbPlaceholder} />
                            )}
                            <span style={styles.cardLabel}>{c.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function SkeletonGrid() {
    return (
        <div style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={styles.skeletonCard}>
                    <div style={styles.skeletonThumb} />
                    <div style={styles.skeletonLine} />
                </div>
            ))}
        </div>
    )
}

const styles: Record<string, h.JSX.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    searchRow: {
        padding: '0'
    },
    search: {
        width: '100%',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '12px',
        boxSizing: 'border-box'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '8px',
        maxHeight: '260px',
        overflowY: 'auto'
    },
    card: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '6px',
        borderRadius: '8px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        cursor: 'pointer',
        textAlign: 'center' as const,
        transition: 'border-color 0.15s, box-shadow 0.15s'
    },
    cardSelected: {
        borderColor: 'var(--figma-color-border-brand-strong, var(--figma-color-bg-brand))',
        boxShadow: '0 0 0 1px var(--figma-color-border-brand-strong, var(--figma-color-bg-brand))'
    },
    thumbnail: {
        width: '100%',
        aspectRatio: '1',
        objectFit: 'contain',
        borderRadius: '4px',
        backgroundColor: 'var(--figma-color-bg-secondary)'
    },
    thumbPlaceholder: {
        width: '100%',
        aspectRatio: '1',
        borderRadius: '4px',
        backgroundColor: 'var(--figma-color-bg-secondary)'
    },
    cardLabel: {
        fontSize: '10px',
        color: 'var(--figma-color-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%'
    },
    empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '24px'
    },
    emptyText: {
        fontSize: '12px',
        color: 'var(--figma-color-text-secondary)',
        margin: 0
    },
    skeletonCard: {
        borderRadius: '8px',
        border: '1px solid var(--figma-color-border)',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    skeletonThumb: {
        width: '100%',
        aspectRatio: '1',
        borderRadius: '4px',
        backgroundColor: 'var(--figma-color-border)'
    },
    skeletonLine: {
        height: '8px',
        borderRadius: '4px',
        backgroundColor: 'var(--figma-color-border)',
        width: '70%'
    }
}
