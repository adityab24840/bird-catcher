import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useTimeline } from '../hooks/useTimeline'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { usePairId } from '../hooks/usePair'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc, UserDoc } from '../types/index'

function Avatar({ photoURL, name }: { photoURL: string | null; name: string | null }) {
  if (photoURL)
    return <img src={photoURL} alt={name ?? ''} className="h-8 w-8 rounded-full object-cover" />
  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs"
      style={{ background: '#E8F0E9', color: '#2D5A3D' }}
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function SubmissionCard({
  sub,
  member,
}: {
  sub: SubmissionDoc
  member: UserDoc | undefined
}) {
  const timeLabel = sub.submittedAt
    ? sub.submittedAt
        .toDate()
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : ''

  const photos = sub.photoURLs?.length
    ? sub.photoURLs
    : sub.photoURL
    ? [sub.photoURL]
    : []
  const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []
  const hasContent = photos.length > 0 || texts.length > 0

  return (
    <div
      className="bg-white rounded-xl overflow-hidden border animate-fadeIn"
      style={{ borderColor: '#E8E2D4' }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 border-b"
        style={{ borderColor: '#F0EBE0' }}
      >
        <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
        <div>
          <p className="text-sm font-semibold leading-tight" style={{ color: '#1A1A16' }}>
            {member?.displayName?.split(' ')[0] ?? '…'}
          </p>
          <p
            className="text-[10px] tracking-[0.1em] uppercase mt-0.5"
            style={{ color: '#7A7268' }}
          >
            {timeLabel}
          </p>
        </div>
      </div>

      {/* Photos */}
      {photos.map((url, i) => (
        <img
          key={i}
          src={url}
          alt="submission"
          className="w-full object-cover border-b"
          style={{ maxHeight: 320, borderColor: '#F0EBE0' }}
        />
      ))}

      {/* Texts */}
      {texts.map((t, i) => (
        <p
          key={i}
          className="px-4 py-3.5 text-[15px] leading-relaxed border-b last:border-0"
          style={{ color: '#1A1A16', borderColor: '#F0EBE0' }}
        >
          {t}
        </p>
      ))}

      {!hasContent && (
        <p className="px-4 py-3 text-sm italic" style={{ color: '#C9BFA8' }}>
          Nothing shared
        </p>
      )}
    </div>
  )
}

function DaySection({
  entry,
  pairId,
  memberDocs,
}: {
  entry: EntryDoc
  pairId: string
  memberDocs: Record<string, UserDoc>
}) {
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([])
  const [subError, setSubError] = useState<string | null>(null)

  useEffect(() => {
    const memberUids = Object.keys(memberDocs)
    if (!memberUids.length) return

    Promise.all(
      memberUids.map((uid) =>
        getDoc(doc(db, `pairs/${pairId}/entries/${entry.date}/submissions/${uid}`))
          .then((snap) => (snap.exists() ? (snap.data() as SubmissionDoc) : null))
          .catch((err) => {
            setSubError(err.message ?? 'Permission denied')
            return null
          }),
      ),
    ).then((results) =>
      setSubmissions(results.filter((s): s is SubmissionDoc => s !== null)),
    )
  }, [pairId, entry.date, memberDocs])

  const date = new Date(entry.date + 'T12:00:00')
  const isToday = entry.date === new Date().toLocaleDateString('en-CA')
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const year = date.getFullYear()
  const dateLabel = isToday ? 'Today' : `${day} ${month} ${year}`

  return (
    <div className="space-y-3 animate-fadeUp">
      {/* Date separator */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
        <span
          className="text-[10px] tracking-[0.2em] uppercase font-semibold shrink-0"
          style={{ color: '#7A7268' }}
        >
          {dateLabel}
        </span>
        <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
      </div>

      {subError && (
        <p className="text-xs text-center" style={{ color: '#B85C38' }}>
          {subError}
        </p>
      )}

      {submissions.length === 0 && !subError ? (
        <div className="space-y-3">
          <div className="h-28 rounded-xl animate-pulse" style={{ background: '#E8E2D4' }} />
          <div className="h-28 rounded-xl animate-pulse" style={{ background: '#E8E2D4' }} />
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <SubmissionCard key={sub.uid} sub={sub} member={memberDocs[sub.uid]} />
          ))}
        </div>
      )}
    </div>
  )
}

