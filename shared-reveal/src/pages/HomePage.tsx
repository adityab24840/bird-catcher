/**
 * HomePage — authenticated home shell.
 *
 * AUTH-02: reads the users/{uid} Firestore document to confirm server-side
 * document creation by the Cloud Function completed successfully.
 * AUTH-04: provides a sign-out button wired to signOutUser().
 * AUTH-03: if the user refreshes, useAuth restores the persisted session and
 * App.tsx routes them back here without a sign-in prompt.
 */
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'

export default function HomePage() {
  const { user } = useAuth()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [docLoading, setDocLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    async function fetchUserDoc() {
      try {
        const snap = await getDoc(doc(db, 'users', user!.uid))
        if (snap.exists()) {
          setUserDoc(snap.data() as UserDoc)
        }
      } catch (err) {
        console.error('[HomePage] fetchUserDoc error:', err)
      } finally {
        setDocLoading(false)
      }
    }

    void fetchUserDoc()
  }, [user])

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

        {/* Firestore user doc status (proves AUTH-02) */}
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm">
          <p className="mb-1 font-medium text-gray-700">Firestore user document</p>
          {docLoading ? (
            <p className="text-gray-400">Loading…</p>
          ) : userDoc ? (
            <div className="space-y-0.5 text-gray-500">
              <p>pairId: {userDoc.pairId ?? 'null'}</p>
              <p>createdAt: {userDoc.createdAt?.toDate?.()?.toLocaleString?.() ?? '—'}</p>
            </div>
          ) : (
            <p className="text-amber-600">
              No user doc yet — the Cloud Function may still be running or is not deployed.
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
