import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { sendMessage } from '../App'
import type { TemplatePage, Template } from '@shared/types'

export type ApplyStatus = 'idle' | 'applying' | 'success' | 'error'

interface ApplyConfirmProps {
  template: Template
  /** Pages in the current Figma file, used to detect conflicts. Null while scanning. */
  currentPages: TemplatePage[] | null
  status: ApplyStatus
  error: string | null
  onBack: () => void
  /** Optional: navigate to cover setup after applying. */
  onSetupCover?: () => void
}

export function ApplyConfirm({
  template,
  currentPages,
  status,
  error,
  onBack,
  onSetupCover
}: ApplyConfirmProps) {
  const [localPending, setLocalPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const existingNames = new Set((currentPages ?? []).map(p => p.name))
  const conflicts = template.pages
    .filter(p => p.name !== 'Cover' && existingNames.has(p.name))
    .map(p => p.name)

  const isApplying = localPending || status === 'applying'

  useEffect(() => {
    if (status === 'error' || status === 'success') {
      setLocalPending(false)
      setConfirmOpen(false)
    }
  }, [status])

  function handleRequestApply() {
    if (isApplying) return
    setConfirmOpen(true)
  }

  function handleConfirmApply() {
    if (isApplying) return
    setLocalPending(true)
    sendMessage({ type: 'APPLY_TEMPLATE', pages: template.pages })
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.centerContent}>
          <div style={styles.successIcon}>✓</div>
          <p style={styles.successText}>Template applied successfully!</p>
          {onSetupCover && (
            <button style={styles.primaryBtn} onClick={onSetupCover}>Set up Cover</button>
          )}
          <button style={onSetupCover ? styles.ghostBtn : styles.primaryBtn} onClick={onBack}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} disabled={isApplying}>
          ← Back
        </button>
        <span style={styles.title}>Apply Template</span>
      </div>

      <div style={styles.body}>
        {/* Template summary */}
        <div style={styles.templateName}>{template.name}</div>
        {template.description && (
          <div style={styles.templateDesc}>{template.description}</div>
        )}

        {/* Page list */}
        <div style={styles.sectionLabel}>Pages that will be created</div>
        <div style={styles.pageList}>
          {template.pages
            .filter(p => p.name !== 'Cover')
            .map(page => (
              <div key={page.name} style={styles.pageRow}>
                <span style={styles.pageIcon}>▤</span>
                <span style={styles.pageName}>{page.name}</span>
                <span style={styles.sectionCount}>
                  {page.sections.length} frame{page.sections.length !== 1 ? 's' : ''}
                </span>
                {existingNames.has(page.name) && (
                  <span style={styles.skipBadge}>skip</span>
                )}
              </div>
            ))}
        </div>

        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <div style={styles.warning}>
            <strong>Note:</strong> {conflicts.length} page{conflicts.length !== 1 ? 's' : ''} already
            exist ({conflicts.join(', ')}) and will be skipped.
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div style={styles.error}>{error}</div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={styles.cancelBtn}
            onClick={onBack}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.applyBtn,
              ...(isApplying ? styles.applyBtnDisabled : {})
            }}
            onClick={handleRequestApply}
            disabled={isApplying}
          >
            {isApplying ? 'Applying…' : 'Apply Template'}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div style={styles.dialogOverlay}>
          <div role="dialog" aria-modal="true" style={styles.dialog}>
            <div style={styles.dialogTitle}>Apply this template?</div>
            <div style={styles.dialogBody}>
              This will create pages and frames in your current file.
              {conflicts.length > 0 && (
                <div style={styles.dialogWarning}>
                  {conflicts.length} page{conflicts.length !== 1 ? 's' : ''} already exist
                  ({conflicts.join(', ')}) and will be skipped.
                </div>
              )}
            </div>
            <div style={styles.dialogActions}>
              <button
                style={styles.ghostBtn}
                onClick={() => setConfirmOpen(false)}
                disabled={isApplying}
              >
                Cancel
              </button>
              <button
                style={styles.primaryBtn}
                onClick={handleConfirmApply}
                disabled={isApplying}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
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
    gap: '8px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--figma-color-border)'
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '12px',
    padding: '2px 4px'
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--figma-color-text)'
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px'
  },
  templateName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--figma-color-text)',
    marginBottom: '4px'
  },
  templateDesc: {
    fontSize: '12px',
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '12px'
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '6px',
    marginTop: '4px'
  },
  pageList: {
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    padding: '6px 8px',
    backgroundColor: 'var(--figma-color-bg-secondary)',
    marginBottom: '12px'
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
  skipBadge: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '4px',
    backgroundColor: 'var(--figma-color-bg-warning, #FFF3CD)',
    color: 'var(--figma-color-text-warning, #856404)',
    flexShrink: 0
  },
  warning: {
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'var(--figma-color-bg-warning, #FFF3CD)',
    color: 'var(--figma-color-text-warning, #856404)',
    fontSize: '11px',
    marginBottom: '12px'
  },
  error: {
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'var(--figma-color-bg-danger)',
    color: 'var(--figma-color-text-danger)',
    fontSize: '11px',
    marginBottom: '12px'
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px'
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
  applyBtn: {
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
  applyBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  centerContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '12px',
    padding: '32px'
  },
  successIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'var(--figma-color-bg-success, #D4EDDA)',
    color: 'var(--figma-color-text-success, #155724)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 700
  },
  successText: {
    fontSize: '13px',
    color: 'var(--figma-color-text)',
    margin: 0
  },
  primaryBtn: {
    padding: '8px 24px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  dialogOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px'
  },
  dialog: {
    width: '100%',
    maxWidth: '320px',
    borderRadius: '8px',
    backgroundColor: 'var(--figma-color-bg)',
    border: '1px solid var(--figma-color-border)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
    padding: '12px'
  },
  dialogTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--figma-color-text)',
    marginBottom: '6px'
  },
  dialogBody: {
    fontSize: '12px',
    color: 'var(--figma-color-text-secondary)',
    lineHeight: 1.4
  },
  dialogWarning: {
    marginTop: '8px',
    padding: '6px',
    borderRadius: '6px',
    backgroundColor: 'var(--figma-color-bg-warning, #FFF3CD)',
    color: 'var(--figma-color-text-warning, #856404)',
    fontSize: '11px'
  },
  dialogActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    justifyContent: 'flex-end'
  },
  ghostBtn: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    cursor: 'pointer'
  }
}
