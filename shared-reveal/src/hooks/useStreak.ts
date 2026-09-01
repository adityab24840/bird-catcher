import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

interface StreakState {
  myStreak: number
  partnerStreak: number
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

    Promise.all([
      getDoc(doc(db, 'pairs', pairId)),
      getDocs(
        query(
          collection(db, `pairs/${pairId}/entries`),
          where('date', '>=', pastDates[pastDates.length - 1]),
          where('date', '<', pastDates[0]),
        )
      ),
    ])
      .then(([pairSnap, entriesSnap]) => {
        // Pair creation date — don't count days before the pair existed
        const pairCreatedDate: string = pairSnap.exists()
          ? pairSnap.data().createdAt.toDate().toLocaleDateString('en-CA')
          : pastDates[0]

        const entryMap = new Map<string, string[]>()
        entriesSnap.docs.forEach((d) => {
          const data = d.data()
          entryMap.set(data.date as string, data.submittedMembers as string[] ?? [])
        })

        let myStreak = 0
        let partnerStreak = 0

        for (const date of pastDates) {
          // Stop counting once we reach the pair creation date or earlier
          if (date <= pairCreatedDate) break
          const members = entryMap.get(date) ?? []
          if (!members.includes(myUid)) myStreak++
          else break
        }

        if (partnerUid) {
          for (const date of pastDates) {
            if (date <= pairCreatedDate) break
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

export function useRevealedStreak(pairId: string | null): number {
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (!pairId) { setStreak(0); return }
    getDocs(
      query(collection(db, `pairs/${pairId}/entries`), orderBy('date', 'desc'), limit(90))
    ).then(snap => {
      const revealed = new Set(
        snap.docs.filter(d => d.data().status === 'revealed').map(d => d.data().date as string)
      )
      let count = 0
      const d = new Date()
      for (let i = 0; i < 90; i++) {
        const dateStr = d.toLocaleDateString('en-CA')
        if (revealed.has(dateStr)) { count++; d.setDate(d.getDate() - 1) }
        else { break }
      }
      setStreak(count)
    }).catch(() => {})
  }, [pairId])

  return streak
}
