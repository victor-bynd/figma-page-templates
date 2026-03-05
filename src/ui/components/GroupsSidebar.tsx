import { h } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useSortable } from '@dnd-kit/sortable'
import type { TemplateGroup } from '@shared/types'

export type GroupFilter = string | 'all' | 'ungrouped'

interface GroupsSidebarProps {
  groups: TemplateGroup[]
  selectedId: GroupFilter
  onSelect: (id: GroupFilter) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  width?: number
}

export function GroupsSidebar({
  groups,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  width
}: GroupsSidebarProps) {
  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  function commitCreate() {
    if (committedRef.current) return
    committedRef.current = true
    const raw = createInputRef.current?.value ?? creatingName ?? ''
    const name = raw.trim()
    if (name) onCreate(name)
    setCreatingName(null)
  }

  function commitRename(id: string) {
    const name = renameValue.trim()
    if (name) onRename(id, name)
    setRenamingId(null)
    setRenameValue('')
  }

  function startRename(group: TemplateGroup) {
    setRenamingId(group.id)
    setRenameValue(group.name)
  }

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order)

  return (
    <div
      style={{
        ...styles.sidebar,
        width: width ? `${width}px` : styles.sidebar.width,
        minWidth: width ? `${width}px` : styles.sidebar.minWidth
      }}
    >
      {/* All */}
      <SidebarRow
        label="All"
        isActive={selectedId === 'all'}
        onClick={() => onSelect('all')}
      />

      {/* User groups */}
      {sortedGroups.map(group => (
        <div key={group.id}>
          {renamingId === group.id ? (
            <input
              style={styles.inlineInput}
              value={renameValue}
              maxLength={24}
              autoFocus
              onInput={e => setRenameValue((e.target as HTMLInputElement).value)}
              onBlur={() => commitRename(group.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(group.id)
                if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
              }}
            />
          ) : (
            <SortableGroupRow
              group={group}
              isActive={selectedId === group.id}
              onClick={() => onSelect(group.id)}
              onDoubleClick={() => startRename(group)}
              onDelete={() => onDelete(group.id)}
            />
          )}
        </div>
      ))}

      {/* Inline create input */}
      {creatingName !== null && (
        <input
          ref={createInputRef}
          style={styles.inlineInput}
          placeholder="Group name"
          value={creatingName}
          maxLength={24}
          autoFocus
          onInput={e => setCreatingName((e.target as HTMLInputElement).value)}
          onBlur={commitCreate}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitCreate() }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreatingName(null) }
          }}
        />
      )}

      <div style={styles.divider} />

      {/* Ungrouped */}
      <SidebarRow
        label="Ungrouped"
        isActive={selectedId === 'ungrouped'}
        onClick={() => onSelect('ungrouped')}
      />

      <div style={styles.divider} />

      {/* Add group button */}
      <button
        style={styles.addBtn}
        onClick={() => { committedRef.current = false; setCreatingName('') }}
        title="Create new group"
      >
        +
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface SidebarRowProps {
  label: string
  isActive: boolean
  onClick: () => void
}

