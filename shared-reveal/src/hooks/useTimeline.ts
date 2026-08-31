import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EntryDoc } from '../types/index'

interface TimelineState {
  entries: EntryDoc[]
  loading: boolean
}

export function useTimeline(pairId: string | null): TimelineState {
  const [entries, setEntries] = useState<EntryDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pairId) {
      setEntries([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, `pairs/${pairId}/entries`),
      where('status', '==', 'revealed'),
      orderBy('date', 'desc'),
      limit(20)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => d.data() as EntryDoc))
        setLoading(false)
      },
      (err) => {
        console.error('[useTimeline] error:', err)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [pairId])

  return { entries, loading }
}
