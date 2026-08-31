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
  getRedirectResult,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase/config'

/**
 * Initiate Google Sign-In via redirect.
 * On iOS standalone and all other platforms, uses signInWithRedirect.
 * AUTH-01: the browser leaves the app, completes the Google flow, and returns.
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  await signInWithRedirect(auth, provider)
}

/**
 * Capture the Firebase Auth credential returned after a signInWithRedirect flow.
 * Must be called on app load — the redirect result is only available once.
 * Returns the signed-in User, or null if no redirect result is pending.
 */
export async function completeRedirect(): Promise<User | null> {
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
