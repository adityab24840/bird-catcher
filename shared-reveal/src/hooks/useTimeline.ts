import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EntryDoc } from '../types/index'

interface TimelineState {
  entries: EntryDoc[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useTimeline(pairId: string | null): TimelineState {
  const [entries, setEntries] = useState<EntryDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!pairId) {
      setEntries([])
      setLoading(false)
      return
    }

    console.log('[useTimeline] subscribing for pairId:', pairId)
    // Include one_submitted so today's pending entry shows in timeline.
    // No orderBy — avoids composite index requirement. Sort client-side (max 20 docs).
    const q = query(
      collection(db, `pairs/${pairId}/entries`),
      where('status', 'in', ['revealed', 'one_submitted']),
      limit(20)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log('[useTimeline] snapshot docs:', snap.docs.length, snap.docs.map(d => d.id + '/' + d.data().status))
        const sorted = snap.docs
          .map((d) => d.data() as EntryDoc)
          .sort((a, b) => b.date.localeCompare(a.date))
        setEntries(sorted)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('[useTimeline] error:', err)
        setError(err.message ?? 'Query failed')
        setLoading(false)
      }
    )

    return () => unsub()
  }, [pairId, tick])

  return { entries, loading, error, refresh: () => setTick(t => t + 1) }
}
