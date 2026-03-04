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
import { cacheAuthToken, getCachedAuthToken, savePAT, getPAT, clearPAT } from './storage'
import { showUI } from '@create-figma-plugin/utilities'

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
    applyTemplate(msg.pages)
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

async function handlePlaceCover(componentKey: string) {
  try {
    const page = createCoverPage()
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
    // 1. Text overrides
    await applyTextOverrides(currentCoverInstance, msg.overrides)

    // 2. Image swap (optional)
    if (msg.imageBytes) {
      swapCoverImage(currentCoverInstance, msg.imageBytes)
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
        await handlePlaceCover(message.componentKey)
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
}

// ---------------------------------------------------------------------------
// Entry point — create-figma-plugin calls the default export.
// ---------------------------------------------------------------------------

export default function (): void {
  showUI({ width: 360, height: 560, themeColors: true })
  setupMessageHandler()
  init()
}
