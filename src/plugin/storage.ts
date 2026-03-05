import type { Template, TemplateGroup } from '@shared/types'

const TOKEN_KEY = 'auth_token'
const CACHED_AT_KEY = 'auth_token_cached_at'
const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 minutes
const OAUTH_TOKENS_KEY = 'oauth_tokens'
const OAUTH_CACHED_AT_KEY = 'oauth_tokens_cached_at'
const REFRESH_TOKEN_KEY = 'firebase_refresh_token'

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
// Google OAuth tokens cache (for re-auth across plugin sessions).
// ---------------------------------------------------------------------------

export type CachedOAuthTokens = {
  idToken?: string
  accessToken?: string
}

export async function cacheOAuthTokens(
  tokens: CachedOAuthTokens,
  cachedAt: number
): Promise<void> {
  await Promise.all([
    figma.clientStorage.setAsync(OAUTH_TOKENS_KEY, tokens),
    figma.clientStorage.setAsync(OAUTH_CACHED_AT_KEY, cachedAt)
  ])
}

export async function getCachedOAuthTokens(): Promise<CachedOAuthTokens | null> {
  const [tokens, cachedAt] = (await Promise.all([
    figma.clientStorage.getAsync(OAUTH_TOKENS_KEY),
    figma.clientStorage.getAsync(OAUTH_CACHED_AT_KEY)
  ])) as [CachedOAuthTokens | undefined, number | undefined]

  if (!tokens || !cachedAt) return null

  if (Date.now() - cachedAt > TOKEN_TTL_MS) {
    await Promise.all([
      figma.clientStorage.deleteAsync(OAUTH_TOKENS_KEY),
      figma.clientStorage.deleteAsync(OAUTH_CACHED_AT_KEY)
    ])
    return null
  }

  if (!tokens.idToken && !tokens.accessToken) return null

  return tokens
}

export async function clearCachedOAuthTokens(): Promise<void> {
  await Promise.all([
    figma.clientStorage.deleteAsync(OAUTH_TOKENS_KEY),
    figma.clientStorage.deleteAsync(OAUTH_CACHED_AT_KEY)
  ])
}

// ---------------------------------------------------------------------------
// Firebase refresh token — long-lived, survives plugin restarts.
// ---------------------------------------------------------------------------

export async function cacheRefreshToken(token: string): Promise<void> {
  await figma.clientStorage.setAsync(REFRESH_TOKEN_KEY, token)
}

export async function getCachedRefreshToken(): Promise<string | null> {
  const token = (await figma.clientStorage.getAsync(REFRESH_TOKEN_KEY)) as string | undefined
  return token ?? null
}

