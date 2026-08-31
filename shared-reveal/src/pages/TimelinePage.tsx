import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useTimeline } from '../hooks/useTimeline'
import { usePairId } from '../hooks/usePair'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc, UserDoc } from '../types/index'

function Avatar({ photoURL, name }: { photoURL: string | null; name: string | null }) {
  if (photoURL)
    return <img src={photoURL} alt={name ?? ''} className="h-8 w-8 rounded-full object-cover" />
  return (
    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-500 text-xs">
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function SubmissionCard({ sub, member }: { sub: SubmissionDoc; member: UserDoc | undefined }) {
  const timeLabel = sub.submittedAt
    ? sub.submittedAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : ''

  // Merge v1 (singular) and v2 (array) fields for backward compat
  const photos = sub.photoURLs?.length
    ? sub.photoURLs
    : sub.photoURL ? [sub.photoURL] : []
  const texts = sub.texts?.length
    ? sub.texts
    : sub.text ? [sub.text] : []
  const hasContent = photos.length > 0 || texts.length > 0

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {member?.displayName?.split(' ')[0] ?? '…'}
          </p>
          <p className="text-[11px] text-gray-400">{timeLabel}</p>
        </div>
      </div>

      {/* All photos */}
      {photos.map((url, i) => (
        <img
          key={i}
          src={url}
          alt="submission"
          className="w-full object-cover"
          style={{ maxHeight: 340 }}
        />
      ))}

      {/* All texts */}
      {texts.map((t, i) => (
        <p key={i} className="px-4 py-3.5 text-[15px] text-gray-800 leading-relaxed border-t border-gray-50 first:border-0">
          {t}
        </p>
      ))}

      {!hasContent && (
        <p className="px-4 py-3 text-sm text-gray-300 italic">Nothing shared</p>
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
          })
      )
    ).then((results) => setSubmissions(results.filter((s): s is SubmissionDoc => s !== null)))
  }, [pairId, entry.date, memberDocs])

  const date = new Date(entry.date + 'T12:00:00')
  const isToday = entry.date === new Date().toLocaleDateString('en-CA')
  const dateLabel = isToday
    ? 'Today'
    : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-3">
      {/* Date chip */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-semibold text-gray-400 shrink-0">{dateLabel}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {subError && (
        <p className="text-xs text-red-400 text-center">{subError}</p>
      )}

      {submissions.length === 0 && !subError ? (
        <div className="space-y-3">
          <div className="h-28 rounded-3xl bg-gray-100 animate-pulse" />
          <div className="h-28 rounded-3xl bg-gray-100 animate-pulse" />
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

export default function TimelinePage() {
  const { user } = useAuth()
  const { pairId } = usePairId(user?.uid ?? null)
  const { entries, loading, error } = useTimeline(pairId)
  const navigate = useNavigate()

  const [memberDocs, setMemberDocs] = useState<Record<string, UserDoc>>({})

  useEffect(() => {
    if (!pairId || !user) return
    const unsubscribers: (() => void)[] = []

    const listenToUser = (uid: string) => {
      const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) setMemberDocs((prev) => ({ ...prev, [uid]: snap.data() as UserDoc }))
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
    <div className="flex flex-col min-h-screen" style={{ background: '#F7F5F2' }}>
      {/* Top bar */}
      <header className="flex items-center gap-3 px-5 pt-12 pb-4 shrink-0 bg-transparent">
        <button onClick={() => navigate('/home')} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Back">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Timeline</h1>
      </header>

      <main className="flex-1 px-4 pb-6 overflow-y-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-7 w-7 rounded-full border-2 border-purple-200 border-t-purple-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
            <p className="text-sm text-red-400 font-mono break-all">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="text-4xl">🌙</div>
            <p className="text-gray-500 font-medium">Nothing here yet</p>
            <p className="text-sm text-gray-400">Entries appear once both of you share</p>
          </div>
        ) : (
          <div className="space-y-8 pb-4">
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

      {/* Bottom tab bar */}
      <nav className="shrink-0 border-t border-gray-200/60 flex pb-8 bg-white">
        <button onClick={() => navigate('/home')} className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-gray-300">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-medium">Today</span>
        </button>
        <button onClick={() => navigate('/timeline')} className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-purple-500">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium">Timeline</span>
        </button>
      </nav>
    </div>
  )
}
