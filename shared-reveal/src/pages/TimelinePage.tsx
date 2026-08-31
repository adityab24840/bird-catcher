import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useTimeline } from '../hooks/useTimeline'
import { usePairId } from '../hooks/usePair'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc } from '../types/index'

function TimelineCard({ entry, pairId }: { entry: EntryDoc; pairId: string }) {
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([])

  useEffect(() => {
    getDocs(collection(db, `pairs/${pairId}/entries/${entry.date}/submissions`))
      .then((snap) => setSubmissions(snap.docs.map((d) => d.data() as SubmissionDoc)))
      .catch((err) => console.error('[TimelineCard] fetch submissions error:', err))
  }, [pairId, entry.date])

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-400 mb-3 font-medium">
        {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {submissions.map((sub) => (
          <div key={sub.uid} className="space-y-2">
            {sub.photoURL && (
              <img
                src={sub.photoURL}
                alt="submission"
                className="w-full aspect-square object-cover rounded-lg"
              />
            )}
            {sub.text && (
              <p className="text-sm text-gray-700">{sub.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const { user } = useAuth()
  const { pairId } = usePairId(user?.uid ?? null)
  const { entries, loading } = useTimeline(pairId)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-sm px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/home')}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Timeline</h1>
        </div>
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-12">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">
            No revealed entries yet.
          </p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <TimelineCard
                key={entry.date}
                entry={entry}
                pairId={pairId!}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
