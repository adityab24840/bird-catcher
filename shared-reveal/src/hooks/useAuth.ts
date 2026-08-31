/**
 * useAuth — reactive Firebase Auth state for the app.
 *
 * On mount:
 *   1. Calls completeRedirect() once to capture the post-redirect Auth result
 *      (AUTH-01: redirect return must be consumed on the first render cycle).
 *   2. Subscribes to onAuthStateChanged to maintain up-to-date user state.
 *
 * loading: starts true and flips false after the first auth-state callback fires.
 * This ensures the app never renders a sign-in page flash for an already-authed user.
 * AUTH-03: because Firestore uses persistentLocalCache, the persisted session
 * is available immediately and onAuthStateChanged fires quickly on refresh.
 */
import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../firebase/config'
import { completeRedirect } from '../services/auth'

interface AuthState {
  user: User | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Guard: React StrictMode double-invokes effects in dev. getRedirectResult()
  // can only be consumed once per redirect — second call returns null.
  const redirectCaptured = useRef(false)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    async function init() {
      if (!redirectCaptured.current) {
        redirectCaptured.current = true
        await completeRedirect().catch((err) => {
          console.error('[useAuth] completeRedirect error:', err)
        })
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser)
        setLoading(false)
      })
    }

    init()

    return () => { unsubscribe?.() }
  }, [])

  return { user, loading }
}
