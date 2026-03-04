import { h, Fragment } from 'preact'
import { useState } from 'preact/hooks'
import type { OrgUser, Template } from '@shared/types'
import { serializeTemplate } from '@shared/utils'

interface TemplateCardProps {
  template: Template
  currentUser: OrgUser
  onApply: () => void
  onDelete: () => void
}

function relativeTime(date: Date | null): string {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function TemplateCard({ template, currentUser, onApply, onDelete }: TemplateCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isOwner = template.createdBy === currentUser.uid
  const pageCount = template.pages.length
  const sectionCount = template.pages.reduce((sum, p) => sum + p.sections.length, 0)

  function handleExport() {
    const json = serializeTemplate(template)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const safeName =
      template.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') ||
      'template'

    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={styles.card}>
      <div style={styles.body}>
        <div style={styles.name}>{template.name}</div>
        {template.description && (
          <div style={styles.description}>{template.description}</div>
        )}
        <div style={styles.meta}>
          <span>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
          <span style={styles.dot}>·</span>
          <span>{sectionCount} frame{sectionCount !== 1 ? 's' : ''}</span>
          <span style={styles.dot}>·</span>
          <span>{relativeTime(template.updatedAt)}</span>
        </div>
        <div style={styles.creator}>{template.createdByEmail}</div>
      </div>

      <div style={styles.actions}>
        {confirmDelete ? (
          <Fragment>
            <span style={styles.confirmLabel}>Delete?</span>
            <button style={styles.dangerBtn} onClick={onDelete}>Yes</button>
            <button style={styles.ghostBtn} onClick={() => setConfirmDelete(false)}>No</button>
          </Fragment>
        ) : (
          <Fragment>
            <button style={styles.applyBtn} onClick={onApply}>Apply</button>
            <button style={styles.exportBtn} onClick={handleExport}>Export</button>
            {isOwner && (
              <button style={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </Fragment>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, h.JSX.CSSProperties> = {
  card: {
    borderRadius: '8px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    padding: '10px 12px',
    marginBottom: '8px'
  },
  body: {
    marginBottom: '8px'
  },
  name: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--figma-color-text)',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  description: {
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)'
  },
  dot: {
    color: 'var(--figma-color-border)'
  },
  creator: {
    marginTop: '3px',
    fontSize: '10px',
    color: 'var(--figma-color-text-tertiary, var(--figma-color-text-secondary))'
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  confirmLabel: {
    fontSize: '11px',
    color: 'var(--figma-color-text-danger)',
    flex: 1
  },
  applyBtn: {
    flex: 1,
    padding: '5px 8px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  deleteBtn: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  exportBtn: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  dangerBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-danger)',
    color: 'var(--figma-color-text-danger)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  ghostBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    cursor: 'pointer'
  }
}
