import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useTimeline } from '../hooks/useTimeline'
import { usePairId } from '../hooks/usePair'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc, UserDoc } from '../types/index'

function Avatar({
  photoURL,
  name,
  size = 'sm',
}: {
  photoURL: string | null
  name: string | null
  size?: 'sm' | 'md'
}) {
  const dims = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
  if (photoURL) return <img src={photoURL} alt={name ?? ''} className={`${dims} rounded-full object-cover`} />
  return (
    <div className={`${dims} rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-500`}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function TimelineCard({
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
            console.error(`[TimelineCard] fetch submission ${uid} error:`, err)
            setSubError(err.message ?? 'Permission denied')
            return null
          })
      )
    ).then((results) => setSubmissions(results.filter((s): s is SubmissionDoc => s !== null)))
  }, [pairId, entry.date, memberDocs])

  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{dateLabel}</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-50">
        {submissions.map((sub) => {
          const member = memberDocs[sub.uid]
          return (
            <div key={sub.uid} className="flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-600 truncate">
                    {member?.displayName?.split(' ')[0] ?? '…'}
                  </p>
                  {sub.submittedAt && (
                    <p className="text-[10px] text-gray-300">
                      {sub.submittedAt.toDate().toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </p>
                  )}
                </div>
              </div>
              {sub.photoURL && (
                <img
                  src={sub.photoURL}
                  alt="submission"
                  className="w-full aspect-square object-cover"
                />
              )}
              {sub.text && (
                <p className="px-3 py-3 text-sm text-gray-700 leading-relaxed">{sub.text}</p>
              )}
              {!sub.photoURL && !sub.text && (
                <p className="px-3 py-3 text-xs text-gray-300 italic">nothing shared</p>
              )}
            </div>
          )
        })}
        {/* Placeholder / error while loading */}
        {submissions.length === 0 && (
          subError ? (
            <div className="col-span-2 p-3 text-xs text-red-500 font-mono break-all">{subError}</div>
          ) : (
            <>
              <div className="h-32 animate-pulse bg-gray-50" />
              <div className="h-32 animate-pulse bg-gray-50" />
            </>
          )
        )}
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const { user } = useAuth()
  const { pairId } = usePairId(user?.uid ?? null)
  const { entries, loading, error } = useTimeline(pairId)
  const navigate = useNavigate()

  const [memberDocs, setMemberDocs] = useState<Record<string, UserDoc>>({})

  // Subscribe to pair members' user docs for names/avatars in cards
  useEffect(() => {
    if (!pairId || !user) return
    const unsubscribers: (() => void)[] = []

    const listenToUser = (uid: string) => {
      const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          setMemberDocs((prev) => ({ ...prev, [uid]: snap.data() as UserDoc }))
        }
      })
      unsubscribers.push(unsub)
    }

    // Always listen to self; partner uid discovered via pair doc
    listenToUser(user.uid)

    const pairUnsub = onSnapshot(doc(db, 'pairs', pairId), (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      members.forEach((uid) => {
        if (!unsubscribers.length || uid === user.uid) return
        listenToUser(uid)
      })
    })
    unsubscribers.push(pairUnsub)

    return () => unsubscribers.forEach((u) => u())
  }, [pairId, user])

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-5 pt-12 pb-4 shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Back"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Timeline</h1>
      </header>

      <main className="flex-1 px-4 pb-8 overflow-y-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-7 w-7 rounded-full border-2 border-purple-200 border-t-purple-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm text-red-500 font-mono break-all">{error}</p>
            <p className="text-xs text-gray-400">pairId: {pairId ?? 'null'}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="text-4xl">🌙</div>
            <p className="text-gray-500 font-medium">Nothing revealed yet</p>
            <p className="text-xs text-gray-400">pairId: {pairId ?? 'null'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <TimelineCard
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
      <nav className="shrink-0 border-t border-gray-100 flex pb-8 bg-white">
        <button
          onClick={() => navigate('/home')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-gray-300"
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-medium">Today</span>
        </button>
        <button
          onClick={() => navigate('/timeline')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-purple-500"
        >
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
