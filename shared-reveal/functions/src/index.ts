import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { beforeUserCreated } from 'firebase-functions/v2/identity'

// Must be set before initializeApp() so Admin SDK routes to Firestore emulator.
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'birds-eye-c09ff' })

/**
 * Writes the users/{uid} Firestore document before a new Firebase Auth user is persisted.
 * Uses v2 beforeUserCreated (blocking trigger) — fires synchronously before the Auth user
 * record is stored, ensuring the Firestore doc exists the moment the client gets the credential.
 *
 * Error handling: errors are caught and logged but NOT re-thrown. A non-throw means auth
 * proceeds even if the Firestore write fails (better than blocking sign-in entirely).
 *
 * AUTH-02: user doc created server-side — never client-side (T-01-05).
 */
export const createUserDoc = beforeUserCreated(async (event) => {
  const user = event.data
  if (!user) return
  console.log('[createUserDoc] handler invoked uid:', user.uid)
  try {
    const db = getFirestore()
    await db.doc(`users/${user.uid}`).set({
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      pairId: null,
    })
    console.log('[createUserDoc] wrote users/' + user.uid)
  } catch (err) {
    // Log but do not re-throw — blocking trigger must not fail sign-in on Firestore error.
    console.error('[createUserDoc] FAILED:', err)
  }
})
