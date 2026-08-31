import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

interface StreakState {
  myStreak: number      // consecutive days I missed submitting
  partnerStreak: number // consecutive days partner missed submitting
}

function getPastDates(n: number): string[] {
  const dates: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toLocaleDateString('en-CA'))
  }
  return dates
}

export function useStreak(
  pairId: string | null,
  myUid: string | null,
  partnerUid: string | null,
): StreakState {
  const [streaks, setStreaks] = useState<StreakState>({ myStreak: 0, partnerStreak: 0 })

  useEffect(() => {
    if (!pairId || !myUid) return

    const pastDates = getPastDates(7)
    const cutoff = pastDates[pastDates.length - 1] // 7 days ago

    const q = query(
      collection(db, `pairs/${pairId}/entries`),
      where('date', '>=', cutoff),
      where('date', '<', pastDates[0]), // exclude today
    )

    getDocs(q)
      .then((snap) => {
        const entryMap = new Map<string, string[]>()
        snap.docs.forEach((d) => {
          const data = d.data()
          entryMap.set(data.date as string, data.submittedMembers as string[] ?? [])
        })

        let myStreak = 0
        let partnerStreak = 0

        for (const date of pastDates) {
          const members = entryMap.get(date) ?? []
          if (!members.includes(myUid)) myStreak++
          else break
        }

        if (partnerUid) {
          for (const date of pastDates) {
            const members = entryMap.get(date) ?? []
            if (!members.includes(partnerUid)) partnerStreak++
            else break
          }
        }

        setStreaks({ myStreak, partnerStreak })
      })
      .catch((err) => console.error('[useStreak] error:', err))
  }, [pairId, myUid, partnerUid])

  return streaks
}
