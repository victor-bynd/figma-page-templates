import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type Auth,
  type UserCredential
} from 'firebase/auth'
import { app, firebaseConfig } from './config'
import type { OrgUser } from '@shared/types'

/** Singleton Firebase Auth instance. */
export const auth: Auth = getAuth(app)

/** Configured Google OAuth provider. */
export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider()

const TOKEN_KEY = 'auth_token'
const CACHED_AT_KEY = 'auth_token_cached_at'
const TOKEN_TTL_MS = 55 * 60 * 1000

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'mail.com', 'protonmail.com', 'proton.me', 'zoho.com', 'yandex.com',
  'gmx.com', 'fastmail.com', 'tutanota.com', 'hey.com',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Client-side orgId derivation — used as fallback for display purposes only.
 * The authoritative orgId comes from the server-set custom claim.
 */
function deriveOrgIdFromEmail(email: string, uid: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) {
    return `personal_${uid}`
  }
  return 'org_' + domain.replace(/\./g, '_')
}

function credentialToOrgUser(credential: UserCredential): OrgUser {
  const { user } = credential
  const email = user.email ?? ''
  const orgId = deriveOrgIdFromEmail(email, user.uid)
  return {
    uid: user.uid,
    email,
    orgId,
    displayName: user.displayName
  }
}

/**
 * Reads orgId from Firebase ID token custom claims.
 * Falls back to client-side derivation if the claim is not yet set.
 */
export async function getOrgIdFromClaims(user: import('firebase/auth').User): Promise<string> {
  const tokenResult = await user.getIdTokenResult()
  const claimsOrgId = tokenResult.claims.orgId
  if (typeof claimsOrgId === 'string' && claimsOrgId) {
    return claimsOrgId
  }
  // Fallback: claim may not be set yet (first-time sign-in before bridge).
  return deriveOrgIdFromEmail(user.email ?? '', user.uid)
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

export type GoogleAuthTokens = {
  idToken?: string
  accessToken?: string
}

/**
 * Signs in using Google OAuth tokens obtained outside the plugin iframe.
 */
export async function signInWithGoogleTokens(tokens: GoogleAuthTokens): Promise<OrgUser> {
  if (!tokens.idToken && !tokens.accessToken) {
    throw new Error('Missing Google auth tokens')
  }
  const credential = GoogleAuthProvider.credential(
    tokens.idToken ?? null,
    tokens.accessToken ?? null
  )
  const result = await signInWithCredential(auth, credential)
  return credentialToOrgUser(result)
}

/**
 * Signs in using a Firebase custom token (minted server-side).
 */
export async function signInWithCustomToken(customToken: string): Promise<OrgUser> {
  if (!customToken) {
    throw new Error('Missing custom auth token')
  }
  const result = await firebaseSignInWithCustomToken(auth, customToken)
  return credentialToOrgUser(result)
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
// Session restore via refresh token (used on plugin reopen)
// ---------------------------------------------------------------------------

/**
 * Computes the Cloud Functions origin based on env vars and Firebase config.
 * Exported so AuthView can reuse it.
 */
export function getFunctionsOrigin(): string {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {}
  const fromEnv = env.VITE_FIREBASE_FUNCTIONS_ORIGIN
  if (fromEnv) return fromEnv
  const region = env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
  const projectId = auth?.app?.options?.projectId || env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId
  if (!projectId) return ''
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `http://localhost:5001/${projectId}/${region}`
  }
  return `https://${region}-${projectId}.cloudfunctions.net`
}

/**
 * Restores a Firebase Auth session from a cached refresh token.
 *
 * 1. Exchanges the refresh token for a fresh Firebase ID token via the REST API.
 * 2. Sends the fresh ID token to the `refreshSession` Cloud Function to mint
 *    a custom token (with orgId claim).
 * 3. Signs in with the custom token, restoring the full Firebase Auth state.
 *
 * After this resolves, `onAuthStateChanged` will fire with the signed-in user.
 */
export async function restoreSessionFromRefreshToken(refreshToken: string): Promise<OrgUser> {
  const apiKey = firebaseConfig.apiKey
  if (!apiKey) throw new Error('MISSING_API_KEY')

  const functionsOrigin = getFunctionsOrigin()
  if (!functionsOrigin) throw new Error('MISSING_FUNCTIONS_ORIGIN')

  // Step 1: Exchange refresh token for a fresh ID token via Firebase REST API.
  const tokenResponse = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    }
  )
  if (!tokenResponse.ok) throw new Error('TOKEN_REFRESH_FAILED')
  const tokenData = (await tokenResponse.json()) as { id_token?: string }
  const freshIdToken = tokenData.id_token
  if (!freshIdToken) throw new Error('TOKEN_REFRESH_FAILED')

  // Step 2: Call the refreshSession Cloud Function to mint a custom token.
  const cfResponse = await fetch(`${functionsOrigin}/refreshSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: freshIdToken })
  })
  if (!cfResponse.ok) throw new Error('REFRESH_SESSION_FAILED')
  const cfData = (await cfResponse.json()) as { customToken?: string }
  if (!cfData.customToken) throw new Error('REFRESH_SESSION_FAILED')

  // Step 3: Sign in with the custom token — triggers onAuthStateChanged.
  return signInWithCustomToken(cfData.customToken)
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
