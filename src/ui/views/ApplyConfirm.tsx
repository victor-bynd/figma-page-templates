import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { sendMessage } from '../App'
import type { TemplatePage, Template } from '@shared/types'

export type ApplyStatus = 'idle' | 'applying' | 'success' | 'error'

interface PageState {
  name: string
  enabled: boolean
}

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

function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        width: '26px',
        height: '14px',
        borderRadius: '7px',
        backgroundColor: checked
          ? 'var(--figma-color-bg-brand)'
          : 'var(--figma-color-border)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        transition: 'background-color 0.15s'
      }}
      onClick={disabled ? undefined : onChange}
    >
      <div
        style={{
          position: 'absolute',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: 'white',
          top: '2px',
          left: checked ? '14px' : '2px',
          transition: 'left 0.15s'
        }}
      />
    </div>
  )
}

export function ApplyConfirm({
  template,
  currentPages,
  status,
  error,
  onBack,
  onSetupCover
}: ApplyConfirmProps) {
  const nonCoverPages = template.pages.filter(p => p.name !== 'Cover')

  const [pageStates, setPageStates] = useState<PageState[]>(() =>
    nonCoverPages.map(p => ({ name: p.name, enabled: true }))
  )
  const [replaceAll, setReplaceAll] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [localPending, setLocalPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const existingNames = new Set((currentPages ?? []).map(p => p.name))

  // Conflicts only matter when replaceAll is off
  const conflicts = replaceAll
    ? []
    : pageStates
        .filter(s => s.enabled && existingNames.has(s.name))
        .map(s => s.name)

  const isApplying = localPending || status === 'applying'

  useEffect(() => {
    if (status === 'error' || status === 'success') {
      setLocalPending(false)
      setConfirmOpen(false)
    }
  }, [status])

  function updatePageName(index: number, name: string) {
    setPageStates(prev => prev.map((s, i) => (i === index ? { ...s, name } : s)))
  }

  function togglePage(index: number) {
    setPageStates(prev => prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)))
  }

  function handleRequestApply() {
    if (isApplying) return
    setConfirmOpen(true)
  }

  function handleConfirmApply() {
    if (isApplying) return
    setLocalPending(true)
    const pagesToApply: TemplatePage[] = []
    nonCoverPages.forEach((page, i) => {
      if (pageStates[i].enabled) {
        pagesToApply.push({ ...page, name: pageStates[i].name })
      }
    })

    let coverInsertIndex: number | null = null
    let nonCoverIndex = 0
    let enabledBeforeCover = 0

    for (const page of template.pages) {
      if (page.name === 'Cover') {
        coverInsertIndex = enabledBeforeCover
        break
      }

      const state = pageStates[nonCoverIndex]
      if (state?.enabled) enabledBeforeCover += 1
      nonCoverIndex += 1
    }

    sendMessage({
      type: 'APPLY_TEMPLATE',
      pages: pagesToApply,
      replaceAll,
      coverInsertIndex
    })
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.centerContent}>
          <div style={styles.successIcon}>✓</div>
          <p style={styles.successText}>Template applied successfully!</p>
          {onSetupCover && (
            <button style={styles.primaryBtn} onClick={onSetupCover}>
              Set up Cover
            </button>
          )}
          <button
            style={onSetupCover ? styles.ghostBtn : styles.primaryBtn}
            onClick={onBack}
          >
            Done
          </button>
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
          {nonCoverPages.map((page, i) => {
            const state = pageStates[i]
            const isConflict = !replaceAll && existingNames.has(state.name)
            return (
              <div
                key={i}
                style={{
                  ...styles.pageRow,
                  opacity: state.enabled ? 1 : 0.4
                }}
              >
                <div style={styles.pageMain}>
                  <Toggle
                    checked={state.enabled}
                    onChange={() => togglePage(i)}
                    disabled={isApplying}
                  />
                  <span style={styles.pageIcon}>▤</span>
                  <input
                    style={{
                      ...styles.nameInput,
                      textDecoration: !state.enabled ? 'line-through' : 'none',
                      borderBottomColor:
                        focusedIndex === i
                          ? 'var(--figma-color-border-strong)'
                          : 'transparent'
                    }}
                    value={state.name}
                    onInput={e =>
                      updatePageName(i, (e.target as HTMLInputElement).value)
                    }
                    onFocus={() => setFocusedIndex(i)}
                    onBlur={() => setFocusedIndex(null)}
                    disabled={isApplying || !state.enabled}
                  />
                </div>
                <div style={styles.pageMeta}>
                  <span style={styles.sectionCount}>
                    {page.sections.length} frame
                    {page.sections.length !== 1 ? 's' : ''}
                  </span>
                  {state.enabled && isConflict && (
                    <span style={styles.skipBadge}>exists</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <div style={styles.warning}>
            <strong>Note:</strong> {conflicts.length} page
            {conflicts.length !== 1 ? 's' : ''} already exist (
            {conflicts.join(', ')}) and will be skipped.
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div style={styles.error}>{error}</div>
        )}

        {/* Replace all toggle */}
        <div style={styles.replaceAllRow}>
          <div style={styles.replaceAllText}>
            <span style={styles.replaceAllLabel}>Replace all existing pages</span>
            <span style={styles.replaceAllDesc}>
              Removes current pages before applying
            </span>
          </div>
          <Toggle
            checked={replaceAll}
            onChange={() => setReplaceAll(v => !v)}
            disabled={isApplying}
          />
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onBack} disabled={isApplying}>
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
              {replaceAll
                ? 'This will remove all existing pages and replace them with the template pages.'
                : 'This will create pages and frames in your current file.'}
              {!replaceAll && conflicts.length > 0 && (
                <div style={styles.dialogWarning}>
                  {conflicts.length} page{conflicts.length !== 1 ? 's' : ''}{' '}
                  already exist ({conflicts.join(', ')}) and will be skipped.
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
    flexDirection: 'column',
    gap: '4px',
    padding: '3px 0',
    fontSize: '12px',
    color: 'var(--figma-color-text)'
  },
  pageMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0
  },
  pageIcon: {
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    flexShrink: 0
  },
  nameInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid transparent',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    padding: '1px 2px',
    outline: 'none',
    minWidth: 0
  },
  pageMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
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
    backgroundColor: 'rgba(251, 146, 60, 0.15)',
    color: '#FB923C',
    border: '1px solid rgba(251, 146, 60, 0.3)',
    flexShrink: 0
  },
  warning: {
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
    color: '#FB923C',
    border: '1px solid rgba(251, 146, 60, 0.25)',
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
  replaceAllRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderTop: '1px solid var(--figma-color-border)',
    marginBottom: '8px'
  },
  replaceAllText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  replaceAllLabel: {
    fontSize: '12px',
    color: 'var(--figma-color-text)',
    fontWeight: 500
  },
  replaceAllDesc: {
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)'
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '4px'
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
    maxWidth: 'min(420px, 100%)',
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
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
    color: '#FB923C',
    border: '1px solid rgba(251, 146, 60, 0.25)',
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
