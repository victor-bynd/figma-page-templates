import { h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { saveTemplate, updateTemplate } from '@backend/db'
import { sendMessage } from '../App'
import { parseFigmaFileKey } from '@shared/utils'
import { resolveCoverPageIndex } from '@shared/coverPage'
import { useFigmaLibrary } from '../hooks/useFigmaLibrary'
import { ComponentPicker } from '../components/ComponentPicker'
import type { CoverConfig, OrgUser, Template, TemplatePage, TemplateGroup } from '@shared/types'

interface SaveDialogProps {
  currentUser: OrgUser | null
  isLocalMode: boolean
  groups: TemplateGroup[]
  editingTemplate?: Template | null
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
  editingTemplate,
  onSaved,
  onCancel
}: SaveDialogProps) {
  const isEditing = !!editingTemplate
  const isCreating = !isEditing
  type CreationMode = 'detect' | 'manual'
  // ── Template metadata ───────────────────────────────────────────────────
  const [name, setName] = useState(editingTemplate?.name ?? '')
  const [description, setDescription] = useState(editingTemplate?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturedPages, setCapturedPages] = useState<TemplatePage[] | null>(
    editingTemplate ? [...editingTemplate.pages.map(p => ({ ...p, sections: [...p.sections] }))] : null
  )
  const [creationMode, setCreationMode] = useState<CreationMode>('detect')
  const [detectedPages, setDetectedPages] = useState<TemplatePage[] | null>(null)
  const [manualPages, setManualPages] = useState<TemplatePage[] | null>(null)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(editingTemplate?.groupId ?? null)
  const [coverPageIndex, setCoverPageIndex] = useState<number | null>(() =>
    editingTemplate ? resolveCoverPageIndex(editingTemplate.pages, editingTemplate.coverPageIndex) : null
  )

  // ── Cover library (optional) ────────────────────────────────────────────
  const [coverPhase, setCoverPhase] = useState<CoverPhase>('idle')
  const [coverFileUrl, setCoverFileUrl] = useState('')
  const [coverFileKey, setCoverFileKey] = useState<string | null>(null)
  const [coverPat, setCoverPat] = useState('')
  const [coverPatLoaded, setCoverPatLoaded] = useState(false)
  const [coverUrlError, setCoverUrlError] = useState<string | null>(null)
  const [selectedCover, setSelectedCover] = useState<SelectedCover | null>(
    editingTemplate?.coverConfig
      ? {
          key: editingTemplate.coverConfig.componentKey,
          name: editingTemplate.coverConfig.componentKey,
          fileUrl: editingTemplate.coverConfig.library.fileUrl,
          fileKey: editingTemplate.coverConfig.library.fileKey
        }
      : null
  )

  const { components: coverComponents, loading: coverLoading, error: coverLibError } = useFigmaLibrary(
    coverPhase !== 'idle' ? coverFileKey : null,
    coverPhase !== 'idle' ? coverPat || null : null
  )

  // Tracks the active local-save response listener so we can clean it up.
  const saveListenerRef = useRef<((e: MessageEvent) => void) | null>(null)

  function triggerCapture() {
    setDetectedPages(null)
    sendMessage({ type: 'CAPTURE_STRUCTURE' })
  }

  // On mount: capture structure (new only) + request stored PAT.
  useEffect(() => {
    if (!isEditing) triggerCapture()
    sendMessage({ type: 'GET_PAT' })

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage
      if (!msg) return
      if (msg.type === 'STRUCTURE_CAPTURED') {
        if (isEditing) {
          setCapturedPages(msg.pages)
        } else {
          setDetectedPages(msg.pages)
        }
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

  // Seed manual pages from detected structure the first time manual mode is used.
  useEffect(() => {
    if (!isCreating) return
    if (creationMode !== 'manual') return
    if (manualPages !== null) return
    if (detectedPages === null) return
    const seeded = detectedPages.map(p => ({ ...p, sections: [...p.sections] }))
    setManualPages(seeded)
  }, [creationMode, detectedPages, isCreating, manualPages])

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

  // ── Page editing helpers (edit mode) ────────────────────────────────────
  const [expandedPageIndex, setExpandedPageIndex] = useState<number | null>(null)
  const isManualCreation = isCreating && creationMode === 'manual'
  const isEditable = isEditing || isManualCreation
  const activePages = isEditing ? capturedPages : isManualCreation ? manualPages : detectedPages

  useEffect(() => {
    if (activePages === null) {
      setCoverPageIndex(null)
      return
    }
    setCoverPageIndex(prev => resolveCoverPageIndex(activePages, prev))
  }, [activePages])

  function updateEditablePages(
    updater: (prev: TemplatePage[] | null) => TemplatePage[] | null
  ) {
    if (isEditing) {
      setCapturedPages(updater)
    } else {
      setManualPages(updater)
    }
  }

  function handleRenamePage(index: number, newName: string) {
    updateEditablePages(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], name: newName }
      return next
    })
  }

  function handleRemovePage(index: number) {
    updateEditablePages(prev => {
      if (!prev) return prev
      const next = prev.filter((_, i) => i !== index)
      return next
    })
    if (expandedPageIndex === index) setExpandedPageIndex(null)
    else if (expandedPageIndex !== null && expandedPageIndex > index) setExpandedPageIndex(expandedPageIndex - 1)
    setCoverPageIndex(prev => {
      if (prev === null) return prev
      if (prev === index) return null
      if (prev > index) return prev - 1
      return prev
    })
  }

  function handleMovePage(index: number, direction: -1 | 1) {
    const target = index + direction
    if (!activePages || target < 0 || target >= activePages.length) return

    updateEditablePages(prev => {
      if (!prev) return prev
      const next = [...prev]
      const temp = next[index]
      next[index] = next[target]
      next[target] = temp
      return next
    })
    if (expandedPageIndex === index) setExpandedPageIndex(index + direction)
    else if (expandedPageIndex === index + direction) setExpandedPageIndex(index)
    setCoverPageIndex(prev => {
      if (prev === null) return prev
      if (prev === index) return target
      if (prev === target) return index
      return prev
    })
  }

  function handleAddPage() {
    updateEditablePages(prev => {
      const next = prev ? [...prev] : []
      next.push({ name: `Page ${next.length + 1}`, sections: [] })
      return next
    })
  }

  function handleAddSeparator() {
    updateEditablePages(prev => {
      const next = prev ? [...prev] : []
      next.push({ name: '---', sections: [] })
      return next
    })
  }

  function handleRenameSection(pageIndex: number, sectionIndex: number, newName: string) {
    updateEditablePages(prev => {
      if (!prev) return prev
      const next = [...prev]
      const sections = [...next[pageIndex].sections]
      sections[sectionIndex] = { ...sections[sectionIndex], name: newName }
      next[pageIndex] = { ...next[pageIndex], sections }
      return next
    })
  }

  function handleRemoveSection(pageIndex: number, sectionIndex: number) {
    updateEditablePages(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[pageIndex] = {
        ...next[pageIndex],
        sections: next[pageIndex].sections.filter((_, i) => i !== sectionIndex)
      }
      return next
    })
  }

  function handleAddSection(pageIndex: number) {
    updateEditablePages(prev => {
      if (!prev) return prev
      const next = [...prev]
      const sections = [...next[pageIndex].sections]
      sections.push({ name: `Section ${sections.length + 1}`, x: 0, y: 0, width: 1440, height: 900 })
      next[pageIndex] = { ...next[pageIndex], sections }
      return next
    })
  }

  function handleRefreshFromFile() {
    if (isEditing) {
      setCapturedPages(null)
    } else {
      setManualPages(null)
      setDetectedPages(null)
    }
    sendMessage({ type: 'CAPTURE_STRUCTURE' })
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const coverConfig: CoverConfig | null = selectedCover
    ? { componentKey: selectedCover.key, library: { fileUrl: selectedCover.fileUrl, fileKey: selectedCover.fileKey } }
    : null

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!activePages || !name.trim()) return
    setSaving(true)
    setError(null)

    const templateData = {
      name: name.trim(),
      description: description.trim(),
      pages: activePages,
      coverPageIndex,
      coverConfig,
      groupId: selectedGroupId
    }

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

      if (isEditing) {
        sendMessage({
          type: 'UPDATE_LOCAL_TEMPLATE_FULL',
          id: editingTemplate!.id,
          template: templateData
        })
      } else {
        sendMessage({
          type: 'SAVE_LOCAL_TEMPLATE',
          template: {
            ...templateData,
            createdBy: 'local',
            createdByEmail: ''
          }
        })
      }
      return
    }

    try {
      if (isEditing) {
        await updateTemplate(currentUser!.orgId, editingTemplate!.id, templateData)
        onSaved(editingTemplate!.id)
      } else {
        const id = await saveTemplate(currentUser!.orgId, {
          ...templateData,
          createdBy: currentUser!.uid,
          createdByEmail: currentUser!.email
        })
        onSaved(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
      setSaving(false)
    }
  }

  const canSubmit = name.trim().length > 0 && activePages !== null && !saving
  const structureLabel = isEditable ? 'Pages' : 'Detected structure'

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>{isEditing ? 'Edit Template' : 'New Template'}</span>
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

          {/* Structure preview / editor */}
          {isCreating && (
            <div style={styles.modeRow}>
              <span style={styles.label}>Mode</span>
              <div style={styles.modeToggle}>
                <button
                  type="button"
                  style={{
                    ...styles.modeBtn,
                    ...(creationMode === 'detect' ? styles.modeBtnActive : {})
                  }}
                  onClick={() => setCreationMode('detect')}
                  disabled={saving}
                >
                  Detect current structure
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.modeBtn,
                    ...(creationMode === 'manual' ? styles.modeBtnActive : {})
                  }}
                  onClick={() => setCreationMode('manual')}
                  disabled={saving}
                >
                  Manual mode
                </button>
              </div>
              {creationMode === 'manual' && (
                <div style={styles.modeHint}>Tip: name a page <span style={styles.hintMono}>---</span> to add a separator.</div>
              )}
            </div>
          )}
          <div style={styles.previewHeader}>
            <span style={styles.label}>{structureLabel}</span>
            {isEditable ? (
              <button
                type="button"
                style={styles.refreshBtn}
                onClick={handleRefreshFromFile}
                disabled={saving}
                title="Replace pages with current file structure"
              >
                ↺ Replace from file
              </button>
            ) : activePages === null ? (
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
          {activePages !== null && activePages.length > 0 && (
            <div style={styles.coverHint}>
              {coverPageIndex !== null && activePages[coverPageIndex]
                ? `Cover page: ${activePages[coverPageIndex].name}`
                : 'Cover page: not set'}
              {' · '}
              Auto-detect uses the first page named "Cover" or "Thumbnail".
            </div>
          )}

          <div style={styles.preview}>
            {activePages === null ? (
              <SkeletonList />
            ) : activePages.length === 0 ? (
              <p style={styles.emptyPreview}>
                {isEditable ? 'No pages. Add one below.' : 'No pages found in this file.'}
              </p>
            ) : isEditable ? (
              activePages.map((page, pi) => (
                <div key={pi}>
                  <div style={styles.editablePageRow}>
                    <button
                      type="button"
                      style={styles.expandBtn}
                      onClick={() => setExpandedPageIndex(expandedPageIndex === pi ? null : pi)}
                      title={expandedPageIndex === pi ? 'Collapse sections' : 'Expand sections'}
                    >
                      {expandedPageIndex === pi ? '▾' : '▸'}
                    </button>
                    <input
                      style={styles.pageNameInput}
                      value={page.name}
                      onInput={e => handleRenamePage(pi, (e.target as HTMLInputElement).value)}
                      disabled={saving}
                    />
                    <span style={styles.sectionCount}>
                      {page.sections.length} frame{page.sections.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      style={coverPageIndex === pi ? styles.coverPageBtnActive : styles.coverPageBtn}
                      onClick={() => setCoverPageIndex(pi)}
                      disabled={saving}
                      title="Set as cover page"
                    >
                      {coverPageIndex === pi ? 'Cover' : 'Set cover'}
                    </button>
                    <button
                      type="button"
                      style={styles.moveBtn}
                      onClick={() => handleMovePage(pi, -1)}
                      disabled={saving || pi === 0}
                      title="Move up"
                    >↑</button>
                    <button
                      type="button"
                      style={styles.moveBtn}
                      onClick={() => handleMovePage(pi, 1)}
                      disabled={saving || pi === activePages!.length - 1}
                      title="Move down"
                    >↓</button>
                    <button
                      type="button"
                      style={styles.removeBtn}
                      onClick={() => handleRemovePage(pi)}
                      disabled={saving}
                      title="Remove page"
                    >✕</button>
                  </div>
                  {expandedPageIndex === pi && (
                    <div style={styles.sectionsContainer}>
                      {page.sections.length === 0 ? (
                        <p style={styles.emptySections}>No frames</p>
                      ) : (
                        page.sections.map((sec, si) => (
                          <div key={si} style={styles.sectionRow}>
                            <span style={styles.sectionIcon}>▫</span>
                            <input
                              style={styles.sectionNameInput}
                              value={sec.name}
                              onInput={e => handleRenameSection(pi, si, (e.target as HTMLInputElement).value)}
                              disabled={saving}
                            />
                            <button
                              type="button"
                              style={styles.removeBtn}
                              onClick={() => handleRemoveSection(pi, si)}
                              disabled={saving}
                              title="Remove frame"
                            >✕</button>
                          </div>
                        ))
                      )}
                      <button
                        type="button"
                        style={styles.addSectionBtn}
                        onClick={() => handleAddSection(pi)}
                        disabled={saving}
                      >
                        + Add frame
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              activePages.map((page, index) => (
                <div key={`${page.name}-${index}`} style={styles.pageRow}>
                  <span style={styles.pageIcon}>▤</span>
                  <span style={styles.pageName}>{page.name}</span>
                  <span style={styles.sectionCount}>
                    {page.sections.length} frame{page.sections.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    style={coverPageIndex === index ? styles.coverPageBtnActive : styles.coverPageBtn}
                    onClick={() => setCoverPageIndex(index)}
                    disabled={saving}
                    title="Set as cover page"
                  >
                    {coverPageIndex === index ? 'Cover' : 'Set cover'}
                  </button>
                </div>
              ))
            )}
          </div>

          {isEditable && (
            <div style={styles.addPageRow}>
              <button
                type="button"
                style={styles.addPageBtn}
                onClick={handleAddPage}
                disabled={saving}
              >
                + Add page
              </button>
              {isManualCreation && (
                <button
                  type="button"
                  style={styles.addSeparatorBtn}
                  onClick={handleAddSeparator}
                  disabled={saving}
                >
                  + Add separator
                </button>
              )}
            </div>
          )}

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
              {saving ? 'Saving…' : isEditing ? 'Update Template' : 'Save Template'}
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
  modeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '16px'
  },
  modeToggle: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap'
  },
  modeBtn: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  modeBtnActive: {
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    borderColor: 'var(--figma-color-bg-brand)'
  },
  modeHint: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)'
  },
  hintMono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '10px'
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
  coverHint: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '6px'
  },
  coverPageBtn: {
    padding: '2px 6px',
    borderRadius: '10px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    cursor: 'pointer',
    flexShrink: 0
  },
  coverPageBtnActive: {
    padding: '2px 6px',
    borderRadius: '10px',
    border: '1px solid var(--figma-color-bg-brand)',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '10px',
    cursor: 'pointer',
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
  // Editable page rows (edit mode)
  editablePageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 0',
    fontSize: '12px',
    color: 'var(--figma-color-text)'
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    padding: '0 2px',
    flexShrink: 0,
    width: '16px',
    textAlign: 'center' as const
  },
  pageNameInput: {
    flex: 1,
    minWidth: 0,
    padding: '3px 6px',
    borderRadius: '4px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    fontWeight: 600,
    boxSizing: 'border-box'
  },
  moveBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    padding: '2px 3px',
    borderRadius: '3px',
    flexShrink: 0,
    opacity: 0.7
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-danger)',
    fontSize: '10px',
    padding: '2px 3px',
    borderRadius: '3px',
    flexShrink: 0
  },
  addPageBtn: {
    flex: 1,
    padding: '5px',
    borderRadius: '6px',
    border: '1px dashed var(--figma-color-border)',
    backgroundColor: 'transparent',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center'
  },
  addPageRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '4px'
  },
  addSeparatorBtn: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px dashed var(--figma-color-border)',
    backgroundColor: 'transparent',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center'
  },
  sectionsContainer: {
    marginLeft: '20px',
    paddingLeft: '8px',
    borderLeft: '1px solid var(--figma-color-border)',
    marginBottom: '4px'
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 0',
    fontSize: '11px'
  },
  sectionIcon: {
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    flexShrink: 0
  },
  sectionNameInput: {
    flex: 1,
    minWidth: 0,
    padding: '2px 5px',
    borderRadius: '3px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    boxSizing: 'border-box'
  },
  emptySections: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)',
    margin: '2px 0',
    fontStyle: 'italic'
  },
  addSectionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    padding: '3px 0',
    textAlign: 'left' as const
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