function SidebarRow({ label, isActive, onClick }: SidebarRowProps) {
  return (
    <button
      style={{
        ...styles.row,
        ...(isActive ? styles.rowActive : {})
      }}
      onClick={onClick}
      title={label}
    >
      <span style={styles.rowLabel}>{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------

interface SortableGroupRowProps {
  group: TemplateGroup
  isActive: boolean
  onClick: () => void
  onDoubleClick: () => void
  onDelete: () => void
}

function SortableGroupRow({ group, isActive, onClick, onDoubleClick, onDelete }: SortableGroupRowProps) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    over,
    active
  } = useSortable({ id: group.id })

  const isTemplateHovering =
    active !== null &&
    String(active.id).startsWith('template_') &&
    over?.id === group.id

  const transformStyle = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
    : undefined

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (isDragging && menuOpen) setMenuOpen(false)
  }, [isDragging, menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleClose = () => setMenuOpen(false)
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) {
      if (portalRef.current) {
        portalRef.current.remove()
        portalRef.current = null
      }
      if (portalReady) setPortalReady(false)
      return
    }
    if (portalRef.current) return
    const el = document.createElement('div')
    el.style.position = 'fixed'
    el.style.left = '0'
    el.style.top = '0'
    el.style.width = '0'
    el.style.height = '0'
    el.style.zIndex = '9999'
    document.body.appendChild(el)
    portalRef.current = el
    setPortalReady(true)
    return () => {
      el.remove()
      if (portalRef.current === el) portalRef.current = null
    }
  }, [menuOpen])

  const computeMenuPos = (anchor: DOMRect, menuWidth: number, menuHeight: number) => {
    const pad = 8
    let left = anchor.left
    left = Math.min(Math.max(left, pad), window.innerWidth - menuWidth - pad)
    let top = anchor.bottom + 4
    if (top + menuHeight + pad > window.innerHeight) {
      top = anchor.top - menuHeight - 4
    }
    if (top < pad) top = pad
    return { left, top }
  }

  useEffect(() => {
    if (!menuOpen) { setMenuPos(null); return }
    const anchor = buttonRef.current?.getBoundingClientRect()
    const menuRect = menuRef.current?.getBoundingClientRect()
    if (!anchor || !menuRect) return
    const { left, top } = computeMenuPos(anchor, menuRect.width, menuRect.height)
    setMenuPos(prev => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
  }, [menuOpen, portalReady])

  const showEdit = (hovered || menuOpen) && !isDragging

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.sortableWrapper,
        transform: transformStyle,
        transition,
        opacity: isDragging ? 0.4 : 1
      }}
    >
      <div
        style={styles.rowWrapper}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          style={{
            ...styles.row,
            ...styles.groupRow,
            ...(isActive || isTemplateHovering ? styles.rowActive : {}),
            ...(isTemplateHovering ? styles.rowDropTarget : {})
          }}
          onClick={onClick}
          onDblClick={onDoubleClick}
          title={group.name}
        >
          {/* Drag handle */}
          <span
            style={{ ...styles.dragHandle, cursor: isDragging ? 'grabbing' : 'grab' }}
            {...(listeners as h.JSX.HTMLAttributes<HTMLSpanElement>)}
            {...(attributes as h.JSX.HTMLAttributes<HTMLSpanElement>)}
            title="Drag to reorder"
          >
            ⠿
          </span>
          <span style={styles.rowLabel}>{group.name}</span>
        </button>
        {showEdit && (
          <div style={styles.editMenuWrap}>
            <button
              style={styles.editGroupBtn}
              ref={buttonRef}
              onClick={e => {
                e.stopPropagation()
                if (menuOpen) { setMenuOpen(false); return }
                const anchor = buttonRef.current?.getBoundingClientRect()
                const pad = 8
                const widthGuess = 120
                const heightGuess = 72
                if (anchor) {
                  const { left, top } = computeMenuPos(anchor, widthGuess, heightGuess)
                  setMenuPos({ left, top })
                } else {
                  setMenuPos({ left: pad, top: pad })
                }
                setMenuOpen(true)
              }}
              title="Edit group"
            >
              ✎
            </button>
            {menuOpen && portalReady && portalRef.current && createPortal(
              <div
                ref={menuRef}
                style={{
                  ...styles.groupMenu,
                  left: menuPos?.left ?? 0,
                  top: menuPos?.top ?? 0
                }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  style={styles.menuItem}
                  onClick={() => { setMenuOpen(false); onDoubleClick() }}
                >
                  Rename
                </button>
                <button
                  style={styles.menuDanger}
                  onClick={() => { setMenuOpen(false); onDelete() }}
                >
                  Delete
                </button>
              </div>,
              portalRef.current
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const styles: Record<string, h.JSX.CSSProperties> = {
  sidebar: {
    width: '90px',
    minWidth: '90px',
    height: '100%',
    borderRight: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    flexShrink: 0
  },
  sortableWrapper: {
    position: 'relative'
  },
  rowWrapper: {
    position: 'relative'
  },
  row: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 6px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '11px',
    color: 'var(--figma-color-text)',
    borderRadius: 0,
    gap: '4px'
  },
  groupRow: {
    paddingRight: '20px'
  },
  rowActive: {
    backgroundColor: 'var(--figma-color-bg-brand-tertiary, rgba(0,90,255,0.08))',
    color: 'var(--figma-color-text-brand, var(--figma-color-bg-brand))',
    fontWeight: 600
  },
  rowDropTarget: {
    outline: '2px solid var(--figma-color-bg-brand)',
    outlineOffset: '-2px'
  },
  rowLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1
  },
  dragHandle: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)',
    flexShrink: 0,
    userSelect: 'none',
    lineHeight: 1
  },
  editMenuWrap: {
    position: 'absolute',
    right: '4px',
    top: '50%',
    transform: 'translateY(-50%)'
  },
  editGroupBtn: {
    fontSize: '10px',
    color: 'var(--figma-color-text-secondary)',
    border: 'none',
    background: 'none',
    padding: '2px',
    borderRadius: '2px',
    cursor: 'pointer',
    lineHeight: 1
  },
  groupMenu: {
    position: 'fixed',
    backgroundColor: 'var(--figma-color-bg)',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '6px',
    minWidth: '110px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    zIndex: 9999,
    pointerEvents: 'auto'
  },
  menuItem: {
    border: 'none',
    background: 'none',
    padding: '4px 6px',
    textAlign: 'left',
    fontSize: '11px',
    color: 'var(--figma-color-text)',
    cursor: 'pointer'
  },
  menuDanger: {
    border: 'none',
    background: 'none',
    padding: '4px 6px',
    textAlign: 'left',
    fontSize: '11px',
    color: 'var(--figma-color-text-danger)',
    cursor: 'pointer'
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--figma-color-border)',
    margin: '4px 0'
  },
  addBtn: {
    width: '100%',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '6px 8px',
    fontSize: '14px',
    color: 'var(--figma-color-text-secondary)',
    textAlign: 'center'
  },
  inlineInput: {
    width: '100%',
    padding: '5px 8px',
    border: 'none',
    borderBottom: '1px solid var(--figma-color-bg-brand)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    outline: 'none',
    boxSizing: 'border-box'
  }
}
