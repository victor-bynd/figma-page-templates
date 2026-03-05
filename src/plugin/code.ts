import type { PluginMessage, UIMessage } from '@shared/messages'
import { captureStructure } from './capture'
import { applyTemplate } from './apply'
import {
  createCoverPage,
  placeCoverComponent,
  getTextLayers,
  applyTextOverrides,
  swapCoverImage
} from './cover'
import {
  cacheAuthToken,
  getCachedAuthToken,
  cacheOAuthTokens,
  getCachedOAuthTokens,
  cacheRefreshToken,
  getCachedRefreshToken,
  clearCachedAuthToken,
  clearCachedRefreshToken,
  savePAT,
  getPAT,
  clearPAT,
  getLocalTemplates,
  saveLocalTemplate,
  deleteLocalTemplate,
  updateLocalTemplateName,
  updateLocalTemplateFull,
  getLocalGroups,
  saveLocalGroup,
  updateLocalGroup,
  deleteLocalGroup,
  reorderLocalGroups,
  moveTemplateToGroup
} from './storage'
import { showUI } from '@create-figma-plugin/utilities'

// ---------------------------------------------------------------------------
// URL allowlist for OPEN_EXTERNAL_URL
// ---------------------------------------------------------------------------

const ALLOWED_URL_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.web\.app(\/|$)/,
  /^https:\/\/[a-z0-9-]+\.firebaseapp\.com(\/|$)/,
  /^http:\/\/localhost(:\d+)?(\/|$)/,
  /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/,
]

function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url))
}

// ---------------------------------------------------------------------------
// Helper to post a typed message back to the UI iframe.
// ---------------------------------------------------------------------------

function postToUI(message: UIMessage): void {
  figma.ui.postMessage(message)
}

// ---------------------------------------------------------------------------
// Stub handlers — will be replaced in later sprints.
// ---------------------------------------------------------------------------

