import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc, UserDoc } from '../types/index'

interface ExportEntry {
  entry: EntryDoc
  submissions: SubmissionDoc[]
}

const MOOD_LABELS: Record<string, string> = {
  happy: '😊 happy',
  'missing-you': '💭 missing you',
  proud: '🌟 proud',
  random: '🍃 random',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function groupByMonth(entries: ExportEntry[]): Map<string, ExportEntry[]> {
  const map = new Map<string, ExportEntry[]>()
  for (const e of entries) {
    const ym = e.entry.date.slice(0, 7)
    if (!map.has(ym)) map.set(ym, [])
    map.get(ym)!.push(e)
  }
  return map
}

export default function ExportPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pairName, setPairName] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, UserDoc>>({})
  const [exportEntries, setExportEntries] = useState<ExportEntry[]>([])

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const userSnap = await getDoc(doc(db, 'users', user!.uid))
        if (!userSnap.exists()) throw new Error('User doc not found')
        const userData = userSnap.data() as UserDoc
        const pid = userData.pairId
        if (!pid) { setError('No pair found'); setLoading(false); return }

        const pairSnap = await getDoc(doc(db, 'pairs', pid))
        if (!pairSnap.exists()) throw new Error('Pair doc not found')
        const pairData = pairSnap.data()
        setPairName(pairData.pairName ?? null)

        const memberIds: string[] = pairData.members ?? []
        const memberDocs: Record<string, UserDoc> = {}
        await Promise.all(
          memberIds.map(async (uid) => {
            const snap = await getDoc(doc(db, 'users', uid))
            if (snap.exists()) memberDocs[uid] = snap.data() as UserDoc
          })
        )
        setMembers(memberDocs)

        const entriesSnap = await getDocs(
          query(
            collection(db, 'pairs', pid, 'entries'),
            where('status', '==', 'revealed'),
            orderBy('date', 'asc')
          )
        )
        const entries = entriesSnap.docs.map((d) => d.data() as EntryDoc)

        const exportData = await Promise.all(
          entries.map(async (entry) => {
            const subsSnap = await getDocs(
              collection(db, 'pairs', pid, 'entries', entry.date, 'submissions')
            )
            const submissions = subsSnap.docs.map((d) => d.data() as SubmissionDoc)
            return { entry, submissions }
          })
        )

        setExportEntries(exportData)
        setLoading(false)
      } catch (e) {
        console.error('[ExportPage]', e)
        setError('Failed to load journal')
        setLoading(false)
      }
    }
    load()
  }, [user])

  useEffect(() => {
    if (!loading && exportEntries.length > 0) {
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [loading, exportEntries.length])

  const grouped = groupByMonth(exportEntries)
  const months = Array.from(grouped.keys())
  const firstDate = exportEntries[0]?.entry.date
  const lastDate = exportEntries[exportEntries.length - 1]?.entry.date

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; break-before: page; }
          body { background: white !important; }
          img { max-width: 100% !important; page-break-inside: avoid; }
          .entry-block { page-break-inside: avoid; }
        }
        @media screen {
          body { background: #F2EDE4; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div
        className="no-print fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 shadow"
        style={{ background: '#1C2B1E' }}
      >
        <button onClick={() => navigate('/timeline')} className="text-sm" style={{ color: '#8FAF8A' }}>
          ← Back
        </button>
        <span className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: '#8FAF8A' }}>
          Export Journal
        </span>
        <button
          onClick={() => window.print()}
          disabled={loading}
          className="text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-40"
          style={{ background: '#2D5A3D', color: '#fff' }}
        >
          Save PDF
        </button>
      </div>

      {/* Page content */}
      <div
        className="mx-auto pt-16"
        style={{ maxWidth: 680, padding: '64px 40px 80px', fontFamily: 'Georgia, serif' }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4 no-print">
            <div
              className="h-8 w-8 rounded-full border-2 animate-spin"
              style={{ borderColor: '#E8F0E9', borderTopColor: '#2D5A3D' }}
            />
            <p className="text-sm" style={{ color: '#7A7268' }}>Loading your journal…</p>
          </div>
        ) : error ? (
          <p className="text-center pt-32 text-sm" style={{ color: '#B85C38' }}>{error}</p>
        ) : exportEntries.length === 0 ? (
          <p className="text-center pt-32 text-sm" style={{ color: '#7A7268' }}>No revealed entries yet.</p>
        ) : (
          <>
            {/* Cover */}
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: '2px solid #2D5A3D', paddingBottom: 48, marginBottom: 64 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#7A7268', marginBottom: 16 }}>
                A shared journal
              </p>
              <h1 style={{ fontSize: 40, fontWeight: 700, color: '#1C2B1E', marginBottom: 8, lineHeight: 1.2 }}>
                {pairName ?? 'Birds Eye'}
              </h1>
              <p style={{ fontSize: 16, color: '#7A7268', marginBottom: 48 }}>
                {Object.values(members).map((m) => m.displayName?.split(' ')[0]).filter(Boolean).join(' & ')}
              </p>
              <div style={{ display: 'flex', gap: 40 }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9BFA8' }}>From</p>
                  <p style={{ fontSize: 15, color: '#1A1A16', marginTop: 4 }}>{firstDate ? formatDate(firstDate) : '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9BFA8' }}>To</p>
                  <p style={{ fontSize: 15, color: '#1A1A16', marginTop: 4 }}>{lastDate ? formatDate(lastDate) : '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9BFA8' }}>Reveals</p>
                  <p style={{ fontSize: 15, color: '#1A1A16', marginTop: 4 }}>{exportEntries.length}</p>
                </div>
              </div>
            </div>

            {/* Monthly sections */}
            {months.map((ym, monthIdx) => (
              <div key={ym} className={monthIdx > 0 ? 'page-break' : ''}>
                {/* Month header */}
                <div style={{ borderBottom: '1px solid #C9BFA8', paddingBottom: 8, marginBottom: 40 }}>
                  <p style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#7A7268' }}>
                    {formatMonth(ym)}
                  </p>
                </div>

                {/* Entries */}
                {grouped.get(ym)!.map(({ entry, submissions }) => (
                  <div key={entry.date} className="entry-block" style={{ marginBottom: 56 }}>
                    {/* Date */}
                    <p style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#2D5A3D', fontWeight: 700, marginBottom: 20 }}>
                      {formatDate(entry.date)}
                      {entry.favoritedBy?.length ? '  ❤️' : ''}
                    </p>

                    {/* Submissions */}
                    {submissions.map((sub) => {
                      const member = members[sub.uid]
                      const firstName = member?.displayName?.split(' ')[0] ?? '…'
                      const photos = sub.photoURLs?.length ? sub.photoURLs : sub.photoURL ? [sub.photoURL] : []
                      const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []

                      return (
                        <div key={sub.uid} style={{ marginBottom: 28, paddingLeft: 16, borderLeft: '2px solid #E8E2D4' }}>
                          <p style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7A7268', marginBottom: 12 }}>
                            {firstName}
                            {sub.mood ? `  ${MOOD_LABELS[sub.mood] ?? sub.mood}` : ''}
                          </p>

                          {photos.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              style={{ width: '100%', borderRadius: 8, marginBottom: 12, display: 'block' }}
                            />
                          ))}

                          {sub.sketchURL && (
                            <img
                              src={sub.sketchURL}
                              alt="sketch"
                              style={{ width: '100%', borderRadius: 8, marginBottom: 12, display: 'block', border: '1px solid #E8E2D4' }}
                            />
                          )}

                          {texts.map((t, i) => (
                            <p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: '#1A1A16', marginBottom: 8, fontFamily: 'Georgia, serif' }}>
                              {t}
                            </p>
                          ))}

                          {sub.audioURLs?.length > 0 && (
                            <p style={{ fontSize: 12, color: '#7A7268', fontStyle: 'italic' }}>
                              🎙️ {sub.audioURLs.length === 1 ? 'Voice memo recorded' : `${sub.audioURLs.length} voice memos recorded`}
                            </p>
                          )}

                          {sub.songURL && (
                            <p style={{ fontSize: 12, color: '#2D5A3D' }}>
                              🎵 {sub.songURL.replace('https://open.spotify.com/', 'spotify.com/')}
                            </p>
                          )}

                          {sub.location && (
                            <p style={{ fontSize: 12, color: '#7A7268' }}>
                              📍 {sub.location.lat.toFixed(5)}, {sub.location.lng.toFixed(5)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}

            {/* Back cover */}
            <div className="page-break" style={{ textAlign: 'center', paddingTop: 120 }}>
              <p style={{ fontSize: 24, color: '#2D5A3D', marginBottom: 16 }}>🌿</p>
              <p style={{ fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9BFA8' }}>
                {exportEntries.length} {exportEntries.length === 1 ? 'reveal' : 'reveals'} — and counting
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
