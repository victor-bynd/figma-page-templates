import { useEffect, useState } from 'preact/hooks'
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import { getDb } from '@backend/db'
import { sendMessage } from '../App'
import type { TemplateGroup } from '@shared/types'

export function useGroups(mode: 'firestore' | 'local', orgId: string) {
  const [groups, setGroups] = useState<TemplateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Clear stale groups from the previous mode/org before loading new ones.
    setGroups([])

    if (mode === 'local') {
      setLoading(true)
      sendMessage({ type: 'GET_LOCAL_GROUPS' })

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage
        if (!msg || msg.type !== 'LOCAL_GROUPS_RESULT') return
        setGroups(msg.groups)
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
      collection(db, 'orgs', orgId, 'groups'),
      orderBy('order', 'asc')
    )

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const result: TemplateGroup[] = snapshot.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            name: data.name ?? '',
            order: data.order ?? 0,
            createdBy: data.createdBy ?? '',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null
          }
        })
        setGroups(result)
        setLoading(false)
        setError(null)
      },
      err => {
        console.error('[useGroups] snapshot error', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [mode, orgId])

  return { groups, loading, error }
}
