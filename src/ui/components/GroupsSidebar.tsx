import { h } from 'preact'
import { useRef, useState } from 'preact/hooks'
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

  function commitCreate() {
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
        onClick={() => setCreatingName('')}
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
      <button
        style={{
          ...styles.row,
          ...(isActive || isTemplateHovering ? styles.rowActive : {}),
          ...(isTemplateHovering ? styles.rowDropTarget : {})
        }}
        onClick={onClick}
        onDblClick={onDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
        {hovered && !isDragging && (
          <span
            style={styles.deleteGroupBtn}
            onClick={e => { e.stopPropagation(); onDelete() }}
            title="Delete group"
          >
            ✕
          </span>
        )}
      </button>
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
  deleteGroupBtn: {
    fontSize: '9px',
    color: 'var(--figma-color-text-secondary)',
    flexShrink: 0,
    lineHeight: 1,
    padding: '1px 2px',
    borderRadius: '2px',
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
