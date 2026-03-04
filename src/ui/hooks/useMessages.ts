import { useEffect } from 'preact/hooks'
import type { UIMessage } from '@shared/messages'
import { pushToast } from '../components/Toast'

const ERROR_COPY: Record<string, string> = {
  COMPONENT_NOT_PUBLISHED:
    'Component not found. Make sure it is published in the library.',
  FONT_LOAD_FAILED:
    'One or more fonts failed to load. Check font availability and try again.',
  PAGE_EXISTS:
    'One or more pages already exist and were skipped.',
  APPLY_FAILED:
    'Could not apply the template. Please try again.'
}

export function useMessages(onMessage: (message: UIMessage) => void): void {
  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const message = event.data?.pluginMessage as UIMessage | undefined
      if (!message) return

      if (message.type === 'ERROR') {
        const friendly = ERROR_COPY[message.code] ?? 'Something went wrong.'
        pushToast(friendly, 'error')
      }

      onMessage(message)
    }

    return () => {
      window.onmessage = null
    }
  }, [onMessage])
}
