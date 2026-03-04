import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { parseFigmaFileKey } from '@shared/utils'
import { useFigmaLibrary } from '../hooks/useFigmaLibrary'
import { ComponentPicker } from '../components/ComponentPicker'
import { CoverFieldEditor } from '../components/CoverFieldEditor'
import { sendMessage } from '../App'
import type { UIMessage } from '@shared/messages'
import type { TextLayerOverride } from '@shared/types'

interface CoverSetupProps {
    /** Called when the user selects a component and is ready to proceed. */
    onComponentSelected: (componentKey: string) => void
    /** Called when the user chooses to skip cover setup entirely. */
    onSkip: () => void
    /** Called when the user hits the back button. */
    onBack: () => void
}

type Step = 'connect' | 'pick' | 'fields'

export function CoverSetup({ onComponentSelected, onSkip, onBack }: CoverSetupProps) {
    const [step, setStep] = useState<Step>('connect')
    const [fileUrl, setFileUrl] = useState('')
    const [pat, setPat] = useState('')
    const [patLoaded, setPatLoaded] = useState(false)
    const [urlError, setUrlError] = useState<string | null>(null)
    const [fileKey, setFileKey] = useState<string | null>(null)

    const [textLayers, setTextLayers] = useState<TextLayerOverride[]>([])
    const [applying, setApplying] = useState(false)

    const { components, loading, error: libError } = useFigmaLibrary(fileKey, pat || null)

    // On mount, request stored PAT from plugin thread
    useEffect(() => {
        sendMessage({ type: 'GET_PAT' })

        function handleMessage(event: MessageEvent) {
            const msg = event.data?.pluginMessage as UIMessage | undefined
            if (!msg) return

            if (msg.type === 'PAT_RESULT') {
                if (msg.pat) setPat(msg.pat)
                setPatLoaded(true)
            } else if (msg.type === 'TEXT_LAYERS_RESULT') {
                setTextLayers(msg.layers)
                setStep('fields')
            } else if (msg.type === 'ERROR' && msg.code === 'PLACE_COVER_FAILED') {
                setUrlError(msg.message)
                setStep('pick')
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // When components arrive, advance to picker step
    useEffect(() => {
        if (components.length > 0 && !loading && step === 'connect') {
            setStep('pick')
        }
    }, [components, loading, step])

    function handleLoadLibrary() {
        setUrlError(null)

        const key = parseFigmaFileKey(fileUrl)
        if (!key) {
            setUrlError('Invalid Figma file URL. Use a URL like https://figma.com/design/ABC123/…')
            return
        }

        if (!pat.trim()) {
            setUrlError('Please enter your Figma Personal Access Token.')
            return
        }

        // Persist PAT for future sessions
        sendMessage({ type: 'SAVE_PAT', pat: pat.trim() })
        setFileKey(key)
    }

    function handleClearPat() {
        sendMessage({ type: 'CLEAR_PAT' })
        setPat('')
        setFileKey(null)
        setStep('connect')
    }

    // ----- Step 1: Connect library -----
    if (step === 'connect') {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button style={styles.backBtn} onClick={onBack}>← Back</button>
                    <span style={styles.title}>Cover Setup</span>
                    <button style={styles.skipBtn} onClick={onSkip}>Skip</button>
                </div>

                <div style={styles.content}>
                    <p style={styles.instructions}>
                        Link a Figma library file to pick a cover component. Your PAT is stored locally and never sent to our servers.
                    </p>

                    <label style={styles.label}>Figma File URL</label>
                    <input
                        style={styles.input}
                        type="text"
                        placeholder="https://figma.com/design/ABC123/…"
                        value={fileUrl}
                        onInput={(e) => {
                            setFileUrl((e.target as HTMLInputElement).value)
                            setUrlError(null)
                        }}
                    />

                    <label style={styles.label}>
                        Personal Access Token
                        {pat && patLoaded && (
                            <button style={styles.clearPatBtn} onClick={handleClearPat}>
                                Forget token
                            </button>
                        )}
                    </label>
                    <input
                        style={styles.input}
                        type="password"
                        placeholder="figd_…"
                        value={pat}
                        onInput={(e) => setPat((e.target as HTMLInputElement).value)}
                    />

                    {(urlError || libError) && (
                        <div style={styles.error}>{urlError || libError}</div>
                    )}

                    <button
                        style={{
                            ...styles.primaryBtn,
                            opacity: loading ? 0.6 : 1
                        }}
                        onClick={handleLoadLibrary}
                        disabled={loading}
                    >
                        {loading ? 'Loading…' : 'Load Library'}
                    </button>
                </div>
            </div>
        )
    }

    // ----- Step 3: Edit overrides -----
    if (step === 'fields') {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button style={styles.backBtn} onClick={() => setStep('pick')}>← Back</button>
                    <span style={styles.title}>Edit Cover</span>
                    <button style={styles.skipBtn} onClick={onSkip}>Skip</button>
                </div>

                <div style={styles.content}>
                    {textLayers.length === 0 ? (
                        <div style={styles.instructions}>
                            No text layers found in this component.
                        </div>
                    ) : (
                        <div style={styles.instructions}>
                            Update the text fields below. Leave blank to keep the defaults.
                        </div>
                    )}

                    <CoverFieldEditor
                        layers={textLayers}
                        isApplying={applying}
                        onSubmit={(overrides, imageBytes) => {
                            setApplying(true)
                            sendMessage({ type: 'SET_OVERRIDES', overrides, imageBytes })
                            // The componentSelected callback actually means we are done
                            // We don't have the componentKey here locally since it was sent before,
                            // but the App component only needs to know we finished to close the flow.
                            onComponentSelected('done')
                        }}
                    />
                </div>
            </div>
        )
    }

    // ----- Step 2: Pick component -----
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button style={styles.backBtn} onClick={() => setStep('connect')}>← Back</button>
                <span style={styles.title}>Select Component</span>
                <button style={styles.skipBtn} onClick={onSkip}>Skip</button>
            </div>

            {(step === 'pick' && urlError) && (
                <div style={{ padding: '16px 16px 0' }}>
                    <div style={styles.error}>{urlError}</div>
                </div>
            )}

            <div style={styles.content}>
                <ComponentPicker
                    components={components}
                    loading={loading}
                    onSelect={(key) => {
                        setUrlError(null)
                        sendMessage({ type: 'PLACE_COVER', componentKey: key })
                    }}
                />
            </div>
        </div>
    )
}

const styles: Record<string, h.JSX.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--figma-color-bg)'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--figma-color-border)'
    },
    title: {
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--figma-color-text)'
    },
    backBtn: {
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '11px',
        cursor: 'pointer'
    },
    skipBtn: {
        padding: '4px 8px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: 'transparent',
        color: 'var(--figma-color-text-secondary)',
        fontSize: '11px',
        cursor: 'pointer'
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
    },
    instructions: {
        fontSize: '12px',
        color: 'var(--figma-color-text-secondary)',
        margin: '0 0 16px',
        lineHeight: '1.5'
    },
    label: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--figma-color-text)',
        marginBottom: '4px'
    },
    input: {
        width: '100%',
        padding: '7px 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-border)',
        backgroundColor: 'var(--figma-color-bg)',
        color: 'var(--figma-color-text)',
        fontSize: '12px',
        boxSizing: 'border-box',
        marginBottom: '12px'
    },
    primaryBtn: {
        width: '100%',
        padding: '8px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: 'var(--figma-color-bg-brand)',
        color: 'var(--figma-color-text-onbrand)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: '4px'
    },
    error: {
        fontSize: '11px',
        color: 'var(--figma-color-text-danger)',
        marginBottom: '8px',
        lineHeight: '1.4'
    },
    clearPatBtn: {
        padding: '2px 6px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: 'transparent',
        color: 'var(--figma-color-text-danger)',
        fontSize: '10px',
        cursor: 'pointer',
        textDecoration: 'underline'
    }
}
