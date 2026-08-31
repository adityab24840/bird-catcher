import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
import { useEntry } from '../hooks/useEntry'
import { uploadSubmissionPhoto, submitEntryFn, revealAnywayFn } from '../services/submissions'

function Avatar({
  photoURL,
  name,
  size = 'md',
}: {
  photoURL: string | null
  name: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-sm'
  if (photoURL) return <img src={photoURL} alt={name ?? ''} className={`${dims} rounded-full object-cover`} />
  return (
    <div className={`${dims} rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-500`}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [partnerDoc, setPartnerDoc] = useState<UserDoc | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [partnerId, setPartnerId] = useState<string | null>(null)

  const [entryDate, setEntryDate] = useState<string>('')
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submissionText, setSubmissionText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null)
        setDocLoading(false)
      },
      (err) => {
        console.error('[HomePage] userDoc error:', err)
        setDocLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!userDoc?.pairId) { setPartnerId(null); return }
    const unsub = onSnapshot(doc(db, 'pairs', userDoc.pairId), (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      setPartnerId(members.find((m) => m !== user?.uid) ?? null)
    })
    return () => unsub()
  }, [userDoc?.pairId, user?.uid])

  useEffect(() => {
    if (!partnerId) { setPartnerDoc(null); return }
    const unsub = onSnapshot(doc(db, 'users', partnerId), (snap) => {
      setPartnerDoc(snap.exists() ? (snap.data() as UserDoc) : null)
    })
    return () => unsub()
  }, [partnerId])

  useEffect(() => {
    setEntryDate(new Date().toLocaleDateString('en-CA'))
  }, [])

  const { entryDoc, entryLoading } = useEntry(userDoc?.pairId ?? null, entryDate)

  const iSubmitted = entryDoc?.submittedMembers?.includes(user?.uid ?? '') ?? false
  const partnerSubmitted = entryDoc?.submittedMembers?.includes(partnerId ?? '') ?? false
  const partnerFirstName = partnerDoc?.displayName?.split(' ')[0] ?? 'them'

  const todayLabel = entryDate
    ? new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : ''

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedPhoto(file)
    const reader = new FileReader()
    reader.onload = (evt) => setPhotoPreview(evt.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!selectedPhoto && !submissionText.trim()) {
      setSubmitError('Add a photo or write something first.')
      return
    }
    setSubmitting(true)
    let photoURL: string | null = null
    try {
      if (selectedPhoto && userDoc?.pairId && user) {
        setUploadingPhoto(true)
        photoURL = await uploadSubmissionPhoto(userDoc.pairId, entryDate, user.uid, selectedPhoto)
        setUploadingPhoto(false)
      }
      await submitEntryFn({ entryDate, text: submissionText.trim() || null, photoURL })
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setSubmissionText('')
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
      console.error('[HomePage] submit error:', err)
    } finally {
      setSubmitting(false)
      setUploadingPhoto(false)
    }
  }

  // handleSignOut removed — replaced by inline sign-out in the confirmation sheet

  async function handleRevealAnyway() {
    setRevealing(true)
    setRevealError(null)
    try {
      await revealAnywayFn({ entryDate })
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal')
    } finally {
      setRevealing(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-12 pb-3 shrink-0">
        <div>
          <span className="text-lg font-bold tracking-tight text-gray-900">birds.eye</span>
          {todayLabel && <p className="text-xs text-gray-400 mt-0.5">{todayLabel}</p>}
        </div>
        <button onClick={() => setShowSignOutConfirm(true)} className="rounded-full" title="Account">
          <Avatar photoURL={user?.photoURL ?? null} name={user?.displayName ?? null} size="sm" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 px-5 overflow-y-auto">
        {docLoading || entryLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-7 w-7 rounded-full border-2 border-purple-200 border-t-purple-500 animate-spin" />
          </div>
        ) : entryDoc?.status === 'revealed' ? (
          /* ── REVEALED ── */
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-5">
            <div className="text-6xl">✨</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">Reveal ready</p>
              <p className="text-sm text-gray-400 mt-1">{todayLabel}</p>
            </div>
            <button
              onClick={() => navigate('/timeline')}
              className="rounded-2xl bg-purple-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-purple-200 hover:bg-purple-600 active:scale-95 transition-transform"
            >
              Open →
            </button>
          </div>
        ) : iSubmitted ? (
          /* ── WAITING ── */
          <div className="flex flex-col items-center text-center pt-10 gap-6">
            <div className="relative">
              <Avatar photoURL={partnerDoc?.photoURL ?? null} name={partnerDoc?.displayName ?? null} size="lg" />
              {partnerSubmitted && (
                <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-400 border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">
                  ✓
                </span>
              )}
            </div>

            <div>
              {partnerSubmitted ? (
                <>
                  <p className="text-xl font-bold text-gray-900">Both shared</p>
                  <p className="text-sm text-gray-400 mt-1">Waiting for reveal…</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-gray-900">
                    Waiting for {partnerFirstName}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">You've shared your something for today</p>
                </>
              )}
            </div>

            <div className="w-full mt-2">
              <button
                onClick={handleRevealAnyway}
                disabled={revealing}
                className="w-full rounded-2xl border border-gray-200 py-3.5 text-sm text-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {revealing ? 'Revealing…' : "Don't want to wait? Reveal now"}
              </button>
              {revealError && <p className="text-xs text-red-500 mt-2">{revealError}</p>}
            </div>
          </div>
        ) : (
          /* ── SUBMIT FORM ── */
          <div className="space-y-4 pt-1 pb-4">
            <div>
              <p className="text-xl font-bold text-gray-900">What reminded you?</p>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Photo tap area */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || uploadingPhoto}
              className="relative w-full h-52 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedPhoto(null)
                      setPhotoPreview(null)
                    }}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="text-center select-none">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-sm text-gray-400">Tap to add a photo</p>
                  <p className="text-xs text-gray-300 mt-0.5">optional</p>
                </div>
              )}
            </button>

            {/* Text */}
            <div>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
                placeholder="What reminded you of them today?"
                disabled={submitting || uploadingPhoto}
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm resize-none focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:opacity-50 placeholder:text-gray-300"
              />
              {submissionText.length > 0 && (
                <p className="text-xs text-gray-300 text-right mt-1">{submissionText.length}/500</p>
              )}
            </div>

            {submitError && <p className="text-xs text-red-500">{submitError}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || uploadingPhoto}
              className="w-full rounded-2xl bg-purple-500 py-4 text-base font-semibold text-white shadow-lg shadow-purple-200 hover:bg-purple-600 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {uploadingPhoto ? 'Uploading…' : submitting ? 'Sharing…' : 'Share'}
            </button>

            {partnerSubmitted && (
              <p className="text-xs text-green-500 text-center">
                {partnerFirstName} already shared something today ✓
              </p>
            )}
          </div>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="shrink-0 border-t border-gray-100 flex pb-8 bg-white">
        <button
          onClick={() => navigate('/home')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-purple-500"
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-medium">Today</span>
        </button>
        <button
          onClick={() => navigate('/timeline')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1 text-gray-300"
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium">Timeline</span>
        </button>
      </nav>

      {/* Sign-out confirmation sheet */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setShowSignOutConfirm(false)}>
          <div className="rounded-t-3xl bg-white px-5 pb-10 pt-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-center gap-3">
              <Avatar photoURL={user?.photoURL ?? null} name={user?.displayName ?? null} size="md" />
              <div>
                <p className="font-semibold text-gray-900">{user?.displayName ?? '—'}</p>
                <p className="text-xs text-gray-400">{user?.email ?? ''}</p>
              </div>
            </div>
            <button
              onClick={async () => { setShowSignOutConfirm(false); await signOutUser() }}
              className="w-full rounded-2xl border border-red-100 py-3.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
            <button
              onClick={() => setShowSignOutConfirm(false)}
              className="mt-2 w-full rounded-2xl py-3 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
