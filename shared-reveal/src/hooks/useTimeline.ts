import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
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

    // No orderBy — avoids composite index requirement. Sort client-side (max 20 docs).
    const q = query(
      collection(db, `pairs/${pairId}/entries`),
      where('status', '==', 'revealed'),
      limit(20)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => d.data() as EntryDoc)
          .sort((a, b) => b.date.localeCompare(a.date))
        setEntries(sorted)
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
