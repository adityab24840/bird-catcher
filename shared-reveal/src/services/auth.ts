/**
 * Auth service — Google Sign-In, redirect result capture, and sign-out.
 *
 * signInWithRedirect is used unconditionally because iOS Safari standalone
 * mode blocks popup-based auth flows. The redirect approach with a custom
 * authDomain (SEC-08) works on all platforms including iOS standalone.
 *
 * completeRedirect() MUST be called on app load (in useAuth) to capture the
 * Firebase Auth state that is returned after the Google redirect completes.
 * Without this call the redirect return is silently lost.
 */
import {
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase/config'

const USE_POPUP = Boolean(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST)

/**
 * Initiate Google Sign-In.
 * Production/iOS: signInWithRedirect (popup blocked in iOS standalone).
 * Emulator local dev: signInWithPopup (emulator redirect state doesn't persist).
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  if (USE_POPUP) {
    await signInWithPopup(auth, provider)
  } else {
    await signInWithRedirect(auth, provider)
  }
}

/**
 * Capture the redirect result on app load (production only).
 * In emulator mode signInWithPopup resolves immediately — no redirect to capture.
 */
export async function completeRedirect(): Promise<User | null> {
  if (USE_POPUP) return null
  const result = await getRedirectResult(auth)
  return result?.user ?? null
}

/**
 * Sign the current user out of Firebase Auth.
 * AUTH-04: called from the HomePage sign-out control.
 */
export async function signOutUser(): Promise<void> {
  await signOut(auth)
}
