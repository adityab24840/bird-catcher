import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
import { useEntry } from '../hooks/useEntry'
import { useStreak } from '../hooks/useStreak'
import { uploadSubmissionPhoto, submitEntryFn, revealAnywayFn, compressImage } from '../services/submissions'

function haptic(pattern: number | number[] = 10) {
  try { navigator.vibrate?.(pattern) } catch {}
}

function Avatar({
  photoURL,
  name,
  size = 'md',
}: {
  photoURL: string | null
  name: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-sm'
  if (photoURL)
    return <img src={photoURL} alt={name ?? ''} className={`${dims} rounded-full object-cover`} />
  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-bold`}
      style={{ background: '#E8F0E9', color: '#2D5A3D' }}
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function ResubmitForm({
  fileInputRef,
  photoPreview,
  submissionText,
  submitting,
  uploadingPhoto,
  submitError,
  onPhotoSelect,
  onClearPhoto,
  onTextChange,
  onCancel,
  onSubmit,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  photoPreview: string | null
  submissionText: string
  submitting: boolean
  uploadingPhoto: boolean
  submitError: string | null
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearPhoto: () => void
  onTextChange: (val: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="w-full space-y-3 mt-2 text-left">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoSelect} className="hidden" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={submitting || uploadingPhoto}
        className="relative w-full h-36 rounded-xl overflow-hidden flex items-center justify-center disabled:opacity-50 transition-all"
        style={{
          border: '1.5px dashed #C9BFA8',
          background: '#F2EDE4',
        }}
      >
        {photoPreview ? (
          <>
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClearPhoto()
              }}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none"
            >
              ×
            </button>
          </>
        ) : (
          <div className="text-center select-none">
            <div className="text-2xl mb-1">📷</div>
            <p className="text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: '#7A7268' }}>
              tap to add photo
            </p>
          </div>
        )}
      </button>
      <textarea
        value={submissionText}
        onChange={(e) => onTextChange(e.target.value.slice(0, 500))}
        placeholder="Add another thought..."
        disabled={submitting || uploadingPhoto}
        rows={2}
        className="w-full rounded-xl px-4 py-3 text-[15px] resize-none focus:outline-none disabled:opacity-50"
        style={{
          border: '1px solid #C9BFA8',
          background: '#FFFFFF',
          color: '#1A1A16',
        }}
      />
      {submitError && (
        <p className="text-xs" style={{ color: '#B85C38' }}>
          {submitError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg py-2.5 text-sm font-medium"
          style={{ border: '1px solid #C9BFA8', color: '#7A7268' }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || uploadingPhoto}
          className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: '#2D5A3D' }}
        >
          {uploadingPhoto ? 'Uploading…' : submitting ? 'Sharing…' : 'Share'}
        </button>
      </div>
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
  const [showResubmitForm, setShowResubmitForm] = useState(false)

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
    if (!userDoc?.pairId) {
      setPartnerId(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'pairs', userDoc.pairId), (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      setPartnerId(members.find((m) => m !== user?.uid) ?? null)
    })
    return () => unsub()
  }, [userDoc?.pairId, user?.uid])

  useEffect(() => {
    if (!partnerId) {
      setPartnerDoc(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'users', partnerId), (snap) => {
      setPartnerDoc(snap.exists() ? (snap.data() as UserDoc) : null)
    })
    return () => unsub()
  }, [partnerId])

  useEffect(() => {
    setEntryDate(new Date().toLocaleDateString('en-CA'))
  }, [])

  const { entryDoc, entryLoading } = useEntry(userDoc?.pairId ?? null, entryDate)

  const { myStreak, partnerStreak } = useStreak(
    userDoc?.pairId ?? null,
    user?.uid ?? null,
    partnerId,
  )

  const iSubmitted = entryDoc?.submittedMembers?.includes(user?.uid ?? '') ?? false
  const partnerSubmitted = entryDoc?.submittedMembers?.includes(partnerId ?? '') ?? false
  const partnerFirstName = partnerDoc?.displayName?.split(' ')[0] ?? 'them'

  const todayLabel = entryDate
    ? (() => {
        const d = new Date(entryDate + 'T12:00:00')
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
        const day = String(d.getDate()).padStart(2, '0')
        const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
        return `${weekday} · ${day} ${month}`
      })()
    : ''

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedPhoto(file)
    const reader = new FileReader()
    reader.onload = (evt) => setPhotoPreview(evt.target?.result as string)
    reader.readAsDataURL(file)
  }

  function clearPhoto() {
    setSelectedPhoto(null)
    setPhotoPreview(null)
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
        const compressed = await compressImage(selectedPhoto)
        photoURL = await uploadSubmissionPhoto(userDoc.pairId, entryDate, user.uid, compressed)
        setUploadingPhoto(false)
      }
      await submitEntryFn({ entryDate, text: submissionText.trim() || null, photoURL })
      haptic(15)
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

  async function handleRevealAnyway() {
    setRevealing(true)
    setRevealError(null)
    try {
      await revealAnywayFn({ entryDate })
      haptic([10, 80, 10])
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal')
    } finally {
      setRevealing(false)
    }
  }

  function cancelResubmit() {
    setShowResubmitForm(false)
    setSelectedPhoto(null)
    setPhotoPreview(null)
    setSubmissionText('')
  }

  async function submitAndCloseResubmit() {
    await handleSubmit()
    setShowResubmitForm(false)
  }

  return (
    <div className="flex flex-col min-h-screen animate-fadeUp">
      {/* Header */}
      <header
        className="px-5 pt-12 pb-4 flex items-start justify-between shrink-0"
        style={{ background: '#F2EDE4' }}
      >
        <div>
          <p className="text-xs tracking-[0.3em] font-bold" style={{ color: '#1A1A16' }}>
            BIRDS.EYE
          </p>
          {todayLabel && (
            <p
              className="text-[11px] tracking-[0.15em] mt-0.5 uppercase"
              style={{ color: '#7A7268' }}
            >
              {todayLabel}
            </p>
          )}
        </div>
        <button onClick={() => setShowSignOutConfirm(true)} className="rounded-full" title="Account">
          <Avatar photoURL={user?.photoURL ?? null} name={user?.displayName ?? null} size="sm" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 px-5 overflow-y-auto pb-4">
        {/* Dare banners */}
        {partnerStreak >= 3 && (
          <div
            className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3 border"
            style={{ background: '#E8F0E9', borderColor: '#8FAF8A' }}
          >
            <span className="text-xl">🌿</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#2D5A3D' }}>
                {partnerFirstName} missed {partnerStreak} days
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                You're owed a dare — make them do anything!
              </p>
            </div>
          </div>
        )}
        {myStreak >= 3 && (
          <div
            className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3 border"
            style={{ background: '#FAF0EB', borderColor: '#C9BFA8' }}
          >
            <span className="text-xl">🌱</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#B85C38' }}>
                You missed {myStreak} days
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                {partnerFirstName} gets to dare you — better check in!
              </p>
            </div>
          </div>
        )}

        {/* State machine */}
        {docLoading || entryLoading ? (
          /* ── LOADING ── */
          <div className="flex h-64 items-center justify-center animate-fadeUp">
            <div
              className="h-7 w-7 rounded-full border-2 animate-spin"
              style={{ borderColor: '#E8F0E9', borderTopColor: '#2D5A3D' }}
            />
          </div>
        ) : entryDoc?.status === 'revealed' ? (
          /* ── REVEALED ── */
          <div className="flex flex-col items-center text-center gap-5 pt-6 animate-fadeUp">
            <p className="text-lg font-bold tracking-wide" style={{ color: '#1A1A16' }}>
              ✦ TODAY'S ENTRY REVEALED
            </p>
            <p className="text-sm tracking-widest uppercase font-medium" style={{ color: '#7A7268' }}>
              {todayLabel}
            </p>
            <button
              onClick={() => navigate('/timeline')}
              className="w-full rounded-lg py-4 text-sm font-semibold text-white tracking-widest uppercase"
              style={{ background: '#2D5A3D' }}
            >
              Open Timeline
            </button>
            <div className="w-full" style={{ borderTop: '1px solid #C9BFA8' }} />
            {!showResubmitForm ? (
              <button
                onClick={() => setShowResubmitForm(true)}
                className="w-full rounded-lg py-3 text-sm font-medium border"
                style={{ borderColor: '#2D5A3D', color: '#2D5A3D' }}
              >
                + Add another thing
              </button>
            ) : (
              <ResubmitForm
                fileInputRef={fileInputRef}
                photoPreview={photoPreview}
                submissionText={submissionText}
                submitting={submitting}
                uploadingPhoto={uploadingPhoto}
                submitError={submitError}
                onPhotoSelect={handlePhotoSelect}
                onClearPhoto={clearPhoto}
                onTextChange={setSubmissionText}
                onCancel={cancelResubmit}
                onSubmit={submitAndCloseResubmit}
              />
            )}
          </div>
        ) : iSubmitted ? (
          /* ── WAITING ── */
          <div className="flex flex-col items-center text-center pt-8 gap-6 animate-fadeUp">
            {/* Submitted badge */}
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: '#2D5A3D' }}
              />
              <span
                className="text-[10px] tracking-[0.2em] uppercase font-semibold"
                style={{ color: '#2D5A3D' }}
              >
                Submitted
              </span>
            </div>

            {/* Partner avatar */}
            <div className="relative">
              <Avatar
                photoURL={partnerDoc?.photoURL ?? null}
                name={partnerDoc?.displayName ?? null}
                size="lg"
              />
              {partnerSubmitted && (
                <span
                  className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: '#2D5A3D' }}
                >
                  ✓
                </span>
              )}
            </div>

            <div>
              <p className="text-base font-semibold" style={{ color: '#1A1A16' }}>
                {partnerDoc?.displayName?.split(' ')[0] ?? '…'}
              </p>
              <p className="text-sm mt-1" style={{ color: '#7A7268' }}>
                {partnerSubmitted ? 'They shared too ✓' : 'Waiting for them…'}
              </p>
            </div>

            {/* Divider */}
            <div className="w-full" style={{ borderTop: '1px solid #C9BFA8' }} />

            <div className="w-full space-y-2">
              {!showResubmitForm && (
                <button
                  onClick={() => setShowResubmitForm(true)}
                  className="w-full rounded-lg py-3 text-sm font-medium border"
                  style={{ borderColor: '#2D5A3D', color: '#2D5A3D' }}
                >
                  + Add another thing
                </button>
              )}
              <button
                onClick={handleRevealAnyway}
                disabled={revealing}
                className="w-full rounded-lg py-3 text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: '#C9BFA8', color: '#7A7268' }}
              >
                {revealing ? 'Revealing…' : "Don't wait — reveal now"}
              </button>
              {revealError && (
                <p className="text-xs" style={{ color: '#B85C38' }}>
                  {revealError}
                </p>
              )}
              {showResubmitForm && (
                <ResubmitForm
                  fileInputRef={fileInputRef}
                  photoPreview={photoPreview}
                  submissionText={submissionText}
                  submitting={submitting}
                  uploadingPhoto={uploadingPhoto}
                  submitError={submitError}
                  onPhotoSelect={handlePhotoSelect}
                  onClearPhoto={clearPhoto}
                  onTextChange={setSubmissionText}
                  onCancel={cancelResubmit}
                  onSubmit={submitAndCloseResubmit}
                />
              )}
            </div>
          </div>
        ) : (
          /* ── SUBMIT FORM ── */
          <div className="space-y-4 pt-2 pb-4 animate-fadeUp">
            <p
              className="text-[10px] tracking-[0.2em] uppercase font-semibold"
              style={{ color: '#7A7268' }}
            >
              What reminded you today?
            </p>

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
              className="relative w-full h-52 rounded-xl overflow-hidden flex items-center justify-center disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ border: '1.5px dashed #C9BFA8', background: '#F2EDE4' }}
            >
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearPhoto()
                    }}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="text-center select-none">
                  <div className="text-3xl mb-2">📷</div>
                  <p
                    className="text-[11px] tracking-[0.1em] uppercase font-medium"
                    style={{ color: '#7A7268' }}
                  >
                    tap to add photo
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#C9BFA8' }}>
                    optional
                  </p>
                </div>
              )}
            </button>

            {/* Textarea */}
            <div>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
                placeholder="write something..."
                disabled={submitting || uploadingPhoto}
                rows={3}
                className="w-full rounded-xl px-4 py-3 text-[15px] leading-relaxed resize-none focus:outline-none disabled:opacity-50"
                style={{
                  border: '1px solid #C9BFA8',
                  background: '#FFFFFF',
                  color: '#1A1A16',
                }}
              />
              {submissionText.length > 0 && (
                <p className="text-[10px] text-right mt-1" style={{ color: '#C9BFA8' }}>
                  {submissionText.length}/500
                </p>
              )}
            </div>

            {submitError && (
              <p className="text-xs" style={{ color: '#B85C38' }}>
                {submitError}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || uploadingPhoto}
              className="w-full rounded-lg py-4 text-sm font-semibold text-white tracking-widest uppercase disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: '#2D5A3D' }}
            >
              {uploadingPhoto ? 'Uploading…' : submitting ? 'Sharing…' : 'Share'}
            </button>

            {/* Partner already submitted — motivational preview */}
            {partnerSubmitted && !iSubmitted && (
              <div
                className="mt-2 rounded-xl overflow-hidden border animate-fadeIn"
                style={{ borderColor: '#C9BFA8' }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b"
                  style={{ background: '#F2EDE4', borderColor: '#C9BFA8' }}
                >
                  <Avatar photoURL={partnerDoc?.photoURL ?? null} name={partnerDoc?.displayName ?? null} size="sm" />
                  <p className="text-[11px] tracking-[0.1em] uppercase font-semibold" style={{ color: '#2D5A3D' }}>
                    {partnerFirstName} already shared something ✓
                  </p>
                </div>
                <div
                  className="px-4 py-5 flex items-center justify-center"
                  style={{ background: '#F8F5F0' }}
                >
                  <p className="text-xs text-center" style={{ color: '#7A7268' }}>
                    Share yours to reveal what they sent
                  </p>
                </div>
              </div>
            )}
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
          style={{ color: '#8FAF8A' }}
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
          style={{ color: '#4A5C4A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Timeline</span>
        </button>
      </nav>

      {/* Sign-out confirmation sheet */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="rounded-t-3xl px-5 pb-10 pt-5 shadow-xl"
            style={{ background: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-5 h-1 w-10 rounded-full"
              style={{ background: '#E8E2D4' }}
            />
            <div className="mb-5 flex items-center gap-3">
              <Avatar
                photoURL={user?.photoURL ?? null}
                name={user?.displayName ?? null}
                size="md"
              />
              <div>
                <p className="font-semibold text-sm" style={{ color: '#1A1A16' }}>
                  {user?.displayName ?? '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                  {user?.email ?? ''}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                setShowSignOutConfirm(false)
                await signOutUser()
              }}
              className="w-full rounded-lg border py-3.5 text-sm font-medium transition-colors"
              style={{ borderColor: '#FAD4CA', color: '#B85C38' }}
            >
              Sign out
            </button>
            <button
              onClick={() => setShowSignOutConfirm(false)}
              className="mt-2 w-full rounded-lg py-3 text-sm transition-colors"
              style={{ color: '#7A7268' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
