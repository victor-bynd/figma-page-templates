import { h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useTemplates } from '../hooks/useTemplates'
import { TemplateCard } from '../components/TemplateCard'
import { deleteTemplate, saveTemplate, saveTemplateGroup } from '@backend/db'
import { sendMessage } from '../App'
import type { OrgUser, Template, TemplateGroup } from '@shared/types'
import type { GroupFilter } from '../components/GroupsSidebar'
import { serializeAccount, validateAccountJSON } from '@shared/utils'
import { pushToast } from '../components/Toast'

interface TemplateListProps {
  currentUser: OrgUser | null
  isLocalMode: boolean
  filterGroupId: GroupFilter
  groups: TemplateGroup[]
  onNewTemplate: () => void
  onApply: (template: Template) => void
  onEdit: (template: Template) => void
  onToggleMode: () => void
  onLogout: () => void
}

export function TemplateList({
  currentUser,
  isLocalMode,
  filterGroupId,
  groups,
  onNewTemplate,
  onApply,
  onEdit,
  onToggleMode,
  onLogout
}: TemplateListProps) {
  const { templates, loading } = useTemplates(
    isLocalMode ? 'local' : 'firestore',
    isLocalMode ? '' : (currentUser?.orgId ?? '')
  )
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

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

  async function handleImportFile(file: File) {
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const account = validateAccountJSON(parsed)
      if (!account) {
        pushToast('Invalid JSON. Please check the file and try again.', 'error')
        return
      }

      const importTemplates = account.templates
      const importGroups = account.groups

      if (importTemplates.length === 0) {
        pushToast('No templates found in this file.', 'error')
        return
      }

      const orderOffset = groups.length > 0
        ? Math.max(...groups.map(g => g.order)) + 1
        : 0

      const groupIdMap = new Map<string, string>()

      if (importGroups.length > 0) {
        if (isLocalMode) {
          const existingIds = new Set(groups.map(g => g.id))
          for (let index = 0; index < importGroups.length; index += 1) {
            const group = importGroups[index]
            let desiredId = group.id
            if (!desiredId || existingIds.has(desiredId)) {
              desiredId = `import_${Date.now()}_${index}`
            }
            existingIds.add(desiredId)
            groupIdMap.set(group.id, desiredId)
            await saveLocalGroupAsync({
              id: desiredId,
              name: group.name,
              order: group.order + orderOffset,
              createdBy: 'local'
            })
          }
        } else {
          if (!currentUser) {
            pushToast('You must be signed in to import templates.', 'error')
            return
          }
          for (const group of importGroups) {
            const newId = await saveTemplateGroup(currentUser.orgId, {
              name: group.name,
              order: group.order + orderOffset,
              createdBy: currentUser.uid
            })
            groupIdMap.set(group.id, newId)
          }
        }
      }

      if (isLocalMode) {
        for (const template of importTemplates) {
          await saveLocalTemplateAsync({
            schemaVersion: template.schemaVersion,
            name: template.name,
            description: template.description ?? '',
            pages: template.pages,
            coverPageIndex: template.coverPageIndex ?? null,
            coverConfig: template.coverConfig ?? null,
            groupId: template.groupId ? (groupIdMap.get(template.groupId) ?? null) : null,
            createdBy: 'local',
            createdByEmail: ''
          })
        }
      } else {
        if (!currentUser) {
          pushToast('You must be signed in to import templates.', 'error')
          return
        }
        for (const template of importTemplates) {
          await saveTemplate(currentUser.orgId, {
            schemaVersion: template.schemaVersion,
            name: template.name,
            description: template.description ?? '',
            pages: template.pages,
            coverPageIndex: template.coverPageIndex ?? null,
            coverConfig: template.coverConfig ?? null,
            groupId: template.groupId ? (groupIdMap.get(template.groupId) ?? null) : null,
            createdBy: currentUser.uid,
            createdByEmail: currentUser.email
          })
        }
      }

      const templateLabel = importTemplates.length === 1 ? 'template' : 'templates'
      pushToast(`Imported ${importTemplates.length} ${templateLabel}.`, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed.'
      pushToast(message, 'error')
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleExportAll() {
    const json = serializeAccount(templates, groups)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const modeLabel = isLocalMode ? 'local' : 'team'
    const a = document.createElement('a')
    a.href = url
    a.download = `templates-${modeLabel}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveLocalTemplateAsync(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage
        if (!msg) return
        if (msg.type === 'LOCAL_TEMPLATE_SAVED') {
          if (msg.template?.name !== template.name) return
          window.removeEventListener('message', handler)
          resolve()
        } else if (msg.type === 'ERROR' && msg.code === 'LOCAL_SAVE_FAILED') {
          window.removeEventListener('message', handler)
          reject(new Error(msg.message ?? 'Failed to import template'))
        }
      }
      window.addEventListener('message', handler)
      sendMessage({ type: 'SAVE_LOCAL_TEMPLATE', template })
    })
  }

  async function saveLocalGroupAsync(group: { id?: string; name: string; order: number; createdBy: string }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage
        if (!msg) return
        if (msg.type === 'LOCAL_GROUPS_RESULT') {
          const hasGroup = group.id
            ? msg.groups.some((g: TemplateGroup) => g.id === group.id) ||
              msg.groups.some((g: TemplateGroup) => g.name === group.name)
            : msg.groups.some((g: TemplateGroup) => g.name === group.name)
          if (!hasGroup) return
          window.removeEventListener('message', handler)
          resolve()
        } else if (msg.type === 'ERROR' && msg.code === 'LOCAL_GROUP_SAVE_FAILED') {
          window.removeEventListener('message', handler)
          reject(new Error(msg.message ?? 'Failed to import group'))
        }
      }
      window.addEventListener('message', handler)
      sendMessage({ type: 'SAVE_LOCAL_GROUP', group })
    })
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Templates</span>
          <button style={styles.modeBadge} onClick={onToggleMode}>
            {isLocalMode ? 'Local' : 'Team'}
          </button>
        </div>
        <div style={styles.headerActions}>
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              style={styles.secondaryBtn}
              onClick={() => setSettingsOpen(v => !v)}
              title="Settings"
            >
              Settings
            </button>
            {settingsOpen && (
              <div style={styles.settingsMenu}>
                <button
                  style={styles.menuItem}
                  onClick={() => { setSettingsOpen(false); handleImportClick() }}
                >
                  Import JSON
                </button>
                <button
                  style={styles.menuItem}
                  onClick={() => { setSettingsOpen(false); handleExportAll() }}
                >
                  Export JSON
                </button>
                {currentUser && (
                  <button
                    style={styles.menuItem}
                    onClick={() => { setSettingsOpen(false); onLogout() }}
                  >
                    Log out
                  </button>
                )}
              </div>
            )}
          </div>
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
              groupBadge={isSearchActive ? (groups.find(g => g.id === t.groupId)?.name ?? null) : null}
              onApply={() => onApply(t)}
              onEdit={() => onEdit(t)}
              onDelete={() => handleDelete(t.id)}
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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '0 0 auto',
    whiteSpace: 'nowrap'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    flexShrink: 0
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--figma-color-text)'
  },
  modeBadge: {
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg-secondary)',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    lineHeight: '14px'
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
  settingsMenu: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 4px)',
    zIndex: 100,
    backgroundColor: 'var(--figma-color-bg)',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '140px',
    paddingTop: '4px',
    paddingBottom: '4px'
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '11px',
    color: 'var(--figma-color-text)'
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
