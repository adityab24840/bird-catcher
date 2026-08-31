import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'

interface PairState {
  pairId: string | null
  pairLoading: boolean
}

export function usePairId(uid: string | null): PairState {
  const [pairId, setPairId] = useState<string | null>(null)
  const [pairLoading, setPairLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setPairId(null)
      setPairLoading(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as UserDoc) : null
        setPairId(data?.pairId ?? null)
        setPairLoading(false)
      },
      (err) => {
        console.error('[usePairId] listener error:', err)
        setPairLoading(false)
      },
    )

    return () => unsub()
  }, [uid])

  return { pairId, pairLoading }
}
