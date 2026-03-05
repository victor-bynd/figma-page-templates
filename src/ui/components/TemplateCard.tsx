import { h, Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useDraggable } from '@dnd-kit/core'
import type { OrgUser, Template, TemplateGroup } from '@shared/types'
import { serializeTemplate } from '@shared/utils'

interface TemplateCardProps {
  template: Template
  currentUser: OrgUser | null
  isLocalMode?: boolean
  groups: TemplateGroup[]
  groupBadge: string | null
  onApply: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onMoveToGroup: (groupId: string | null) => void
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

export function TemplateCard({
  template,
  currentUser,
  isLocalMode,
  groups,
  groupBadge,
  onApply,
  onDelete,
  onRename,
  onMoveToGroup
}: TemplateCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `template_${template.id}`
  })

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])
  const isOwner = isLocalMode || (currentUser !== null && template.createdBy === currentUser.uid)
  const pageCount = template.pages.length
  const sectionCount = template.pages.reduce((sum, p) => sum + p.sections.length, 0)

  function startRename() {
    if (!isOwner) return
    setRenaming(true)
    setRenameValue(template.name)
  }

  function commitRename() {
    const name = renameValue.trim()
    if (name && name !== template.name) {
      onRename(name)
    }
    setRenaming(false)
    setRenameValue('')
  }

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

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.card,
        ...dragStyle,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : undefined,
        position: 'relative'
      }}
      {...(listeners as h.JSX.HTMLAttributes<HTMLDivElement>)}
      {...(attributes as h.JSX.HTMLAttributes<HTMLDivElement>)}
    >
      <div style={styles.body}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', minWidth: 0 }}>
          {renaming ? (
            <input
              style={styles.renameInput}
              value={renameValue}
              maxLength={60}
              autoFocus
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onInput={e => setRenameValue((e.target as HTMLInputElement).value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setRenaming(false); setRenameValue('') }
              }}
            />
          ) : (
            <div style={styles.name} onDblClick={startRename}>{template.name}</div>
          )}
          {/* Overflow menu */}
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              style={styles.kebabBtn}
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              title="More options"
            >
              ⋯
            </button>
            {menuOpen && (
              <div style={styles.menu}>
                {isOwner && (
                  <button
                    style={styles.menuItem}
                    onClick={() => { setMenuOpen(false); startRename() }}
                  >
                    Rename
                  </button>
                )}
                <div style={styles.menuLabel}>Move to group</div>
                <button
                  style={styles.menuItem}
                  onClick={() => { onMoveToGroup(null); setMenuOpen(false) }}
                >
                  No group
                </button>
                {groups.map(g => (
                  <button
                    key={g.id}
                    style={{
                      ...styles.menuItem,
                      ...(template.groupId === g.id ? styles.menuItemActive : {})
                    }}
                    onClick={() => { onMoveToGroup(g.id); setMenuOpen(false) }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {template.description && (
          <div style={styles.description}>{template.description}</div>
        )}
        <div style={styles.meta}>
          <span>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
          <span style={styles.dot}>·</span>
          <span>{sectionCount} frame{sectionCount !== 1 ? 's' : ''}</span>
          <span style={styles.dot}>·</span>
          <span>{relativeTime(template.updatedAt)}</span>
          {groupBadge && (
            <Fragment>
              <span style={styles.dot}>·</span>
              <span style={styles.groupBadge}>{groupBadge}</span>
            </Fragment>
          )}
        </div>
        {!isLocalMode && <div style={styles.creator}>{template.createdByEmail}</div>}
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
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  renameInput: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--figma-color-text)',
    padding: '2px 4px',
    borderRadius: '4px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    width: '100%',
    minWidth: 0
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
    flexWrap: 'wrap',
    rowGap: '2px',
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
    gap: '6px',
    flexWrap: 'wrap'
  },
  confirmLabel: {
    fontSize: '11px',
    color: 'var(--figma-color-text-danger)',
    flex: 1
  },
  applyBtn: {
    flex: '2 1 120px',
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
    flex: '1 1 90px',
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  exportBtn: {
    flex: '1 1 90px',
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  dangerBtn: {
    flex: '1 1 90px',
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
    flex: '1 1 90px',
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    cursor: 'pointer'
  },
  kebabBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '14px',
    padding: '0 2px',
    lineHeight: 1,
    letterSpacing: '1px'
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 100,
    backgroundColor: 'var(--figma-color-bg)',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '120px',
    paddingTop: '4px',
    paddingBottom: '4px'
  },
  menuLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--figma-color-text-secondary)',
    padding: '4px 10px 2px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '5px 10px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '11px',
    color: 'var(--figma-color-text)'
  },
  menuItemActive: {
    fontWeight: 600,
    color: 'var(--figma-color-text-brand, var(--figma-color-bg-brand))'
  },
  groupBadge: {
    fontSize: '10px',
    color: 'var(--figma-color-text-brand, var(--figma-color-bg-brand))',
    backgroundColor: 'var(--figma-color-bg-brand-tertiary, rgba(0,90,255,0.08))',
    borderRadius: '3px',
    padding: '1px 4px'
  }
}