function handleCaptureStructure(): void {
  try {
    const pages = captureStructure()
    postToUI({ type: 'STRUCTURE_CAPTURED', pages })
  } catch (err) {
    postToUI({
      type: 'ERROR',
      code: 'CAPTURE_FAILED',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

function handleApplyTemplate(msg: PluginMessage & { type: 'APPLY_TEMPLATE' }): void {
  try {
    applyTemplate(msg.pages, {
      includeCover: msg.includeCover,
      replaceAll: msg.replaceAll,
      coverInsertIndex: msg.coverInsertIndex,
      coverPageName: msg.coverPageName
    })
    postToUI({ type: 'TEMPLATE_APPLIED' })
  } catch (err) {
    postToUI({
      type: 'ERROR',
      code: 'APPLY_FAILED',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

let currentCoverInstance: InstanceNode | null = null

async function handlePlaceCover(componentKey: string, coverPageName?: string | null) {
  try {
    const page = createCoverPage(coverPageName)
    const instance = await placeCoverComponent(page, componentKey)
    currentCoverInstance = instance

    // Immediately get text layers to present to the user
    const layers = getTextLayers(instance)
    postToUI({ type: 'TEXT_LAYERS_RESULT', layers })
  } catch (err) {
    postToUI({
      type: 'ERROR',
      code: 'PLACE_COVER_FAILED',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

function handleGetTextLayers(): void {
  if (!currentCoverInstance) return
  const layers = getTextLayers(currentCoverInstance)
  postToUI({ type: 'TEXT_LAYERS_RESULT', layers })
}

async function handleSetOverrides(msg: PluginMessage & { type: 'SET_OVERRIDES' }) {
  if (!currentCoverInstance) return

  try {
    const coverInstance = currentCoverInstance

    // 1. Text overrides
    await applyTextOverrides(coverInstance, msg.overrides)

    // 2. Image swap (optional)
    if (msg.imageBytes) {
      swapCoverImage(coverInstance, msg.imageBytes)
    }

    // Return focus to the cover page once setup is complete.
    const coverPage = coverInstance.parent
    if (coverPage?.type === 'PAGE') {
      figma.currentPage = coverPage
    }

    postToUI({ type: 'COVER_PLACED' })

    // Reset state after success
    currentCoverInstance = null
  } catch (err) {
    postToUI({
      type: 'ERROR',
      code: 'APPLY_OVERRIDES_FAILED',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

// ---------------------------------------------------------------------------
// Message dispatcher
// ---------------------------------------------------------------------------

function setupMessageHandler(): void {
  figma.ui.onmessage = async (raw: unknown) => {
    const message = raw as PluginMessage

    switch (message.type) {
      case 'CAPTURE_STRUCTURE':
        handleCaptureStructure()
        break

      case 'APPLY_TEMPLATE':
        handleApplyTemplate(message)
        break

      case 'PLACE_COVER':
        await handlePlaceCover(message.componentKey, message.coverPageName)
        break

      case 'GET_TEXT_LAYERS':
        handleGetTextLayers()
        break

      case 'SET_OVERRIDES':
        await handleSetOverrides(message)
        break

      case 'CACHE_AUTH_TOKEN':
        await cacheAuthToken(message.token, message.cachedAt)
        break

      case 'CLEAR_AUTH_TOKEN':
        await clearCachedAuthToken()
        break

      case 'CACHE_OAUTH_TOKENS':
        await cacheOAuthTokens(message.tokens, message.cachedAt)
        break

      case 'CACHE_REFRESH_TOKEN':
        await cacheRefreshToken(message.refreshToken)
        break

      case 'CLEAR_REFRESH_TOKEN':
        await clearCachedRefreshToken()
        break

      case 'SAVE_PAT':
        await savePAT(message.pat)
        break

      case 'GET_PAT': {
        const pat = await getPAT()
        postToUI({ type: 'PAT_RESULT', pat })
        break
      }

      case 'CLEAR_PAT':
        await clearPAT()
        postToUI({ type: 'PAT_RESULT', pat: null })
        break

      case 'GET_LOCAL_TEMPLATES': {
        try {
          const templates = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_LOAD_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'SAVE_LOCAL_TEMPLATE': {
        try {
          const saved = await saveLocalTemplate(message.template)
          postToUI({ type: 'LOCAL_TEMPLATE_SAVED', template: saved })
          const allTemplates = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates: allTemplates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_SAVE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'DELETE_LOCAL_TEMPLATE': {
        try {
          await deleteLocalTemplate(message.id)
          const remaining = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates: remaining })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_DELETE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'UPDATE_LOCAL_TEMPLATE': {
        try {
          await updateLocalTemplateName(message.id, message.name)
          const templates = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_TEMPLATE_UPDATE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'UPDATE_LOCAL_TEMPLATE_FULL': {
        try {
          const saved = await updateLocalTemplateFull(message.id, message.template)
          postToUI({ type: 'LOCAL_TEMPLATE_SAVED', template: saved })
          const allTemplates = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates: allTemplates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_SAVE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'GET_LOCAL_GROUPS': {
        try {
          const groups = await getLocalGroups()
          postToUI({ type: 'LOCAL_GROUPS_RESULT', groups })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_GROUPS_LOAD_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'SAVE_LOCAL_GROUP': {
        try {
          await saveLocalGroup(message.group)
          const groups = await getLocalGroups()
          postToUI({ type: 'LOCAL_GROUPS_RESULT', groups })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_GROUP_SAVE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'UPDATE_LOCAL_GROUP': {
        try {
          await updateLocalGroup(message.id, message.name)
          const groups = await getLocalGroups()
          postToUI({ type: 'LOCAL_GROUPS_RESULT', groups })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_GROUP_UPDATE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'DELETE_LOCAL_GROUP': {
        try {
          await deleteLocalGroup(message.id)
          const [groups, templates] = await Promise.all([getLocalGroups(), getLocalTemplates()])
          postToUI({ type: 'LOCAL_GROUPS_RESULT', groups })
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_GROUP_DELETE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'REORDER_LOCAL_GROUPS': {
        try {
          await reorderLocalGroups(message.orderedIds)
          const groups = await getLocalGroups()
          postToUI({ type: 'LOCAL_GROUPS_RESULT', groups })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_GROUP_REORDER_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'MOVE_TEMPLATE_TO_GROUP': {
        try {
          await moveTemplateToGroup(message.templateId, message.groupId)
          const templates = await getLocalTemplates()
          postToUI({ type: 'LOCAL_TEMPLATES_RESULT', templates })
        } catch (err) {
          postToUI({ type: 'ERROR', code: 'LOCAL_MOVE_TEMPLATE_FAILED', message: err instanceof Error ? err.message : String(err) })
        }
        break
      }

      case 'RESIZE_UI': {
        figma.ui.resize(Math.round(message.width), Math.round(message.height))
        break
      }

      case 'OPEN_EXTERNAL_URL': {
        if (message.url && isAllowedExternalUrl(message.url)) {
          figma.openExternal(message.url)
        }
        break
      }

      default: {
        const exhaustive: never = message
        console.warn(
          '[Plugin] Unknown message type:',
          (exhaustive as { type: string }).type
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// On startup: push cached token to UI so it can restore auth state.
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const token = await getCachedAuthToken()
  postToUI({ type: 'AUTH_TOKEN_RESULT', token })
  const tokens = await getCachedOAuthTokens()
  postToUI({ type: 'OAUTH_TOKENS_RESULT', tokens })
  const refreshToken = await getCachedRefreshToken()
  postToUI({ type: 'REFRESH_TOKEN_RESULT', refreshToken })
}

// ---------------------------------------------------------------------------
// Entry point — create-figma-plugin calls the default export.
// ---------------------------------------------------------------------------

export default function (): void {
  showUI({ width: 360, height: 560, themeColors: true })
  setupMessageHandler()
  init()
}
