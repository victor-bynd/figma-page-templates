import { useCallback, useEffect, useState } from 'preact/hooks'
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import { getDb } from '@backend/db'
import { sendMessage } from '../App'
import type { Template } from '@shared/types'

const cacheKey = (orgId: string) => `templates_cache_${orgId}`

function readCache(orgId: string): Template[] {
  try {
    const raw = localStorage.getItem(cacheKey(orgId))
    if (!raw) return []
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map(t => ({
      ...(t as unknown as Template),
      createdAt: t.createdAt ? new Date(t.createdAt as string) : null,
      updatedAt: t.updatedAt ? new Date(t.updatedAt as string) : null
    }))
  } catch {
    return []
  }
}

function writeCache(orgId: string, templates: Template[]): void {
  try {
    localStorage.setItem(cacheKey(orgId), JSON.stringify(templates))
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function useTemplates(mode: 'firestore' | 'local', orgId: string) {
  const [templates, setTemplates] = useState<Template[]>(() =>
    mode === 'local' ? [] : readCache(orgId)
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    sendMessage({ type: 'GET_LOCAL_TEMPLATES' })
  }, [])

  useEffect(() => {
    // Clear stale data from the previous mode/org before loading new ones.
    setTemplates(mode === 'local' ? [] : readCache(orgId))

    if (mode === 'local') {
      setLoading(true)
      sendMessage({ type: 'GET_LOCAL_TEMPLATES' })

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage
        if (!msg || msg.type !== 'LOCAL_TEMPLATES_RESULT') return
        setTemplates(msg.templates)
        setLoading(false)
        setError(null)
      }

      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }

    if (!orgId) {
      // Avoid invalid Firestore paths while auth/org is still loading.
      setLoading(true)
      setError(null)
      return
    }

    // Firestore mode
    const db = getDb()
    const q = query(
      collection(db, 'orgs', orgId, 'templates'),
      orderBy('updatedAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const result: Template[] = snapshot.docs.map(doc => {
          const d = doc.data()
          return {
            id: doc.id,
            name: d.name ?? '',
            description: d.description ?? '',
            pages: d.pages ?? [],
            coverPageIndex:
              typeof d.coverPageIndex === 'number' && Number.isInteger(d.coverPageIndex)
                ? d.coverPageIndex
                : null,
            coverConfig: d.coverConfig ?? null,
            groupId: d.groupId ?? null,
            createdBy: d.createdBy ?? '',
            createdByEmail: d.createdByEmail ?? '',
            createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
            updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null
          }
        })
        setTemplates(result)
        setLoading(false)
        setError(null)
        writeCache(orgId, result)
      },
      err => {
        console.error('[useTemplates] snapshot error', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [mode, orgId])

  return { templates, loading, error, refresh }
}