function CalendarView({
  entries,
  onSelectDate,
  selectedDate,
  calMonth,
  setCalMonth,
  pairId,
  memberDocs,
}: {
  entries: EntryDoc[]
  onSelectDate: (date: string) => void
  selectedDate: string | null
  calMonth: Date
  setCalMonth: React.Dispatch<React.SetStateAction<Date>>
  pairId: string
  memberDocs: Record<string, UserDoc>
}) {
  const entryDates = new Set(entries.map((e) => e.date))

  const monthLabel = calMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1)
  const lastDay = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0)
  const startDow = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const today = new Date().toLocaleDateString('en-CA')

  const selectedEntry = selectedDate ? entries.find((e) => e.date === selectedDate) : null

  return (
    <div className="px-4 pt-2">
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }
          className="px-3 py-1.5 text-lg leading-none"
          style={{ color: '#7A7268' }}
        >
          ‹
        </button>
        <p
          className="text-xs tracking-[0.2em] uppercase font-semibold"
          style={{ color: '#1A1A16' }}
        >
          {monthLabel}
        </p>
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }
          className="px-3 py-1.5 text-lg leading-none"
          style={{ color: '#7A7268' }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] tracking-widest uppercase py-1"
            style={{ color: '#7A7268' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty offset cells */}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`e${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasEntry = entryDates.has(dateStr)
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate

          let bg = 'transparent'
          let color = '#7A7268'
          let fontWeight: React.CSSProperties['fontWeight'] = 'normal'
          let border = 'none'

          if (isSelected) {
            bg = '#2D5A3D'
            color = '#FFFFFF'
            fontWeight = 600
          } else if (hasEntry) {
            bg = '#E8F0E9'
            color = '#2D5A3D'
            fontWeight = 600
          } else if (isToday) {
            border = '1px solid #C9BFA8'
            color = '#1A1A16'
          }

          return (
            <button
              key={day}
              onClick={() => hasEntry ? onSelectDate(dateStr) : undefined}
              className="aspect-square flex items-center justify-center text-sm rounded-lg mx-0.5 transition-all"
              style={{ background: bg, color, fontWeight, border }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Selected date entry */}
      {selectedDate && entryDates.has(selectedDate) && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
            <span
              className="text-[10px] tracking-[0.2em] uppercase text-center font-semibold shrink-0"
              style={{ color: '#7A7268' }}
            >
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
          </div>
          {selectedEntry && (
            <DaySection entry={selectedEntry} pairId={pairId} memberDocs={memberDocs} />
          )}
        </div>
      )}
    </div>
  )
}

export default function TimelinePage() {
  const { user } = useAuth()
  const { pairId } = usePairId(user?.uid ?? null)
  const { entries, loading, error, refresh } = useTimeline(pairId)
  const navigate = useNavigate()
  const { pulling, distance } = usePullToRefresh(refresh)

  const [memberDocs, setMemberDocs] = useState<Record<string, UserDoc>>({})
  const [view, setView] = useState<'journal' | 'calendar'>('journal')
  const [calMonth, setCalMonth] = useState<Date>(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!pairId || !user) return
    const unsubscribers: (() => void)[] = []

    const listenToUser = (uid: string) => {
      const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists())
          setMemberDocs((prev) => ({ ...prev, [uid]: snap.data() as UserDoc }))
      })
      unsubscribers.push(unsub)
    }

    listenToUser(user.uid)

    const pairUnsub = onSnapshot(doc(db, 'pairs', pairId), (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      members.forEach((uid) => {
        if (uid === user.uid) return
        listenToUser(uid)
      })
    })
    unsubscribers.push(pairUnsub)

    return () => unsubscribers.forEach((u) => u())
  }, [pairId, user])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0"
        style={{ background: '#F2EDE4' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="transition-colors"
            style={{ color: '#7A7268' }}
            aria-label="Back"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path
                d="M15 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p
            className="text-xs tracking-[0.3em] font-bold uppercase"
            style={{ color: '#1A1A16' }}
          >
            Timeline
          </p>
        </div>

        {/* View toggle */}
        <button
          onClick={() => setView((v) => (v === 'journal' ? 'calendar' : 'journal'))}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border transition-all"
          style={{
            background: view === 'calendar' ? '#2D5A3D' : 'transparent',
            borderColor: view === 'calendar' ? '#2D5A3D' : '#C9BFA8',
          }}
        >
          {view === 'journal' ? (
            /* Calendar icon — shown when in journal mode (clicking switches to calendar) */
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="#1A1A16" strokeWidth="1.8" />
              <path d="M3 9h18" stroke="#1A1A16" strokeWidth="1.8" />
              <path d="M8 2v4M16 2v4" stroke="#1A1A16" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            /* Journal icon — shown when in calendar mode (clicking switches to journal) */
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
                stroke="#FFFFFF"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
          <span
            className="text-[10px] tracking-[0.15em] uppercase font-semibold"
            style={{ color: view === 'calendar' ? '#FFFFFF' : '#1A1A16' }}
          >
            {view === 'journal' ? 'Calendar' : 'Journal'}
          </span>
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-6">
        {pulling && (
          <div
            className="flex justify-center py-2 transition-all"
            style={{ opacity: Math.min(distance / 64, 1) }}
          >
            <div className="h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2D5A3D', borderTopColor: 'transparent' }} />
          </div>
        )}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div
              className="h-7 w-7 rounded-full border-2 animate-spin"
              style={{ borderColor: '#E8F0E9', borderTopColor: '#2D5A3D' }}
            />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
            <p className="text-sm font-mono break-all" style={{ color: '#B85C38' }}>
              {error}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <p className="text-4xl">🪺</p>
            <p className="font-medium text-sm" style={{ color: '#1A1A16' }}>
              Nothing here yet
            </p>
            <p className="text-sm" style={{ color: '#7A7268' }}>
              Entries appear once both of you share
            </p>
          </div>
        ) : view === 'calendar' ? (
          <CalendarView
            entries={entries}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            pairId={pairId!}
            memberDocs={memberDocs}
          />
        ) : (
          /* Journal view */
          <div className="space-y-8 px-4 pt-2 pb-4">
            {entries.map((entry) => (
              <DaySection
                key={entry.date}
                entry={entry}
                pairId={pairId!}
                memberDocs={memberDocs}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav
        className="shrink-0 flex pb-8"
        style={{ background: '#1C2B1E' }}
      >
        <button
          onClick={() => navigate('/home')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#4A5C4A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path
              d="M3 12L12 3l9 9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Today</span>
        </button>
        <button
          onClick={() => navigate('/timeline')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#8FAF8A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <rect
              x="3"
              y="4"
              width="18"
              height="18"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M8 2v4M16 2v4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Timeline</span>
        </button>
      </nav>
    </div>
  )
}