export async function clearCachedRefreshToken(): Promise<void> {
  await figma.clientStorage.deleteAsync(REFRESH_TOKEN_KEY)
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

// ---------------------------------------------------------------------------
// Local templates — stored per-user via figma.clientStorage, no Firebase.
// ---------------------------------------------------------------------------

const LOCAL_TEMPLATES_KEY = 'local_templates'

export async function getLocalTemplates(): Promise<Template[]> {
  const raw = (await figma.clientStorage.getAsync(LOCAL_TEMPLATES_KEY)) as Template[] | undefined
  return raw ?? []
}

export async function saveLocalTemplate(
  template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Template> {
  const templates = await getLocalTemplates()
  const newTemplate: Template = {
    ...template,
    id: `local_${Date.now()}`,
    createdAt: null,
    updatedAt: null
  }
  templates.push(newTemplate)
  await figma.clientStorage.setAsync(LOCAL_TEMPLATES_KEY, templates)
  return newTemplate
}

export async function deleteLocalTemplate(id: string): Promise<void> {
  const templates = await getLocalTemplates()
  await figma.clientStorage.setAsync(
    LOCAL_TEMPLATES_KEY,
    templates.filter(t => t.id !== id)
  )
}

export async function updateLocalTemplateFull(
  id: string,
  data: Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByEmail'>
): Promise<Template> {
  const templates = await getLocalTemplates()
  const idx = templates.findIndex(t => t.id === id)
  if (idx === -1) throw new Error(`Template ${id} not found`)
  const updated: Template = {
    ...templates[idx],
    ...data,
    id: templates[idx].id,
    createdBy: templates[idx].createdBy,
    createdByEmail: templates[idx].createdByEmail,
    createdAt: templates[idx].createdAt,
    updatedAt: null
  }
  templates[idx] = updated
  await figma.clientStorage.setAsync(LOCAL_TEMPLATES_KEY, templates)
  return updated
}

export async function updateLocalTemplateName(id: string, name: string): Promise<void> {
  const templates = await getLocalTemplates()
  const updated = templates.map(t =>
    t.id === id ? { ...t, name } : t
  )
  await figma.clientStorage.setAsync(LOCAL_TEMPLATES_KEY, updated)
}

// ---------------------------------------------------------------------------
// Local groups — stored per-user via figma.clientStorage, no Firebase.
// ---------------------------------------------------------------------------

const LOCAL_GROUPS_KEY = 'template_groups'

export async function getLocalGroups(): Promise<TemplateGroup[]> {
  const raw = (await figma.clientStorage.getAsync(LOCAL_GROUPS_KEY)) as TemplateGroup[] | undefined
  return raw ?? []
}

export async function saveLocalGroup(
  group: Omit<TemplateGroup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<TemplateGroup> {
  const groups = await getLocalGroups()
  const requestedId = typeof group.id === 'string' ? group.id.trim() : ''
  const resolvedId = requestedId && !groups.some(g => g.id === requestedId)
    ? requestedId
    : `local_${Date.now()}`
  const newGroup: TemplateGroup = {
    ...group,
    id: resolvedId,
    createdAt: null,
    updatedAt: null
  }
  groups.push(newGroup)
  await figma.clientStorage.setAsync(LOCAL_GROUPS_KEY, groups)
  return newGroup
}

export async function updateLocalGroup(id: string, name: string): Promise<void> {
  const groups = await getLocalGroups()
  const idx = groups.findIndex(g => g.id === id)
  if (idx === -1) return
  groups[idx] = { ...groups[idx], name }
  await figma.clientStorage.setAsync(LOCAL_GROUPS_KEY, groups)
}

export async function deleteLocalGroup(id: string): Promise<void> {
  const [groups, templates] = await Promise.all([getLocalGroups(), getLocalTemplates()])
  const updatedGroups = groups.filter(g => g.id !== id)
  const updatedTemplates = templates.map(t =>
    t.groupId === id ? { ...t, groupId: null } : t
  )
  await Promise.all([
    figma.clientStorage.setAsync(LOCAL_GROUPS_KEY, updatedGroups),
    figma.clientStorage.setAsync(LOCAL_TEMPLATES_KEY, updatedTemplates)
  ])
}

export async function reorderLocalGroups(orderedIds: string[]): Promise<void> {
  const groups = await getLocalGroups()
  const reordered = orderedIds
    .map((id, index) => {
      const g = groups.find(g => g.id === id)
      return g ? { ...g, order: index } : null
    })
    .filter((g): g is TemplateGroup => g !== null)
  // Append any groups not in orderedIds at the end
  const missing = groups.filter(g => !orderedIds.includes(g.id)).map((g, i) => ({ ...g, order: reordered.length + i }))
  await figma.clientStorage.setAsync(LOCAL_GROUPS_KEY, [...reordered, ...missing])
}

export async function moveTemplateToGroup(templateId: string, groupId: string | null): Promise<void> {
  const templates = await getLocalTemplates()
  const updated = templates.map(t =>
    t.id === templateId ? { ...t, groupId } : t
  )
  await figma.clientStorage.setAsync(LOCAL_TEMPLATES_KEY, updated)
}
