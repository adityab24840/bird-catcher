import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { user } from 'firebase-functions/v1/auth'

// Must be set before initializeApp() so Admin SDK routes to Firestore emulator.
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'birds-eye-c09ff' })

/**
 * Writes the users/{uid} Firestore document when a new Firebase Auth user is created.
 *
 * Uses v1 user().onCreate (non-blocking) — works in both emulator and production
 * without requiring Cloud Identity Platform. The emulator's functions.config()
 * crash (firebase-functions v7 compat issue) is handled by scripts/patch-firebase-functions.js.
 *
 * AUTH-02: user doc created server-side — never client-side (T-01-05).
 */
export const createUserDoc = user().onCreate(async (userRecord) => {
  try {
    const db = getFirestore()
    await db.doc(`users/${userRecord.uid}`).set({
      displayName: userRecord.displayName ?? null,
      email: userRecord.email ?? null,
      photoURL: userRecord.photoURL ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      pairId: null,
    })
    console.log('[createUserDoc] wrote users/' + userRecord.uid)
  } catch (err) {
    console.error('[createUserDoc] FAILED:', err)
    throw err
  }
})
