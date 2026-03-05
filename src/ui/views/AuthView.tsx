import { h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { auth, cacheTokenLocal, getOrgIdFromClaims, getFunctionsOrigin, signInWithCustomToken } from '@backend/auth'
import { firebaseConfig } from '@backend/config'
import { bootstrapOrg, upsertUser } from '@backend/db'
import { sendMessage } from '../App'
import type { OrgUser } from '@shared/types'

interface AuthViewProps {
  onSignedIn: (user: OrgUser) => void
  onSkipSignIn: () => void
}

export function AuthView({ onSignedIn, onSkipSignIn }: AuthViewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bridgeState, setBridgeState] = useState<'idle' | 'awaiting-code' | 'verifying'>('idle')
  const pollTimerRef = useRef<number | null>(null)
  const pollStartedAtRef = useRef<number | null>(null)
  const activeStateRef = useRef<string | null>(null)

  const authBridgeUrl = getAuthBridgeUrl()
  const functionsOrigin = getFunctionsOrigin()

  const BRIDGE_POLL_INTERVAL_MS = 1500
  const BRIDGE_POLL_TIMEOUT_MS = 2 * 60 * 1000

  function stopPolling() {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollStartedAtRef.current = null
    activeStateRef.current = null
  }

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [])

  async function consumeBridgeToken(state: string): Promise<string | null> {
    if (!functionsOrigin) {
      throw new Error('Functions origin is not configured. Set VITE_FIREBASE_FUNCTIONS_ORIGIN or VITE_FIREBASE_PROJECT_ID.')
    }

    const response = await fetch(`${functionsOrigin}/consumeAuthBridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    })

    if (response.status === 404) return null
    if (response.status === 410) {
      throw new Error('Sign-in expired. Open the browser window again to restart.')
    }
    if (!response.ok) {
      throw new Error('Sign-in could not be completed. Try again.')
    }

    const data = (await response.json()) as { customToken?: string }
    if (!data.customToken) {
      throw new Error('Missing sign-in token. Try again.')
    }

    return data.customToken
  }

  async function completeBridgeSignIn(customToken: string) {
    setLoading(true)
    setError(null)
    setBridgeState('verifying')
    try {
      const user = await signInWithCustomToken(customToken)
      // Read orgId from the custom claim set by createAuthBridge
      const orgId = await getOrgIdFromClaims(auth.currentUser!)
      user.orgId = orgId
      // Non-blocking: auth should still complete even if bootstrap writes are denied.
      try {
        await upsertUser(user)
        await bootstrapOrg(user.orgId, user.email.split('@')[1] ?? '')
      } catch (bootstrapErr) {
        console.warn('[AuthView] Bootstrap writes failed:', bootstrapErr)
      }
      const cachedAt = Date.now()
      const token = await auth.currentUser!.getIdToken()
      cacheTokenLocal(token, cachedAt)
      sendMessage({ type: 'CACHE_AUTH_TOKEN', token, cachedAt })
      setBridgeState('idle')
      onSignedIn(user)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      setError(msg)
      setBridgeState('awaiting-code')
    } finally {
      setLoading(false)
    }
  }

  async function pollForBridge(state: string) {
    if (activeStateRef.current !== state) return
    try {
      const customToken = await consumeBridgeToken(state)
      if (customToken) {
        stopPolling()
        await completeBridgeSignIn(customToken)
        return
      }
    } catch (err) {
      stopPolling()
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      setError(msg)
      setBridgeState('awaiting-code')
      return
    }

    const startedAt = pollStartedAtRef.current ?? Date.now()
    pollStartedAtRef.current = startedAt
    if (Date.now() - startedAt > BRIDGE_POLL_TIMEOUT_MS) {
      stopPolling()
      setError('Sign-in timed out. Open the browser window again to restart.')
      setBridgeState('awaiting-code')
      return
    }

    pollTimerRef.current = window.setTimeout(() => {
      void pollForBridge(state)
    }, BRIDGE_POLL_INTERVAL_MS)
  }

  function handleOpenBrowserSignIn() {
    setError(null)
    stopPolling()
    const state = generateAuthState()
    const url = buildAuthBridgeUrl(authBridgeUrl, state)
    if (!url) {
      setError('Auth bridge URL is not configured. Set VITE_FIREBASE_AUTH_BRIDGE_URL or deploy the /auth page on Firebase Hosting.')
      return
    }
    if (!functionsOrigin) {
      setError('Functions origin is not configured. Set VITE_FIREBASE_FUNCTIONS_ORIGIN or VITE_FIREBASE_PROJECT_ID.')
      return
    }
    sendMessage({ type: 'OPEN_EXTERNAL_URL', url })
    setBridgeState('awaiting-code')
    activeStateRef.current = state
    pollStartedAtRef.current = Date.now()
    void pollForBridge(state)
  }

  function handleCancelBridgeSignIn() {
    stopPolling()
    setBridgeState('idle')
    setError(null)
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#18A0FB" />
          <path d="M8 10h16M8 16h16M8 22h10" stroke="white" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>

      <h1 style={styles.title}>Page Templates</h1>
      <p style={styles.subtitle}>
        Sign in to access and share page templates across your team.
      </p>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      <button
        style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
        onClick={handleOpenBrowserSignIn}
        disabled={loading}
      >
        {loading ? (
          <span>Signing in…</span>
        ) : (
          <span style={styles.buttonContent}>
            <GoogleIcon />
            Sign in with Google
          </span>
        )}
      </button>

      {bridgeState !== 'idle' && (
        <div style={styles.bridgePanel}>
          <p style={styles.bridgeText}>
            A browser window has opened for Google sign-in. After you finish, return here and
            the plugin will continue automatically.
          </p>
          <p style={styles.bridgeStatus}>
            {bridgeState === 'verifying' ? 'Verifying sign-in…' : 'Waiting for confirmation…'}
          </p>
          <button
            style={styles.secondaryButton}
            onClick={handleOpenBrowserSignIn}
            disabled={loading}
          >
            Open browser again
          </button>
          <button
            style={styles.secondaryButton}
            onClick={handleCancelBridgeSignIn}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      )}

      <button
        style={styles.skipButton}
        onClick={onSkipSignIn}
        disabled={loading}
      >
        Use Locally (Skip Sign-in)
      </button>
    </div>
  )
}

function getAuthBridgeUrl(): string {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {}
  const fromEnv = env.VITE_FIREBASE_AUTH_BRIDGE_URL
  if (fromEnv) return fromEnv
  const authDomainFromApp = auth?.app?.options?.authDomain
  if (authDomainFromApp) return `https://${authDomainFromApp}/auth`
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain
  return authDomain ? `https://${authDomain}/auth` : ''
}

function buildAuthBridgeUrl(base: string, state: string): string | null {
  if (!base) return null
  try {
    const url = new URL(base)
    if (state) url.searchParams.set('state', state)
    return url.toString()
  } catch {
    return null
  }
}

function generateAuthState(): string {
  try {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ marginRight: '8px', flexShrink: 0 }}>
      <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.6 2.41v2h2.6c1.52-1.4 2.4-3.46 2.4-5.87z" fill="#4285F4" />
      <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.14-2.52H.96v2.06A8 8 0 0 0 8 16z" fill="#34A853" />
      <path d="M3.56 9.54A4.8 4.8 0 0 1 3.56 6.46V4.4H.96a8 8 0 0 0 0 7.2l2.6-2.06z" fill="#FBBC05" />
      <path d="M8 3.2a4.33 4.33 0 0 1 3.07 1.2l2.28-2.28A7.7 7.7 0 0 0 8 0 8 8 0 0 0 .96 4.4l2.6 2.06A4.77 4.77 0 0 1 8 3.2z" fill="#EA4335" />
    </svg>
  )
}

const styles: Record<string, h.JSX.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    minHeight: '100%',
    boxSizing: 'border-box',
    textAlign: 'center'
  },
  logo: {
    marginBottom: '16px'
  },
  title: {
    margin: '0 0 8px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--figma-color-text)'
  },
  subtitle: {
    margin: '0 0 24px',
    fontSize: '12px',
    color: 'var(--figma-color-text-secondary)',
    lineHeight: 1.5,
    maxWidth: '100%'
  },
  error: {
    marginBottom: '16px',
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'var(--figma-color-bg-danger)',
    color: 'var(--figma-color-text-danger)',
    fontSize: '11px',
    width: '100%',
    boxSizing: 'border-box'
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '10px 16px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  buttonContent: {
    display: 'flex',
    alignItems: 'center'
  },
  skipButton: {
    marginTop: '10px',
    background: 'none',
    border: 'none',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '4px'
  },
  bridgePanel: {
    marginTop: '16px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg-secondary)',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  bridgeText: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--figma-color-text-secondary)',
    lineHeight: 1.4
  },
  bridgeStatus: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--figma-color-text)',
    fontWeight: 500
  },
  secondaryButton: {
    background: 'none',
    border: 'none',
    color: 'var(--figma-color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0
  }
}
