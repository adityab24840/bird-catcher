import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EntryDoc } from '../types/index'

interface EntryState {
  entryDoc: EntryDoc | null
  entryLoading: boolean
}

export function useEntry(pairId: string | null, entryDate: string): EntryState {
  const [entryDoc, setEntryDoc] = useState<EntryDoc | null>(null)
  const [entryLoading, setEntryLoading] = useState(true)

  useEffect(() => {
    if (!pairId || !entryDate) {
      setEntryDoc(null)
      setEntryLoading(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, `pairs/${pairId}/entries`, entryDate),
      (snap) => {
        setEntryDoc(snap.exists() ? (snap.data() as EntryDoc) : null)
        setEntryLoading(false)
      },
      (err) => {
        console.error('[useEntry] listener error:', err)
        setEntryLoading(false)
      }
    )

    return () => unsub()
  }, [pairId, entryDate])

  return { entryDoc, entryLoading }
}
