import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { TextLayerOverride } from '@shared/types'

interface CoverFieldEditorProps {
    layers: TextLayerOverride[]
    isApplying: boolean
    onSubmit: (overrides: TextLayerOverride[], imageBytes?: Uint8Array) => void
}

export function CoverFieldEditor({ layers, isApplying, onSubmit }: CoverFieldEditorProps) {
    // Local state for all text inputs, keyed by nodeId
    const [values, setValues] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {}
        for (const l of layers) {
            initial[l.nodeId] = l.currentValue
        }
        return initial
    })

    const [imageBytes, setImageBytes] = useState<Uint8Array | undefined>()
    const [imageName, setImageName] = useState<string | null>(null)

    // Does this component have a "Cover Image" layer that we can swap?
    const hasCoverImage = layers.some(l => l.layerName.toLowerCase() === 'cover image')

    function handleFileChange(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) {
            setImageBytes(undefined)
            setImageName(null)
            return
        }

        const reader = new FileReader()
        reader.onload = async () => {
            const buffer = reader.result as ArrayBuffer
            setImageBytes(new Uint8Array(buffer))
            setImageName(file.name)
        }
        reader.readAsArrayBuffer(file)
    }

    function handleSubmit() {
        if (isApplying) return
        const overrides: TextLayerOverride[] = layers.map(l => ({
            nodeId: l.nodeId,
            layerName: l.layerName,
            currentValue: values[l.nodeId] ?? l.currentValue
        }))
        onSubmit(overrides, imageBytes)
    }

    function handleSkip() {
        if (isApplying) return
        onSubmit([])
    }

    return (
        <div style={styles.container}>
            {hasCoverImage && (
                <div style={styles.imageSection}>
                    <label style={styles.label}>Cover Image</label>
                    <div style={styles.uploadRow}>
                        <label style={styles.uploadBtnLabel} htmlFor="cover-image-upload">
                            {imageName || 'Choose image…'}
                        </label>
                        <input
                            id="cover-image-upload"
                            type="file"
                            accept="image/png, image/jpeg"
                            style={styles.fileInput}
                            onChange={handleFileChange}
                        />
                        {imageBytes && (
                            <button
                                style={styles.clearImageBtn}
                                onClick={() => {
                                    setImageBytes(undefined)
                                    setImageName(null)
                                    const input = document.getElementById('cover-image-upload') as HTMLInputElement
                                    if (input) input.value = ''
                                }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}

            {layers.filter(l => l.layerName.toLowerCase() !== 'cover image').map(layer => (
                <div key={layer.nodeId} style={styles.fieldRow}>
                    <label style={styles.label}>{layer.layerName}</label>
                    <input
                        style={styles.input}
                        type="text"
                        value={values[layer.nodeId] ?? ''}
                        onInput={(e) => {
                            setValues(prev => ({
                                ...prev,
                                [layer.nodeId]: (e.target as HTMLInputElement).value
                            }))
                        }}
                    />
                </div>
            ))}

            <div style={styles.actions}>
                <button
                    style={styles.ghostBtn}
                    onClick={handleSkip}
                    disabled={isApplying}
                >
                    Skip fields
                </button>
                <button
                    style={{
                        ...styles.primaryBtn,
                        opacity: isApplying ? 0.6 : 1
                    }}
                    onClick={handleSubmit}
                    disabled={isApplying}
                >
                    {isApplying ? 'Applying…' : 'Apply cover'}
                </button>
            </div>
        </div>
    )
}

const styles: Record<string, h.JSX.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingBottom: '24px' // Extra padding for scrolling
    },
    imageSection: {
        padding: '10px',
        borderRadius: '6px',
        backgroundColor: 'var(--figma-color-bg-secondary)',
        border: '1px solid var(--figma-color-border)',
        marginBottom: '8px'
    },
    fieldRow: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },
    label: {
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--figma-color-text)'
    },
    input: {
        width: '100%',
        padding: '7px 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '12px',
        boxSizing: 'border-box'
    },
    uploadRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginTop: '4px'
    },
    fileInput: {
        display: 'none'
    },
    uploadBtnLabel: {
        flex: 1,
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '11px',
        cursor: 'pointer',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    clearImageBtn: {
        padding: '6px 10px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: 'var(--figma-color-bg-danger)',
        color: 'var(--figma-color-text-danger)',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    actions: {
        display: 'flex',
        gap: '8px',
        marginTop: '12px'
    },
    ghostBtn: {
        flex: 1,
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '12px',
        cursor: 'pointer'
    },
    primaryBtn: {
        flex: 2,
        padding: '8px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: 'var(--figma-color-bg-brand)',
        color: 'var(--figma-color-text-onbrand)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer'
    }
}
