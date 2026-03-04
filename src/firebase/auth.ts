import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type Auth,
  type UserCredential
} from 'firebase/auth'
import { app } from './config'
import type { OrgUser } from '@shared/types'

/** Singleton Firebase Auth instance. */
export const auth: Auth = getAuth(app)

/** Configured Google OAuth provider. */
export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider()

const TOKEN_KEY = 'auth_token'
const CACHED_AT_KEY = 'auth_token_cached_at'
const TOKEN_TTL_MS = 55 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function credentialToOrgUser(credential: UserCredential): OrgUser {
  const { user } = credential
  const email = user.email ?? ''
  const domain = email.split('@')[1] ?? ''
  const orgId = 'org_' + domain.replace(/\./g, '_')
  return {
    uid: user.uid,
    email,
    orgId,
    displayName: user.displayName
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Signs in with Google via popup. Falls back to redirect if the popup is blocked.
 * On redirect flow the page navigates away — call `getRedirectResultAsOrgUser`
 * on the next mount to complete sign-in.
 *
 * @returns Resolved `OrgUser` on popup success.
 * @throws  On auth errors other than popup-blocked.
 */
export async function signInWithGoogle(): Promise<OrgUser> {
  try {
    const credential = await signInWithPopup(auth, googleProvider)
    return credentialToOrgUser(credential)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
      // Initiate redirect; page will reload — caller must handle via
      // getRedirectResultAsOrgUser() on next mount.
      await signInWithRedirect(auth, googleProvider)
      // Never reached — redirect navigates the page.
      throw new Error('REDIRECT_INITIATED')
    }
    throw err
  }
}

/**
 * Completes a redirect-based sign-in flow. Call once on mount after a redirect.
 * Returns null if no redirect result is pending.
 */
export async function getRedirectResultAsOrgUser(): Promise<OrgUser | null> {
  const result = await getRedirectResult(auth)
  if (!result) return null
  return credentialToOrgUser(result)
}

/**
 * Returns a valid Firebase ID token, force-refreshing if the current user exists.
 * Throws `AUTH_EXPIRED` if no user is signed in.
 */
export async function getValidToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('AUTH_EXPIRED')
  const cached = getCachedToken()
  if (cached) return cached

  const token = await user.getIdToken(/* forceRefresh */ true)
  cacheToken(token, Date.now())
  return token
}

/**
 * Signs out the current user.
 */
export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

// ---------------------------------------------------------------------------
// Local token cache (UI-only, complements plugin clientStorage cache)
// ---------------------------------------------------------------------------

function getCachedToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const cachedAt = Number(localStorage.getItem(CACHED_AT_KEY))
    if (!token || !cachedAt) return null
    if (Date.now() - cachedAt > TOKEN_TTL_MS) return null
    return token
  } catch {
    return null
  }
}

function cacheToken(token: string, cachedAt: number): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(CACHED_AT_KEY, String(cachedAt))
  } catch {
    // Ignore storage failures
  }
}

export function cacheTokenLocal(token: string, cachedAt: number): void {
  cacheToken(token, cachedAt)
}
