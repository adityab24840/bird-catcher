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
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'

export default function HomePage() {
  const { user } = useAuth()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerDoc, setPartnerDoc] = useState<UserDoc | null>(null)

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

  // Subscribe to pair doc to find partner UID, then subscribe to partner's user doc (D-05)
  useEffect(() => {
    if (!userDoc?.pairId) {
      setPartnerId(null)
      setPartnerDoc(null)
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
    if (!partnerId) {
      setPartnerDoc(null)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'users', partnerId),
      (snap) => {
        setPartnerDoc(snap.exists() ? (snap.data() as UserDoc) : null)
      },
      (err) => {
        console.error('[HomePage] partnerDoc listener error:', err)
      },
    )

    return () => unsub()
  }, [partnerId])

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

        {/* Partner identity card (D-05) — Phase 3 replaces this with submission UI */}
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-center">
          {docLoading ? (
            <p className="text-gray-400">Loading…</p>
          ) : userDoc?.pairId && partnerDoc ? (
            <>
              {partnerDoc.photoURL && (
                <img
                  src={partnerDoc.photoURL}
                  className="mx-auto mb-2 h-12 w-12 rounded-full"
                  alt="Partner"
                />
              )}
              <p className="font-medium text-gray-900">{partnerDoc.displayName ?? '—'}</p>
              <p className="mt-1 text-xs text-gray-500">You're connected</p>
            </>
          ) : userDoc?.pairId ? (
            <p className="text-gray-400">Loading partner…</p>
          ) : (
            <p className="text-amber-600 text-xs">
              No pair yet — this page should only be reached after pairing.
            </p>
          )}
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
