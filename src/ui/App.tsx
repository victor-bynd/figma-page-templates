import { render } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, cacheTokenLocal } from '@backend/auth'
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

function App() {
  const [view, setView] = useState<AppView>('loading')
  const [currentUser, setCurrentUser] = useState<OrgUser | null>(null)
  const [capturedPages, setCapturedPages] = useState<TemplatePage[] | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [selectedComponentKey, setSelectedComponentKey] = useState<string | null>(null)

  const handleMessage = useCallback((message: UIMessage) => {
    switch (message.type) {
      case 'AUTH_TOKEN_RESULT':
        // Token check from plugin storage is informational only —
        // Firebase's onAuthStateChanged below is the source of truth.
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

  // Firebase auth state is the source of truth for sign-in status.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        const email = firebaseUser.email ?? ''
        const domain = email.split('@')[1] ?? ''
        const orgId = 'org_' + domain.replace(/\./g, '_')
        const user: OrgUser = {
          uid: firebaseUser.uid,
          email,
          orgId,
          displayName: firebaseUser.displayName
        }

        // Ensure user doc exists before org creation (rules depend on user doc).
        await upsertUser(user)
        await bootstrapOrg(orgId, domain)
        const cachedAt = Date.now()
        const token = await firebaseUser.getIdToken()
        cacheTokenLocal(token, cachedAt)
        sendMessage({ type: 'CACHE_AUTH_TOKEN', token, cachedAt })

        setCurrentUser(user)
        setView('template-list')
      } else {
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
      />
    )
  } else if (view === 'save-dialog') {
    content = (
      <SaveDialog
        currentUser={currentUser!}
        capturedPages={capturedPages}
        onSaved={(_id) => {
          setCapturedPages(null)
          setView('template-list')
        }}
        onCancel={() => {
          setCapturedPages(null)
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
        onComponentSelected={(componentKey) => {
          setSelectedComponentKey(componentKey)
          // Sprint 4.2: send PLACE_COVER message and advance to field editor
          console.log('[UI] Component selected:', componentKey)
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
    content = (
      <TemplateList
        currentUser={currentUser!}
        onNewTemplate={() => {
          setCapturedPages(null)
          setView('save-dialog')
        }}
        onApply={(template) => {
          setSelectedTemplate(template)
          setApplyStatus('idle')
          setApplyError(null)
          setCapturedPages(null)
          // Capture current file structure for conflict detection
          sendMessage({ type: 'CAPTURE_STRUCTURE' })
          setView('apply-confirm')
        }}
      />
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {content}
      <ToastContainer />
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
