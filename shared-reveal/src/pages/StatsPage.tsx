import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, getDoc, query, where } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, PairDoc, SubmissionDoc, UserDoc } from '../types/index'

const MOOD_LABELS: Record<string, { emoji: string; label: string }> = {
  happy:         { emoji: '😊', label: 'happy' },
  'missing-you': { emoji: '💭', label: 'missing you' },
  proud:         { emoji: '🌟', label: 'proud' },
  random:        { emoji: '🍃', label: 'random' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : (value / max) * 100
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <div className="relative w-full flex items-end justify-center" style={{ height: 60 }}>
        <div
          className="w-full rounded-t-sm transition-all"
          style={{ height: `${pct}%`, background: color, minHeight: value > 0 ? 4 : 0 }}
        />
      </div>
      <span className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>{value}</span>
    </div>
  )
}

export default function StatsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pairDoc, setPairDoc] = useState<PairDoc | null>(null)
  const [memberDocs, setMemberDocs] = useState<Record<string, UserDoc>>({})
  const [entries, setEntries] = useState<EntryDoc[]>([])
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([])

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const userSnap = await getDoc(doc(db, 'users', user!.uid))
        if (!userSnap.exists()) throw new Error('No user doc')
        const pairId: string | null = userSnap.data().pairId ?? null
        if (!pairId) { setError('Not in a pair'); setLoading(false); return }

        const [pairSnap, entriesSnap] = await Promise.all([
          getDoc(doc(db, 'pairs', pairId)),
          getDocs(query(collection(db, 'pairs', pairId, 'entries'), where('status', '==', 'revealed'))),
        ])

        if (!pairSnap.exists()) throw new Error('Pair not found')
        const pair = pairSnap.data() as PairDoc
        setPairDoc(pair)

        const memberIds: string[] = pair.members ?? []
        const mDocs: Record<string, UserDoc> = {}
        await Promise.all(memberIds.map(async (uid) => {
          const s = await getDoc(doc(db, 'users', uid))
          if (s.exists()) mDocs[uid] = s.data() as UserDoc
        }))
        setMemberDocs(mDocs)

        const entryList = entriesSnap.docs.map((d) => d.data() as EntryDoc)
        setEntries(entryList)

        // Load all submissions for revealed entries — silently skip any that fail rules
        const allSubs: SubmissionDoc[] = []
        await Promise.all(entryList.map(async (entry) => {
          try {
            const subsSnap = await getDocs(collection(db, 'pairs', pairId, 'entries', entry.date, 'submissions'))
            subsSnap.docs.forEach((d) => allSubs.push(d.data() as SubmissionDoc))
          } catch { /* partner submission may not be readable — skip */ }
        }))
        setSubmissions(allSubs)
        setLoading(false)
      } catch (e) {
        console.error('[StatsPage]', e)
        setError('Failed to load stats')
        setLoading(false)
      }
    }
    load()
  }, [user])

  const stats = useMemo(() => {
    if (!entries.length) return null
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    const totalReveals = sorted.length
    const firstDate = sorted[0].date
    const lastDate = sorted[sorted.length - 1].date

    // Streak calculation
    let currentStreak = 0, longestStreak = 0, streak = 0
    const revealedDates = new Set(sorted.map((e) => e.date))
    const today = new Date().toLocaleDateString('en-CA')
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
    let cursor = revealedDates.has(today) ? today : yesterday
    while (revealedDates.has(cursor)) {
      currentStreak++
      const prev = new Date(cursor + 'T12:00:00')
      prev.setDate(prev.getDate() - 1)
      cursor = prev.toLocaleDateString('en-CA')
    }
    for (const entry of sorted) {
      const prev = new Date(entry.date + 'T12:00:00')
      prev.setDate(prev.getDate() - 1)
      const prevStr = prev.toLocaleDateString('en-CA')
      streak = revealedDates.has(prevStr) ? streak + 1 : 1
      if (streak > longestStreak) longestStreak = streak
    }

    // Mood distribution per person
    const moodByUid: Record<string, Record<string, number>> = {}
    for (const sub of submissions) {
      if (!sub.mood) continue
      if (!moodByUid[sub.uid]) moodByUid[sub.uid] = {}
      moodByUid[sub.uid][sub.mood] = (moodByUid[sub.uid][sub.mood] ?? 0) + 1
    }

    // Day-of-week distribution
    const dowCounts = Array(7).fill(0)
    for (const e of sorted) {
      const dow = new Date(e.date + 'T12:00:00').getDay()
      dowCounts[dow]++
    }

    // Per-person reveal counts
    const perMember: Record<string, number> = {}
    for (const e of entries) {
      for (const uid of (e.submittedMembers ?? [])) {
        perMember[uid] = (perMember[uid] ?? 0) + 1
      }
    }

    // Photo, voice, song counts from submissions
    const mediaCount = submissions.reduce(
      (acc, s) => ({
        photos: acc.photos + (s.photoURLs?.length ?? 0) + (s.photoURL ? 1 : 0),
        voice: acc.voice + (s.audioURLs?.length ?? 0),
        songs: acc.songs + (s.songURL ? 1 : 0),
        sketches: acc.sketches + (s.sketchURL ? 1 : 0),
      }),
      { photos: 0, voice: 0, songs: 0, sketches: 0 }
    )

    return { totalReveals, firstDate, lastDate, currentStreak, longestStreak, moodByUid, dowCounts, perMember, mediaCount }
  }, [entries, submissions])

  const daysSinceStart = pairDoc?.createdAt
    ? Math.max(1, Math.floor((Date.now() - pairDoc.createdAt.toMillis()) / 86400000))
    : null

  return (
    <div className="min-h-screen animate-fadeUp" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <header
        className="px-5 pt-12 pb-4 flex items-center justify-between"
        style={{ background: 'var(--c-bg)' }}
      >
        <button onClick={() => navigate(-1)} className="text-sm font-medium" style={{ color: 'var(--c-green)' }}>
          ← Back
        </button>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: 'var(--c-text-2)' }}>
          Your Stats
        </span>
        <div className="w-10" />
      </header>

      <div className="px-5 pb-20 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <div className="h-7 w-7 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--c-green-light)', borderTopColor: 'var(--c-green)' }} />
          </div>
        ) : error ? (
          <p className="text-center pt-32 text-sm" style={{ color: 'var(--c-accent)' }}>{error}</p>
        ) : !stats ? (
          <div className="text-center pt-32">
            <p className="text-4xl mb-3">🌱</p>
            <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>No reveals yet — come back once you've shared a few days.</p>
          </div>
        ) : (
          <>
            {/* Top numbers */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Reveals', value: stats.totalReveals },
                { label: 'Streak', value: `${stats.currentStreak}🔥` },
                { label: 'Best', value: `${stats.longestStreak}🏆` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl px-3 py-4 text-center"
                  style={{ background: 'var(--c-bg-card)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>{value}</p>
                  <p className="text-[10px] tracking-[0.12em] uppercase mt-1" style={{ color: 'var(--c-text-3)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Days together */}
            {daysSinceStart && (
              <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{ background: 'var(--c-green-light)', border: '1px solid var(--c-green-mid)' }}>
                <span className="text-2xl">🌿</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-green)' }}>
                    Day {daysSinceStart} together
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                    {stats.totalReveals} of those had a reveal
                    {daysSinceStart > 0 ? ` — ${Math.round((stats.totalReveals / daysSinceStart) * 100)}% hit rate` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Media counts */}
            <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--c-bg-card)' }}>
              <p className="text-[10px] tracking-[0.15em] uppercase font-bold mb-4" style={{ color: 'var(--c-text-3)' }}>
                What you've shared
              </p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { emoji: '📷', label: 'Photos', count: stats.mediaCount.photos },
                  { emoji: '🎙️', label: 'Voice', count: stats.mediaCount.voice },
                  { emoji: '🎵', label: 'Songs', count: stats.mediaCount.songs },
                  { emoji: '✏️', label: 'Sketches', count: stats.mediaCount.sketches },
                ].map(({ emoji, label, count }) => (
                  <div key={label} className="text-center">
                    <p className="text-xl mb-1">{emoji}</p>
                    <p className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>{count}</p>
                    <p className="text-[9px]" style={{ color: 'var(--c-text-3)' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Day of week */}
            <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--c-bg-card)' }}>
              <p className="text-[10px] tracking-[0.15em] uppercase font-bold mb-4" style={{ color: 'var(--c-text-3)' }}>
                Most active day
              </p>
              <div className="flex items-end gap-1.5">
                {stats.dowCounts.map((count, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <Bar value={count} max={Math.max(...stats.dowCounts)} color="var(--c-green)" />
                    <span className="text-[9px]" style={{ color: 'var(--c-text-3)' }}>{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mood per person */}
            {Object.entries(stats.moodByUid).map(([uid, moods]) => {
              const name = memberDocs[uid]?.displayName?.split(' ')[0] ?? '…'
              const totalMoods = Object.values(moods).reduce((a, b) => a + b, 0)
              return (
                <div key={uid} className="rounded-2xl px-5 py-4" style={{ background: 'var(--c-bg-card)' }}>
                  <p className="text-[10px] tracking-[0.15em] uppercase font-bold mb-4" style={{ color: 'var(--c-text-3)' }}>
                    {name}'s mood
                  </p>
                  <div className="space-y-2.5">
                    {Object.entries(moods).sort((a, b) => b[1] - a[1]).map(([mood, count]) => {
                      const { emoji, label } = MOOD_LABELS[mood] ?? { emoji: '🍃', label: mood }
                      const pct = Math.round((count / totalMoods) * 100)
                      return (
                        <div key={mood} className="flex items-center gap-3">
                          <span className="text-lg w-6">{emoji}</span>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>{label}</span>
                              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--c-green)' }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Timeline span */}
            <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--c-bg-card)' }}>
              <p className="text-[10px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: 'var(--c-text-3)' }}>
                Timeline
              </p>
              <div className="flex gap-6">
                <div>
                  <p className="text-[10px] uppercase" style={{ color: 'var(--c-text-3)' }}>First reveal</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--c-text-1)' }}>
                    {new Date(stats.firstDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase" style={{ color: 'var(--c-text-3)' }}>Latest reveal</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--c-text-1)' }}>
                    {new Date(stats.lastDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
