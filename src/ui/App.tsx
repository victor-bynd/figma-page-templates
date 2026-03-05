import { render } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, cacheTokenLocal, getOrgIdFromClaims, restoreSessionFromRefreshToken } from '@backend/auth'
import { bootstrapOrg, upsertUser } from '@backend/db'
import { AuthView } from './views/AuthView'
import { SaveDialog } from './views/SaveDialog'
import { TemplateList } from './views/TemplateList'
import { ApplyConfirm } from './views/ApplyConfirm'
import { CoverSetup } from './views/CoverSetup'
import type { ApplyStatus } from './views/ApplyConfirm'
import type { PluginMessage, UIMessage } from '@shared/messages'
import type { OrgUser, Template, TemplatePage } from '@shared/types'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { useMessages } from './hooks/useMessages'
import { GroupsSidebar } from './components/GroupsSidebar'
import { useGroups } from './hooks/useGroups'
import {
  saveTemplateGroup,
  updateTemplateGroup,
  deleteTemplateGroup,
  reorderTemplateGroups,
  moveTemplateToGroupFirestore
} from '@backend/db'
import type { GroupFilter } from './components/GroupsSidebar'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

/** Send a typed message from the UI iframe to the plugin main thread. */
export function sendMessage(message: PluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

type AppView = 'loading' | 'auth' | 'template-list' | 'save-dialog' | 'apply-confirm' | 'cover-setup'

const MIN_UI_WIDTH = 320
const MIN_UI_HEIGHT = 360
const RESIZE_HANDLE_SIZE = 16
const SIDEBAR_MIN_WIDTH = 72
const SIDEBAR_MAX_WIDTH = 220
const SIDEBAR_DEFAULT_WIDTH = 90
const SIDEBAR_MIN_CONTENT_WIDTH = 180

function App() {
  const [view, setView] = useState<AppView>('loading')
  const [currentUser, setCurrentUser] = useState<OrgUser | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  // Ref so the Firebase auth callback can read the live value without being recreated.
  const isLocalModeRef = useRef(false)
  const [capturedPages, setCapturedPages] = useState<TemplatePage[] | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [selectedComponentKey, setSelectedComponentKey] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<GroupFilter>('all')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const rehydratingRef = useRef(true)
  const rehydrationAttemptedRef = useRef(false)

  const groupMode = isLocalMode ? 'local' : 'firestore'
  const groupOrgId = isLocalMode ? '' : (currentUser?.orgId ?? '')
  const { groups } = useGroups(groupMode, groupOrgId)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const resizeStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0
  })
  const resizeRafRef = useRef<number | null>(null)
  const pendingSizeRef = useRef<{ width: number; height: number } | null>(null)
  const lastSizeRef = useRef<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  })

  const sidebarResizeRef = useRef({
    active: false,
    startX: 0,
    startWidth: SIDEBAR_DEFAULT_WIDTH
  })
  const sidebarRafRef = useRef<number | null>(null)
  const pendingSidebarWidthRef = useRef<number | null>(null)

  const scheduleResize = useCallback((width: number, height: number) => {
    const clampedWidth = Math.max(MIN_UI_WIDTH, Math.round(width))
    const clampedHeight = Math.max(MIN_UI_HEIGHT, Math.round(height))
    pendingSizeRef.current = { width: clampedWidth, height: clampedHeight }

    if (resizeRafRef.current !== null) return
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null
      const pending = pendingSizeRef.current
      if (!pending) return
      pendingSizeRef.current = null
      const last = lastSizeRef.current
      if (pending.width === last.width && pending.height === last.height) return
      lastSizeRef.current = pending
      sendMessage({ type: 'RESIZE_UI', width: pending.width, height: pending.height })
    })
  }, [])

  const handleResizeStart = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    resizeStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: window.innerWidth,
      startHeight: window.innerHeight
    }
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const state = resizeStateRef.current
      if (!state.active) return
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      scheduleResize(state.startWidth + dx, state.startHeight + dy)
      event.preventDefault()
      event.stopPropagation()
    },
    [scheduleResize]
  )

  const handleResizeEnd = useCallback((event: PointerEvent) => {
    const state = resizeStateRef.current
    if (!state.active) return
    state.active = false
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const clampSidebarWidth = useCallback((width: number) => {
    const maxByWindow = Math.max(
      SIDEBAR_MIN_WIDTH,
      window.innerWidth - SIDEBAR_MIN_CONTENT_WIDTH
    )
    const max = Math.min(SIDEBAR_MAX_WIDTH, maxByWindow)
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(max, Math.round(width)))
  }, [])

  const scheduleSidebarWidth = useCallback(
    (width: number) => {
      const next = clampSidebarWidth(width)
      pendingSidebarWidthRef.current = next
      if (sidebarRafRef.current !== null) return
      sidebarRafRef.current = requestAnimationFrame(() => {
        sidebarRafRef.current = null
        const pending = pendingSidebarWidthRef.current
        if (pending === null) return
        pendingSidebarWidthRef.current = null
        setSidebarWidth(pending)
      })
    },
    [clampSidebarWidth]
  )

  const handleSidebarResizeStart = useCallback(
    (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
      sidebarResizeRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: sidebarWidth
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [sidebarWidth]
  )

  const handleSidebarResizeMove = useCallback(
    (event: PointerEvent) => {
      const state = sidebarResizeRef.current
      if (!state.active) return
      const dx = event.clientX - state.startX
      scheduleSidebarWidth(state.startWidth + dx)
      event.preventDefault()
      event.stopPropagation()
    },
    [scheduleSidebarWidth]
  )

  const handleSidebarResizeEnd = useCallback((event: PointerEvent) => {
    const state = sidebarResizeRef.current
    if (!state.active) return
    state.active = false
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    event.preventDefault()
    event.stopPropagation()
  }, [])

  useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth(prev => clampSidebarWidth(prev))
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [clampSidebarWidth])

  const handleMessage = useCallback((message: UIMessage) => {
    switch (message.type) {
      case 'AUTH_TOKEN_RESULT':
        // Token check from plugin storage is informational only —
        // Firebase's onAuthStateChanged below is the source of truth.
        break
      case 'OAUTH_TOKENS_RESULT':
        // Legacy — kept for backwards compat but no longer used for rehydration.
        break
      case 'REFRESH_TOKEN_RESULT':
        if (rehydrationAttemptedRef.current) break
        rehydrationAttemptedRef.current = true
        if (message.refreshToken && !isLocalModeRef.current) {
          void (async () => {
            try {
              await restoreSessionFromRefreshToken(message.refreshToken!)
              // onAuthStateChanged will handle setting the user & view.
            } catch (err) {
              console.warn('[Auth] Session restore failed:', err)
              if (!isLocalModeRef.current) {
                setCurrentUser(null)
                setView('auth')
              }
            } finally {
              rehydratingRef.current = false
            }
          })()
        } else {
          rehydratingRef.current = false
          if (!isLocalModeRef.current) {
            setCurrentUser(null)
            setView('auth')
          }
        }
        break
      case 'STRUCTURE_CAPTURED':
        setCapturedPages(message.pages)
        break
      case 'TEMPLATE_APPLIED':
        setApplyStatus('success')
        break
      case 'COVER_PLACED':
        console.log('[UI] COVER_PLACED')
        break
      case 'TEXT_LAYERS_RESULT':
        console.log('[UI] TEXT_LAYERS_RESULT', message.layers)
        break
      case 'PAT_RESULT':
        // Handled locally by CoverSetup's own listener
        break
      case 'LOCAL_TEMPLATES_RESULT':
        // Handled by useTemplates hook via window.addEventListener
        break
      case 'LOCAL_TEMPLATE_SAVED':
        // Handled by SaveDialog's one-shot listener
        break
      case 'LOCAL_GROUPS_RESULT':
        // Handled by useGroups hook via window.addEventListener
        break
      case 'ERROR':
        if (message.code === 'APPLY_FAILED') {
          setApplyStatus('error')
          setApplyError(message.message)
        } else {
          console.error('[UI] ERROR', message.code, message.message)
        }
        break
      default: {
        const exhaustive: never = message
        console.warn('[UI] Unknown message type:', exhaustive)
      }
    }
  }, [])

  // Listen for messages from the plugin main thread.
  useMessages(handleMessage)

  // Keep ref in sync so the auth callback can read the live isLocalMode value.
  useEffect(() => {
    isLocalModeRef.current = isLocalMode
  }, [isLocalMode])

  // Firebase auth state is the source of truth for sign-in status.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      // If the user entered local mode, don't let Firebase auth state override it.
      if (isLocalModeRef.current) return
      if (firebaseUser) {
        const email = firebaseUser.email ?? ''
        const domain = email.split('@')[1] ?? ''
        const orgId = await getOrgIdFromClaims(firebaseUser)
        const user: OrgUser = {
          uid: firebaseUser.uid,
          email,
          orgId,
          displayName: firebaseUser.displayName
        }

        await upsertUser(user)
        await bootstrapOrg(orgId, domain)
        const cachedAt = Date.now()
        const token = await firebaseUser.getIdToken()
        cacheTokenLocal(token, cachedAt)
        sendMessage({ type: 'CACHE_AUTH_TOKEN', token, cachedAt })

        // Persist the refresh token so the session survives plugin restarts.
        if (firebaseUser.refreshToken) {
          sendMessage({ type: 'CACHE_REFRESH_TOKEN', refreshToken: firebaseUser.refreshToken })
        }

        setCurrentUser(user)
        setView('template-list')
      } else {
        if (rehydratingRef.current) {
          setView('loading')
          return
        }
        setCurrentUser(null)
        setView('auth')
      }
    })
    return () => unsubscribe()
  }, [])

  let content: h.JSX.Element

  if (view === 'loading') {
    content = <LoadingView />
  } else if (view === 'auth') {
    content = (
      <AuthView
        onSignedIn={user => {
          setCurrentUser(user)
          setView('template-list')
        }}
        onSkipSignIn={() => {
          setIsLocalMode(true)
          setView('template-list')
        }}
      />
    )
  } else if (view === 'save-dialog') {
    content = (
      <SaveDialog
        currentUser={currentUser}
        isLocalMode={isLocalMode}
        groups={groups}
        onSaved={(_id) => {
          setView('template-list')
        }}
        onCancel={() => {
          setView('template-list')
        }}
      />
    )
  } else if (view === 'apply-confirm') {
    content = (
      <ApplyConfirm
        template={selectedTemplate!}
        currentPages={capturedPages}
        status={applyStatus}
        error={applyError}
        onBack={() => {
          setApplyStatus('idle')
          setApplyError(null)
          setSelectedTemplate(null)
          setCapturedPages(null)
          setView('template-list')
        }}
        onSetupCover={() => {
          setView('cover-setup')
        }}
      />
    )
  } else if (view === 'cover-setup') {
    content = (
      <CoverSetup
        preloadedLibrary={selectedTemplate?.coverConfig?.library ?? null}
        onComponentSelected={(componentKey) => {
          setSelectedComponentKey(componentKey)
          setView('template-list')
        }}
        onSkip={() => {
          setSelectedComponentKey(null)
          setView('template-list')
        }}
        onBack={() => {
          setView('template-list')
        }}
      />
    )
  } else {
    // Group CRUD handlers
    const handleCreateGroup = async (name: string) => {
      if (isLocalMode) {
        const nextOrder = groups.length
        sendMessage({ type: 'SAVE_LOCAL_GROUP', group: { name, order: nextOrder, createdBy: 'local' } })
      } else {
        await saveTemplateGroup(currentUser!.orgId, { name, order: groups.length, createdBy: currentUser!.uid })
      }
    }

    const handleRenameGroup = async (id: string, name: string) => {
      if (isLocalMode) {
        sendMessage({ type: 'UPDATE_LOCAL_GROUP', id, name })
      } else {
        await updateTemplateGroup(currentUser!.orgId, id, name)
      }
    }

    const handleDeleteGroup = async (id: string) => {
      if (isLocalMode) {
        sendMessage({ type: 'DELETE_LOCAL_GROUP', id })
      } else {
        await deleteTemplateGroup(currentUser!.orgId, id)
      }
      // If the deleted group was selected, fall back to "all"
      if (selectedGroupId === id) setSelectedGroupId('all')
    }

    const handleReorderGroups = async (orderedIds: string[]) => {
      if (isLocalMode) {
        sendMessage({ type: 'REORDER_LOCAL_GROUPS', orderedIds })
      } else {
        await reorderTemplateGroups(
          currentUser!.orgId,
          orderedIds.map((id, order) => ({ id, order }))
        )
      }
    }

    const handleMoveTemplateToGroup = async (templateId: string, groupId: string | null) => {
      if (isLocalMode) {
        sendMessage({ type: 'MOVE_TEMPLATE_TO_GROUP', templateId, groupId })
      } else {
        await moveTemplateToGroupFirestore(currentUser!.orgId, templateId, groupId)
      }
    }

    // DnD handler for group reorder + template → group drop
    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)

      if (activeId.startsWith('template_')) {
        // Template dropped onto a group row
        const templateId = activeId.slice('template_'.length)
        handleMoveTemplateToGroup(templateId, overId)
      } else {
        // Group reorder
        const sortedGroups = [...groups].sort((a, b) => a.order - b.order)
        const oldIndex = sortedGroups.findIndex(g => g.id === activeId)
        const newIndex = sortedGroups.findIndex(g => g.id === overId)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrderedIds = arrayMove(sortedGroups.map(g => g.id), oldIndex, newIndex)
          handleReorderGroups(newOrderedIds)
        }
      }
    }

    const sortedGroupIds = [...groups].sort((a, b) => a.order - b.order).map(g => g.id)

    content = (
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedGroupIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', minWidth: 0 }}>
            <GroupsSidebar
              groups={groups}
              selectedId={selectedGroupId}
              onSelect={setSelectedGroupId}
              onCreate={handleCreateGroup}
              onRename={handleRenameGroup}
              onDelete={handleDeleteGroup}
              onReorder={handleReorderGroups}
              width={sidebarWidth}
            />
            <div
              style={{
                width: '6px',
                cursor: 'col-resize',
                flexShrink: 0,
                background: 'linear-gradient(90deg, transparent 0%, var(--figma-color-border) 50%, transparent 100%)',
                opacity: 0.6,
                touchAction: 'none'
              }}
              onPointerDown={handleSidebarResizeStart}
              onPointerMove={handleSidebarResizeMove}
              onPointerUp={handleSidebarResizeEnd}
              onPointerCancel={handleSidebarResizeEnd}
              aria-hidden="true"
            />
            <TemplateList
              currentUser={currentUser}
              isLocalMode={isLocalMode}
              filterGroupId={selectedGroupId}
              groups={groups}
              onNewTemplate={() => {
                setCapturedPages(null)
                setView('save-dialog')
              }}
              onApply={(template) => {
                setSelectedTemplate(template)
                setApplyStatus('idle')
                setApplyError(null)
                setCapturedPages(null)
                sendMessage({ type: 'CAPTURE_STRUCTURE' })
                setView('apply-confirm')
              }}
              onMoveToGroup={handleMoveTemplateToGroup}
            />
          </div>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {content}
      <ToastContainer />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: `${RESIZE_HANDLE_SIZE}px`,
          height: `${RESIZE_HANDLE_SIZE}px`,
          cursor: 'se-resize',
          zIndex: 1000,
          background: 'linear-gradient(135deg, transparent 45%, var(--figma-color-border) 45% 55%, transparent 55%)',
          borderBottomRightRadius: '4px',
          opacity: 0.7,
          touchAction: 'none'
        }}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        aria-hidden="true"
      />
    </div>
  )
}

function LoadingView() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--figma-color-text-secondary)',
        fontSize: '12px'
      }}
    >
      Loading…
    </div>
  )
}

function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

export default render(Root)
