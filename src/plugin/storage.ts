const TOKEN_KEY = 'auth_token'
const CACHED_AT_KEY = 'auth_token_cached_at'
const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 minutes

/**
 * Persists a Firebase ID token and the time it was cached.
 * Call this every time a fresh token is obtained from Firebase.
 */
export async function cacheAuthToken(
  token: string,
  cachedAt: number
): Promise<void> {
  await Promise.all([
    figma.clientStorage.setAsync(TOKEN_KEY, token),
    figma.clientStorage.setAsync(CACHED_AT_KEY, cachedAt)
  ])
}

/**
 * Returns the cached Firebase ID token if it exists and is younger than 55 minutes.
 * Clears the cache and returns null if the token is absent or expired.
 */
export async function getCachedAuthToken(): Promise<string | null> {
  const [token, cachedAt] = (await Promise.all([
    figma.clientStorage.getAsync(TOKEN_KEY),
    figma.clientStorage.getAsync(CACHED_AT_KEY)
  ])) as [string | undefined, number | undefined]

  if (!token || !cachedAt) return null

  if (Date.now() - cachedAt > TOKEN_TTL_MS) {
    await Promise.all([
      figma.clientStorage.deleteAsync(TOKEN_KEY),
      figma.clientStorage.deleteAsync(CACHED_AT_KEY)
    ])
    return null
  }

  return token
}

/**
 * Clears the cached auth token. Call on sign-out.
 */
export async function clearCachedAuthToken(): Promise<void> {
  await Promise.all([
    figma.clientStorage.deleteAsync(TOKEN_KEY),
    figma.clientStorage.deleteAsync(CACHED_AT_KEY)
  ])
}

// ---------------------------------------------------------------------------
// Figma Personal Access Token — stored locally, NEVER sent to Firebase.
// ---------------------------------------------------------------------------

const PAT_KEY = 'figma_pat'

/**
 * Persists a Figma Personal Access Token to `figma.clientStorage`.
 * The PAT is stored locally only and never included in any Firestore write.
 */
export async function savePAT(pat: string): Promise<void> {
  await figma.clientStorage.setAsync(PAT_KEY, pat)
}

/**
 * Returns the stored PAT, or `null` if none has been saved.
 */
export async function getPAT(): Promise<string | null> {
  const pat = (await figma.clientStorage.getAsync(PAT_KEY)) as string | undefined
  return pat ?? null
}

/**
 * Removes the stored PAT. Provides a "forget token" action in the UI.
 */
export async function clearPAT(): Promise<void> {
  await figma.clientStorage.deleteAsync(PAT_KEY)
}
