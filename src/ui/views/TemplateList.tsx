import { h } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { useTemplates } from '../hooks/useTemplates'
import { TemplateCard } from '../components/TemplateCard'
import { deleteTemplate, saveTemplate, updateTemplateName } from '@backend/db'
import { sendMessage } from '../App'
import type { OrgUser, Template, TemplateGroup } from '@shared/types'
import type { GroupFilter } from '../components/GroupsSidebar'
import { validateTemplateJSON } from '@shared/utils'
import { pushToast } from '../components/Toast'

interface TemplateListProps {
  currentUser: OrgUser | null
  isLocalMode: boolean
  filterGroupId: GroupFilter
  groups: TemplateGroup[]
  onNewTemplate: () => void
  onApply: (template: Template) => void
  onMoveToGroup: (templateId: string, groupId: string | null) => void
}

export function TemplateList({
  currentUser,
  isLocalMode,
  filterGroupId,
  groups,
  onNewTemplate,
  onApply,
  onMoveToGroup
}: TemplateListProps) {
  const { templates, loading } = useTemplates(
    isLocalMode ? 'local' : 'firestore',
    isLocalMode ? '' : (currentUser?.orgId ?? '')
  )
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isSearchActive = search.trim().length > 0

  const filtered = (() => {
    // Search spans all groups; ignore filterGroupId when searching
    if (isSearchActive) {
      return templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    }
    if (filterGroupId === 'all') return templates
    if (filterGroupId === 'ungrouped') return templates.filter(t => !t.groupId)
    return templates.filter(t => t.groupId === filterGroupId)
  })()

  async function handleDelete(templateId: string) {
    if (isLocalMode) {
      sendMessage({ type: 'DELETE_LOCAL_TEMPLATE', id: templateId })
      return
    }
    try {
      await deleteTemplate(currentUser!.orgId, templateId)
    } catch (err) {
      console.error('[TemplateList] delete failed', err)
    }
  }

  async function handleRename(templateId: string, name: string) {
    if (isLocalMode) {
      sendMessage({ type: 'UPDATE_LOCAL_TEMPLATE', id: templateId, name })
      return
    }
    try {
      await updateTemplateName(currentUser!.orgId, templateId, name)
    } catch (err) {
      console.error('[TemplateList] rename failed', err)
    }
  }

  async function handleImportFile(file: File) {
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const template = validateTemplateJSON(parsed)
      if (!template) {
        pushToast('Invalid template JSON. Please check the file and try again.', 'error')
        return
      }

      if (isLocalMode) {
        await new Promise<void>((resolve, reject) => {
          const handler = (event: MessageEvent) => {
            const msg = event.data?.pluginMessage
            if (!msg) return
            if (msg.type === 'LOCAL_TEMPLATE_SAVED') {
              window.removeEventListener('message', handler)
              resolve()
            } else if (msg.type === 'ERROR' && msg.code === 'LOCAL_SAVE_FAILED') {
              window.removeEventListener('message', handler)
              reject(new Error(msg.message ?? 'Failed to import template'))
            }
          }
          window.addEventListener('message', handler)
          sendMessage({
            type: 'SAVE_LOCAL_TEMPLATE',
            template: {
              schemaVersion: template.schemaVersion,
              name: template.name,
              description: template.description ?? '',
              pages: template.pages,
              coverConfig: template.coverConfig ?? null,
              createdBy: 'local',
              createdByEmail: ''
            }
          })
        })
      } else {
        await saveTemplate(currentUser!.orgId, {
          schemaVersion: template.schemaVersion,
          name: template.name,
          description: template.description ?? '',
          pages: template.pages,
          coverConfig: template.coverConfig ?? null,
          createdBy: currentUser!.uid,
          createdByEmail: currentUser!.email
        })
      }
      pushToast('Template imported successfully.', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed.'
      pushToast(message, 'error')
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Templates</span>
        <div style={styles.headerActions}>
          <button style={styles.secondaryBtn} onClick={handleImportClick}>
            Import JSON
          </button>
          <button style={styles.newBtn} onClick={onNewTemplate}>+ New</button>
        </div>
      </div>

      {/* Search */}
      <div style={styles.searchRow}>
        <input
          style={styles.search}
          type="text"
          placeholder="Search…"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* List */}
      <div style={styles.list}>
        {loading && templates.length === 0 ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState hasSearch={search.length > 0} onNew={onNewTemplate} />
        ) : (
          filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              currentUser={currentUser}
              isLocalMode={isLocalMode}
              groups={groups}
              groupBadge={isSearchActive ? (groups.find(g => g.id === t.groupId)?.name ?? null) : null}
              onApply={() => onApply(t)}
              onDelete={() => handleDelete(t.id)}
              onRename={(name) => handleRename(t.id, name)}
              onMoveToGroup={(groupId) => onMoveToGroup(t.id, groupId)}
            />
          ))
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            handleImportFile(file)
          }
          ;(e.target as HTMLInputElement).value = ''
        }}
      />
    </div>
  )
}

function SkeletonList() {
  return (
    <div>
      {[85, 65, 75].map((w, i) => (
        <div key={i} style={styles.skeletonCard}>
          <div style={{ ...styles.skeletonLine, width: `${w}%` }} />
          <div style={{ ...styles.skeletonLine, width: '50%', opacity: 0.4 }} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ hasSearch, onNew }: { hasSearch: boolean; onNew: () => void }) {
  if (hasSearch) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>No templates match your search.</p>
      </div>
    )
  }
  return (
    <div style={styles.empty}>
      <p style={styles.emptyText}>No templates saved yet.</p>
      <button style={styles.emptyBtn} onClick={onNew}>
        Save your first template
      </button>
    </div>
  )
}

const styles: Record<string, h.JSX.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    height: '100%',
    backgroundColor: 'var(--figma-color-bg)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--figma-color-border)'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--figma-color-text)',
    flex: 1,
    minWidth: 0
  },
  newBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  searchRow: {
    padding: '10px 16px 6px'
  },
  search: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    boxSizing: 'border-box'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 16px 16px'
  },
  skeletonCard: {
    borderRadius: '8px',
    border: '1px solid var(--figma-color-border)',
    padding: '10px 12px',
    marginBottom: '8px'
  },
  skeletonLine: {
    height: '10px',
    borderRadius: '4px',
    backgroundColor: 'var(--figma-color-border)',
    marginBottom: '6px'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '32px',
    gap: '10px'
  },
  emptyText: {
    fontSize: '12px',
    color: 'var(--figma-color-text-secondary)',
    margin: 0
  },
  emptyBtn: {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--figma-color-bg-brand)',
    color: 'var(--figma-color-text-onbrand)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer'
  }
}
