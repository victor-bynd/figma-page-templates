import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { saveTemplate } from '@backend/db'
import { sendMessage } from '../App'
import type { OrgUser, TemplatePage } from '@shared/types'

interface SaveDialogProps {
  currentUser: OrgUser
  /** Pages captured from the current Figma file. Null while capture is in flight. */
  capturedPages: TemplatePage[] | null
  onSaved: (templateId: string) => void
  onCancel: () => void
}

export function SaveDialog({
  currentUser,
  capturedPages,
  onSaved,
  onCancel
}: SaveDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Trigger capture as soon as the dialog mounts.
  useEffect(() => {
    sendMessage({ type: 'CAPTURE_STRUCTURE' })
  }, [])

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!capturedPages || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const id = await saveTemplate(currentUser.orgId, {
        name: name.trim(),
        description: description.trim(),
        pages: capturedPages,
        coverConfig: null,
        createdBy: currentUser.uid,
        createdByEmail: currentUser.email
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
        <label style={{ ...styles.label, marginTop: '12px' }}>
          Description
        </label>
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
          {capturedPages === null && (
            <span style={styles.scanning}>Scanning…</span>
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
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '4px',
    overflowY: 'auto',
    flex: 1
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
