/**
 * HomePage — authenticated home shell for paired users.
 *
 * AUTH-02: reads the users/{uid} Firestore document (proves server-side doc creation).
 * AUTH-04: provides a sign-out button wired to signOutUser().
 * D-05: shows partner's display name and photo once pairId is non-null.
 * Phase 3 will replace the partner card body with the submission UI.
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
import { useEntry } from '../hooks/useEntry'
import { uploadSubmissionPhoto, submitEntryFn, revealAnywayFn } from '../services/submissions'

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
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

  // Subscribe to own user doc — detects pairId becoming non-null after pair join
  useEffect(() => {
    if (!user) return

    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null)
        setDocLoading(false)
      },
      (err) => {
        console.error('[HomePage] userDoc listener error:', err)
        setDocLoading(false)
      },
    )

    return () => unsub()
  }, [user])

  // Subscribe to pair doc to find partner UID (needed for partner status badge)
  useEffect(() => {
    if (!userDoc?.pairId) {
      setPartnerId(null)
      return
    }

    const pairRef = doc(db, 'pairs', userDoc.pairId)
    const unsub = onSnapshot(pairRef, (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      const id = members.find((m) => m !== user?.uid) ?? null
      setPartnerId(id)
    })

    return () => unsub()
  }, [userDoc?.pairId, user?.uid])

  useEffect(() => {
    setEntryDate(new Date().toLocaleDateString('en-CA'))
  }, [])

  const { entryDoc, entryLoading } = useEntry(userDoc?.pairId ?? null, entryDate)

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedPhoto(file)
    const reader = new FileReader()
    reader.onload = (evt) => setPhotoPreview(evt.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleRemovePhoto() {
    setSelectedPhoto(null)
    setPhotoPreview(null)
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!selectedPhoto && !submissionText.trim()) {
      setSubmitError('Please add a photo or text before submitting.')
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
      await submitEntryFn({
        entryDate,
        text: submissionText.trim() || null,
        photoURL,
      })
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setSubmissionText('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit'
      setSubmitError(message)
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
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal')
    } finally {
      setRevealing(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOutUser()
    } catch (err) {
      console.error('[HomePage] signOut error:', err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        {/* App mark */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow">
            R
          </div>
        </div>

        <h1 className="mb-4 text-center text-2xl font-bold text-gray-900">Bird Eye</h1>

        {/* Auth identity (from Firebase Auth token) */}
        <div className="mb-6 space-y-1 text-center">
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt="Profile"
              className="mx-auto mb-3 h-14 w-14 rounded-full"
            />
          )}
          <p className="font-medium text-gray-900">{user?.displayName ?? '—'}</p>
          <p className="text-sm text-gray-500">{user?.email ?? '—'}</p>
        </div>

        {/* Submission state machine (Phase 4) */}
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-center">
          {docLoading || entryLoading ? (
            <p className="text-gray-400">Loading…</p>
          ) : entryDoc?.status === 'revealed' ? (
            <div className="space-y-3 text-left">
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 mb-1">Today&apos;s reveal ✨</p>
                <p className="text-xs text-gray-500">{entryDate}</p>
              </div>
              <button
                onClick={() => navigate('/timeline')}
                className="w-full rounded-lg border border-purple-200 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
              >
                View in timeline →
              </button>
            </div>
          ) : entryDoc?.submittedMembers?.includes(user?.uid ?? '') ? (
            <div className="space-y-3">
              <div className="text-2xl">✓</div>
              <p className="font-medium text-gray-900">You&apos;ve shared something for today</p>
              {entryDoc?.submittedMembers?.includes(partnerId ?? '') ? (
                <p className="text-xs text-green-600 mt-2">They&apos;ve shared something too ✓</p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">Waiting for them to share…</p>
              )}
              <div className="mt-3">
                <button
                  onClick={handleRevealAnyway}
                  disabled={revealing}
                  className="w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  {revealing ? 'Revealing…' : 'Reveal anyway'}
                </button>
                {revealError && <p className="text-xs text-red-600 mt-1">{revealError}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-left">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Photo (optional)</label>
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
                    <button
                      onClick={handleRemovePhoto}
                      className="absolute top-1 right-1 bg-white rounded-full p-1 shadow text-sm leading-none"
                    >×</button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    disabled={submitting || uploadingPhoto}
                    className="block w-full text-xs text-gray-500 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white file:px-3 file:py-1 cursor-pointer disabled:opacity-50"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Text (optional) · {submissionText.length}/500
                </label>
                <textarea
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
                  placeholder="What reminded you of them today?"
                  disabled={submitting || uploadingPhoto}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                />
              </div>
              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting || uploadingPhoto}
                className="w-full rounded-lg bg-purple-500 py-2 text-sm font-medium text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              >
                {uploadingPhoto ? 'Uploading photo…' : submitting ? 'Submitting…' : "Share today's something"}
              </button>
              {entryDoc && (
                <p className="text-xs text-gray-500 text-center">
                  {entryDoc.submittedMembers?.includes(partnerId ?? '')
                    ? "They've shared something for today ✓"
                    : 'Waiting for them to share…'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Timeline nav */}
        <div className="mb-3 text-center">
          <button
            onClick={() => navigate('/timeline')}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            View timeline
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
