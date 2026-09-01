import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EntryDoc } from '../types/index'

// Returns the most recent revealed entry that shares today's MM-DD from a prior year.
export function useOnThisDay(pairId: string | null): EntryDoc | null {
  const [entry, setEntry] = useState<EntryDoc | null>(null)

  useEffect(() => {
    if (!pairId) { setEntry(null); return }

    const today = new Date()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const currentYear = today.getFullYear()

    let cancelled = false

    // Check up to 5 years back, stop at first revealed hit
    ;(async () => {
      for (let y = 1; y <= 5; y++) {
        const dateStr = `${currentYear - y}-${mm}-${dd}`
        const snap = await getDoc(doc(db, `pairs/${pairId}/entries/${dateStr}`))
        if (cancelled) return
        if (snap.exists() && snap.data()?.status === 'revealed') {
          setEntry(snap.data() as EntryDoc)
          return
        }
      }
      setEntry(null)
    })()

    return () => { cancelled = true }
  }, [pairId])

  return entry
}
