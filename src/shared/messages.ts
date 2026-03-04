import type { TemplatePage, TextLayerOverride } from './types'

// ---------------------------------------------------------------------------
// UI → Plugin messages (PluginMessage)
// ---------------------------------------------------------------------------

export interface CaptureStructureMessage {
  type: 'CAPTURE_STRUCTURE'
}

export interface ApplyTemplateMessage {
  type: 'APPLY_TEMPLATE'
  pages: TemplatePage[]
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

/** Discriminated union of all messages sent from the UI iframe to the plugin. */
export type PluginMessage =
  | CaptureStructureMessage
  | ApplyTemplateMessage
  | PlaceCoverMessage
  | GetTextLayersMessage
  | SetOverridesMessage
  | CacheAuthTokenMessage
  | SavePatMessage
  | GetPatMessage
  | ClearPatMessage

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

/** Discriminated union of all messages sent from the plugin to the UI iframe. */
export type UIMessage =
  | StructureCapturedMessage
  | TemplateAppliedMessage
  | CoverPlacedMessage
  | TextLayersResultMessage
  | AuthTokenResultMessage
  | ErrorMessage
  | PatResultMessage
