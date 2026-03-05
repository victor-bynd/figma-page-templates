import type { Template, TemplateGroup, TemplatePage, TextLayerOverride } from './types'

// ---------------------------------------------------------------------------
// UI → Plugin messages (PluginMessage)
// ---------------------------------------------------------------------------

export interface CaptureStructureMessage {
  type: 'CAPTURE_STRUCTURE'
}

export interface ApplyTemplateMessage {
  type: 'APPLY_TEMPLATE'
  pages: TemplatePage[]
  /** When true, deletes all existing non-Cover pages before applying. Default false. */
  replaceAll?: boolean
  /**
   * Where to insert the Cover page relative to the applied pages.
   * 0 = before the first applied page, N = after the Nth applied page.
   * Omit/null to leave Cover in its current position.
   */
  coverInsertIndex?: number | null
}

export interface PlaceCoverMessage {
  type: 'PLACE_COVER'
  componentKey: string
}

export interface GetTextLayersMessage {
  type: 'GET_TEXT_LAYERS'
}

export interface SetOverridesMessage {
  type: 'SET_OVERRIDES'
  overrides: TextLayerOverride[]
  /** Raw image bytes to swap into the "Cover Image" layer, if provided. */
  imageBytes?: Uint8Array
}

export interface CacheAuthTokenMessage {
  type: 'CACHE_AUTH_TOKEN'
  /** Firebase ID token string. */
  token: string
  /** Unix ms timestamp of when the token was fetched, for TTL checks. */
  cachedAt: number
}

export interface CacheOAuthTokensMessage {
  type: 'CACHE_OAUTH_TOKENS'
  tokens: {
    idToken?: string
    accessToken?: string
  }
  cachedAt: number
}

export interface CacheRefreshTokenMessage {
  type: 'CACHE_REFRESH_TOKEN'
  refreshToken: string
}

export interface ClearRefreshTokenMessage {
  type: 'CLEAR_REFRESH_TOKEN'
}

export interface SavePatMessage {
  type: 'SAVE_PAT'
  /** Figma Personal Access Token (stored locally, never sent to Firebase). */
  pat: string
}

export interface GetPatMessage {
  type: 'GET_PAT'
}

export interface ClearPatMessage {
  type: 'CLEAR_PAT'
}

export interface GetLocalTemplatesMessage {
  type: 'GET_LOCAL_TEMPLATES'
}

export interface SaveLocalTemplateMessage {
  type: 'SAVE_LOCAL_TEMPLATE'
  template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>
}

export interface DeleteLocalTemplateMessage {
  type: 'DELETE_LOCAL_TEMPLATE'
  id: string
}

export interface UpdateLocalTemplateMessage {
  type: 'UPDATE_LOCAL_TEMPLATE'
  id: string
  name: string
}

export interface GetLocalGroupsMessage {
  type: 'GET_LOCAL_GROUPS'
}

export interface SaveLocalGroupMessage {
  type: 'SAVE_LOCAL_GROUP'
  group: Omit<TemplateGroup, 'id' | 'createdAt' | 'updatedAt'>
}

export interface UpdateLocalGroupMessage {
  type: 'UPDATE_LOCAL_GROUP'
  id: string
  name: string
}

export interface DeleteLocalGroupMessage {
  type: 'DELETE_LOCAL_GROUP'
  id: string
}

export interface ReorderLocalGroupsMessage {
  type: 'REORDER_LOCAL_GROUPS'
  orderedIds: string[]
}

export interface MoveTemplateToGroupMessage {
  type: 'MOVE_TEMPLATE_TO_GROUP'
  templateId: string
  groupId: string | null
}

export interface ResizeUIMessage {
  type: 'RESIZE_UI'
  width: number
  height: number
}

export interface OpenExternalUrlMessage {
  type: 'OPEN_EXTERNAL_URL'
  url: string
}

/** Discriminated union of all messages sent from the UI iframe to the plugin. */
export type PluginMessage =
  | CaptureStructureMessage
  | ApplyTemplateMessage
  | PlaceCoverMessage
  | GetTextLayersMessage
  | SetOverridesMessage
  | CacheAuthTokenMessage
  | CacheOAuthTokensMessage
  | CacheRefreshTokenMessage
  | ClearRefreshTokenMessage
  | SavePatMessage
  | GetPatMessage
  | ClearPatMessage
  | GetLocalTemplatesMessage
  | SaveLocalTemplateMessage
  | DeleteLocalTemplateMessage
  | UpdateLocalTemplateMessage
  | GetLocalGroupsMessage
  | SaveLocalGroupMessage
  | UpdateLocalGroupMessage
  | DeleteLocalGroupMessage
  | ReorderLocalGroupsMessage
  | MoveTemplateToGroupMessage
  | ResizeUIMessage
  | OpenExternalUrlMessage

// ---------------------------------------------------------------------------
// Plugin → UI messages (UIMessage)
// ---------------------------------------------------------------------------

export interface StructureCapturedMessage {
  type: 'STRUCTURE_CAPTURED'
  pages: TemplatePage[]
}

export interface TemplateAppliedMessage {
  type: 'TEMPLATE_APPLIED'
}

export interface CoverPlacedMessage {
  type: 'COVER_PLACED'
}

export interface TextLayersResultMessage {
  type: 'TEXT_LAYERS_RESULT'
  layers: TextLayerOverride[]
}

export interface AuthTokenResultMessage {
  type: 'AUTH_TOKEN_RESULT'
  /** Cached Firebase ID token, or null if absent/expired. */
  token: string | null
}

export interface OAuthTokensResultMessage {
  type: 'OAUTH_TOKENS_RESULT'
  tokens: {
    idToken?: string
    accessToken?: string
  } | null
}

export interface RefreshTokenResultMessage {
  type: 'REFRESH_TOKEN_RESULT'
  refreshToken: string | null
}

export interface ErrorMessage {
  type: 'ERROR'
  code: string
  message: string
}

export interface PatResultMessage {
  type: 'PAT_RESULT'
  /** Stored PAT, or null if not set. */
  pat: string | null
}

export interface LocalTemplatesResultMessage {
  type: 'LOCAL_TEMPLATES_RESULT'
  templates: Template[]
}

export interface LocalTemplateSavedMessage {
  type: 'LOCAL_TEMPLATE_SAVED'
  template: Template
}

export interface LocalGroupsResultMessage {
  type: 'LOCAL_GROUPS_RESULT'
  groups: TemplateGroup[]
}

/** Discriminated union of all messages sent from the plugin to the UI iframe. */
export type UIMessage =
  | StructureCapturedMessage
  | TemplateAppliedMessage
  | CoverPlacedMessage
  | TextLayersResultMessage
  | AuthTokenResultMessage
  | OAuthTokensResultMessage
  | RefreshTokenResultMessage
  | ErrorMessage
  | PatResultMessage
  | LocalTemplatesResultMessage
  | LocalTemplateSavedMessage
  | LocalGroupsResultMessage
