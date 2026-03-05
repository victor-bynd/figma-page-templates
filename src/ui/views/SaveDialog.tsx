import { h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { saveTemplate } from '@backend/db'
import { sendMessage } from '../App'
import { parseFigmaFileKey } from '@shared/utils'
import { useFigmaLibrary } from '../hooks/useFigmaLibrary'
import { ComponentPicker } from '../components/ComponentPicker'
import type { CoverConfig, OrgUser, TemplatePage, TemplateGroup } from '@shared/types'

interface SaveDialogProps {
  currentUser: OrgUser | null
  isLocalMode: boolean
  groups: TemplateGroup[]
  onSaved: (templateId: string) => void
  onCancel: () => void
}

/** Phase of the optional cover-library section. */
type CoverPhase = 'idle' | 'connect' | 'pick'

/** Resolved cover selection stored in state. */
interface SelectedCover {
  key: string
  name: string
  fileUrl: string
  fileKey: string
}

export function SaveDialog({
  currentUser,
  isLocalMode,
  groups,
  onSaved,
  onCancel
}: SaveDialogProps) {
  // ── Template metadata ───────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturedPages, setCapturedPages] = useState<TemplatePage[] | null>(null)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  // ── Cover library (optional) ────────────────────────────────────────────
  const [coverPhase, setCoverPhase] = useState<CoverPhase>('idle')
  const [coverFileUrl, setCoverFileUrl] = useState('')
  const [coverFileKey, setCoverFileKey] = useState<string | null>(null)
  const [coverPat, setCoverPat] = useState('')
  const [coverPatLoaded, setCoverPatLoaded] = useState(false)
  const [coverUrlError, setCoverUrlError] = useState<string | null>(null)
  const [selectedCover, setSelectedCover] = useState<SelectedCover | null>(null)

  const { components: coverComponents, loading: coverLoading, error: coverLibError } = useFigmaLibrary(
    coverPhase !== 'idle' ? coverFileKey : null,
    coverPhase !== 'idle' ? coverPat || null : null
  )

  // Tracks the active local-save response listener so we can clean it up.
  const saveListenerRef = useRef<((e: MessageEvent) => void) | null>(null)

  function triggerCapture() {
    setCapturedPages(null)
    sendMessage({ type: 'CAPTURE_STRUCTURE' })
  }

  // On mount: capture structure + request stored PAT.
  useEffect(() => {
    triggerCapture()
    sendMessage({ type: 'GET_PAT' })

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage
      if (!msg) return
      if (msg.type === 'STRUCTURE_CAPTURED') {
        setCapturedPages(msg.pages)
      } else if (msg.type === 'PAT_RESULT') {
        if (msg.pat) setCoverPat(msg.pat)
        setCoverPatLoaded(true)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      if (saveListenerRef.current) {
        window.removeEventListener('message', saveListenerRef.current)
        saveListenerRef.current = null
      }
    }
  }, [])

  // Auto-advance to picker once components load.
  useEffect(() => {
    if (coverComponents.length > 0 && !coverLoading && coverPhase === 'connect') {
      setCoverPhase('pick')
    }
  }, [coverComponents, coverLoading, coverPhase])

  // ── Cover library handlers ───────────────────────────────────────────────
  function handleLoadCoverLibrary() {
    setCoverUrlError(null)
    const key = parseFigmaFileKey(coverFileUrl)
    if (!key) {
      setCoverUrlError('Invalid Figma file URL. Use https://figma.com/design/ABC123/…')
      return
    }
    if (!coverPat.trim()) {
      setCoverUrlError('Enter your Figma Personal Access Token.')
      return
    }
    sendMessage({ type: 'SAVE_PAT', pat: coverPat.trim() })
    setCoverFileKey(key)
  }

  function handleSelectCover(componentKey: string) {
    const comp = coverComponents.find(c => c.key === componentKey)
    if (!comp || !coverFileKey) return
    setSelectedCover({ key: componentKey, name: comp.name, fileUrl: coverFileUrl, fileKey: coverFileKey })
  }

  function handleRemoveCover() {
    setSelectedCover(null)
    setCoverFileKey(null)
    setCoverPhase('idle')
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const coverConfig: CoverConfig | null = selectedCover
    ? { componentKey: selectedCover.key, library: { fileUrl: selectedCover.fileUrl, fileKey: selectedCover.fileKey } }
    : null

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!capturedPages || !name.trim()) return
    setSaving(true)
    setError(null)

    if (isLocalMode) {
      if (saveListenerRef.current) {
        window.removeEventListener('message', saveListenerRef.current)
        saveListenerRef.current = null
      }

      const cleanup = (listener: (e: MessageEvent) => void, timerId: ReturnType<typeof setTimeout>) => {
        clearTimeout(timerId)
        window.removeEventListener('message', listener)
        saveListenerRef.current = null
      }

      const handleResponse = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage
        if (!msg) return
        if (msg.type === 'LOCAL_TEMPLATE_SAVED') {
          cleanup(handleResponse, timeoutId)
          onSaved(msg.template.id)
        } else if (msg.type === 'ERROR' && msg.code === 'LOCAL_SAVE_FAILED') {
          cleanup(handleResponse, timeoutId)
          setError(msg.message ?? 'Failed to save template')
          setSaving(false)
        }
      }

      const timeoutId = setTimeout(() => {
        cleanup(handleResponse, timeoutId)
        setError('Save timed out. Please try again.')
        setSaving(false)
      }, 10_000)

      saveListenerRef.current = handleResponse
      window.addEventListener('message', handleResponse)
      sendMessage({
        type: 'SAVE_LOCAL_TEMPLATE',
        template: {
          name: name.trim(),
          description: description.trim(),
          pages: capturedPages,
          coverConfig,
          groupId: selectedGroupId,
          createdBy: 'local',
          createdByEmail: ''
        }
      })
      return
    }

    try {
      const id = await saveTemplate(currentUser!.orgId, {
        name: name.trim(),
        description: description.trim(),
        pages: capturedPages,
        coverConfig,
        groupId: selectedGroupId,
        createdBy: currentUser!.uid,
        createdByEmail: currentUser!.email
      })
      onSaved(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
      setSaving(false)
    }
  }

  const canSubmit = name.trim().length > 0 && capturedPages !== null && !saving

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>New Template</span>
        <button style={styles.closeBtn} onClick={onCancel} aria-label="Cancel">
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formBody}>
          {/* Name */}
          <label style={styles.label}>
            Name <span style={styles.required}>*</span>
          </label>
          <input
            style={styles.input}
            type="text"
            placeholder="e.g. Product Launch"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            disabled={saving}
            autoFocus
          />

          {/* Description */}
          <label style={{ ...styles.label, marginTop: '12px' }}>Description</label>
          <textarea
            style={styles.textarea}
            placeholder="Optional — describe what this template is for"
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            disabled={saving}
            rows={2}
          />

          {/* Structure preview */}
          <div style={styles.previewHeader}>
            <span style={styles.label}>Detected structure</span>
            {capturedPages === null ? (
              <span style={styles.scanning}>Scanning…</span>
            ) : (
              <button
                type="button"
                style={styles.refreshBtn}
                onClick={triggerCapture}
                disabled={saving}
                title="Re-scan the file structure"
              >
                ↺ Refresh
              </button>
            )}
          </div>

          <div style={styles.preview}>
            {capturedPages === null ? (
              <SkeletonList />
            ) : capturedPages.length === 0 ? (
              <p style={styles.emptyPreview}>No pages found in this file.</p>
            ) : (
              capturedPages.map(page => (
                <div key={page.name} style={styles.pageRow}>
                  <span style={styles.pageIcon}>▤</span>
                  <span style={styles.pageName}>{page.name}</span>
                  <span style={styles.sectionCount}>
                    {page.sections.length} frame{page.sections.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Group (optional) */}
          {groups.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <label style={styles.label}>Group</label>
              <select
                style={styles.input}
                value={selectedGroupId ?? ''}
                onChange={e => setSelectedGroupId((e.target as HTMLSelectElement).value || null)}
                disabled={saving}
              >
                <option value="">No group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cover library (optional) */}
          <div style={styles.coverSection}>
            <div style={styles.coverHeader}>
              <span style={styles.label}>Cover library</span>
              <span style={styles.optionalBadge}>optional</span>
            </div>

            {/* Idle: show a link-library button */}
            {coverPhase === 'idle' && !selectedCover && (
              <button
                type="button"
                style={styles.coverLinkBtn}
                onClick={() => setCoverPhase('connect')}
                disabled={saving}
              >
                + Link library
              </button>
            )}

            {/* Selected: show summary */}
            {selectedCover && (
              <div style={styles.coverSelected}>
                <span style={styles.coverCheck}>✓</span>
                <span style={styles.coverSelectedName}>{selectedCover.name}</span>
                <button
                  type="button"
                  style={styles.coverActionBtn}
                  onClick={() => { setSelectedCover(null); setCoverPhase('pick') }}
                  disabled={saving}
                >
                  Change
                </button>
                <button
                  type="button"
                  style={{ ...styles.coverActionBtn, color: 'var(--figma-color-text-danger)' }}
                  onClick={handleRemoveCover}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            )}

            {/* Connect: URL + PAT form */}
            {coverPhase === 'connect' && !selectedCover && (
              <div style={styles.coverConnect}>
                <label style={styles.fieldLabel}>Figma File URL</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="https://figma.com/design/ABC123/…"
                  value={coverFileUrl}
                  onInput={e => {
                    setCoverFileUrl((e.target as HTMLInputElement).value)
                    setCoverUrlError(null)
                  }}
                />
                <label style={styles.fieldLabel}>
                  Personal Access Token
                  {coverPat && coverPatLoaded && (
                    <button
                      type="button"
                      style={styles.forgetPatBtn}
                      onClick={() => { sendMessage({ type: 'CLEAR_PAT' }); setCoverPat('') }}
                    >
                      Forget
                    </button>
                  )}
                </label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="figd_…"
                  value={coverPat}
                  onInput={e => setCoverPat((e.target as HTMLInputElement).value)}
                />
                {(coverUrlError || coverLibError) && (
                  <div style={styles.coverError}>{coverUrlError || coverLibError}</div>
                )}
                <div style={styles.coverConnectActions}>
                  <button
                    type="button"
                    style={styles.coverCancelBtn}
                    onClick={() => { setCoverPhase('idle'); setCoverFileKey(null); setCoverUrlError(null) }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.coverLoadBtn, opacity: coverLoading ? 0.6 : 1 }}
                    onClick={handleLoadCoverLibrary}
                    disabled={coverLoading}
                  >
                    {coverLoading ? 'Loading…' : 'Load Library'}
                  </button>
                </div>
              </div>
            )}

            {/* Pick: compact component grid */}
            {coverPhase === 'pick' && !selectedCover && (
              <div style={styles.coverPick}>
                <p style={styles.coverPickHint}>Select a default cover component:</p>
                <ComponentPicker
                  components={coverComponents}
                  loading={coverLoading}
                  gridMaxHeight="160px"
                  onSelect={handleSelectCover}
                />
                <button
                  type="button"
                  style={styles.coverCancelBtn}
                  onClick={() => { setCoverPhase('connect'); setCoverFileKey(null) }}
                >
                  ← Back
                </button>
              </div>
            )}
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.saveBtn,
                ...(!canSubmit ? styles.saveBtnDisabled : {})
              }}
              disabled={!canSubmit}
            >
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function SkeletonList() {
  return (
    <div>
      {[70, 55, 80].map((w, i) => (
        <div key={i} style={{ ...styles.skeleton, width: `${w}%` }} />
      ))}
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
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '12px',
    padding: '2px 4px'
  },
  form: {
    display: 'block',
    padding: '16px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0
  },
  formBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '4px',
    display: 'block'
  },
  required: {
    color: 'var(--figma-color-text-danger)'
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
  textarea: {
    width: '100%',
    padding: '7px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    boxSizing: 'border-box',
    resize: 'none',
    fontFamily: 'inherit'
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '16px',
    marginBottom: '6px'
  },
  scanning: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)'
  },
  refreshBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  preview: {
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    padding: '8px',
    minHeight: '60px',
    backgroundColor: 'var(--figma-color-bg-secondary)'
  },
  pageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 0',
    fontSize: '12px',
    color: 'var(--figma-color-text)'
  },
  pageIcon: {
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px'
  },
  pageName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  sectionCount: {
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)',
    flexShrink: 0
  },
  emptyPreview: {
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)',
    margin: 0,
    textAlign: 'center',
    padding: '8px 0'
  },
  skeleton: {
    height: '12px',
    borderRadius: '4px',
    backgroundColor: 'var(--figma-color-border)',
    marginBottom: '8px',
    opacity: 0.5
  },
  // Cover section
  coverSection: {
    marginTop: '16px',
    borderTop: '1px solid var(--figma-color-border)',
    paddingTop: '12px'
  },
  coverHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px'
  },
  optionalBadge: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)',
    backgroundColor: 'var(--figma-color-bg-secondary)',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '4px',
    padding: '1px 5px'
  },
  coverLinkBtn: {
    width: '100%',
    padding: '7px',
    borderRadius: '6px',
    border: '1px dashed var(--figma-color-border)',
    backgroundColor: 'transparent',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center'
  },
  coverSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    rowGap: '4px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg-secondary)'
  },
  coverCheck: {
    color: 'var(--figma-color-bg-brand)',
    fontSize: '12px',
    flexShrink: 0
  },
  coverSelectedName: {
    flex: 1,
    fontSize: '12px',
    color: 'var(--figma-color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  coverActionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    padding: '2px 4px',
    flexShrink: 0
  },
  coverConnect: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  fieldLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '4px',
    marginTop: '8px'
  },
  coverConnectActions: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '4px'
  },
  coverCancelBtn: {
    flex: 1,
    padding: '6px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  coverLoadBtn: {
    flex: 2,
    padding: '6px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  coverPick: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  coverPickHint: {
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)',
    margin: 0
  },
  coverError: {
    fontSize: '11px',
    color: 'var(--figma-color-text-danger)',
    lineHeight: '1.4'
  },
  forgetPatBtn: {
    padding: '2px 6px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--figma-color-text-danger)',
    fontSize: '10px',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  error: {
    marginTop: '8px',
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'var(--figma-color-bg-danger)',
    color: 'var(--figma-color-text-danger)',
    fontSize: '11px'
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '16px'
  },
  cancelBtn: {
    flex: 1,
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    cursor: 'pointer'
  },
  saveBtn: {
    flex: 2,
    padding: '8px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  saveBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  }
}
