import { h } from 'preact'
import { useState } from 'preact/hooks'
import { cacheTokenLocal, signInWithGoogle } from '@backend/auth'
import { bootstrapOrg, upsertUser } from '@backend/db'
import { sendMessage } from '../App'
import type { OrgUser } from '@shared/types'

interface AuthViewProps {
  onSignedIn: (user: OrgUser) => void
}

export function AuthView({ onSignedIn }: AuthViewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    try {
      const user = await signInWithGoogle()
      // Ensure user doc exists before org creation (rules depend on user doc).
      await upsertUser(user)
      await bootstrapOrg(user.orgId, user.email.split('@')[1] ?? '')
      // Cache the fresh token in the plugin main thread
      const { auth } = await import('@backend/auth')
      const cachedAt = Date.now()
      const token = await auth.currentUser!.getIdToken()
      cacheTokenLocal(token, cachedAt)
      sendMessage({ type: 'CACHE_AUTH_TOKEN', token, cachedAt })
      onSignedIn(user)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      setError(msg === 'REDIRECT_INITIATED' ? null : msg)
    } finally {
      setLoading(false)
    }
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
        onClick={handleSignIn}
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
    </div>
  )
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
    maxWidth: '220px'
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
  }
}
