/**
 * Cloud Functions for Reveal.
 *
 * createUserDoc: Auth onCreate trigger that writes the users/{uid} Firestore document
 * server-side, using the Firebase Admin SDK. This avoids the client token-hydration
 * race condition that occurs when client code tries to write immediately after sign-in
 * (the Auth token may not be ready, and Security Rules would reject the write).
 *
 * Trigger variant used: v2 `beforeUserCreated` from firebase-functions/v2/identity.
 * This fires synchronously before the Firebase Auth user record is persisted,
 * ensuring the Firestore user document exists by the time the client receives the
 * sign-in credential (AUTH-02).
 *
 * If beforeUserCreated causes issues at deploy time (it is a blocking trigger
 * and requires enabling the Identity Platform API), switch to the v1-style
 * user().onCreate non-blocking trigger in firebase-functions/v1/auth — the
 * document shape is identical. See SUMMARY.md for which variant was deployed.
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { beforeUserCreated } from 'firebase-functions/v2/identity'

// Initialize the Admin SDK once at module load.
initializeApp()

/**
 * Writes the users/{uid} Firestore document when a new Firebase Auth user is created.
 *
 * Document shape (matches UserDoc type in src/types/index.ts):
 *   displayName: string | null
 *   email:       string | null
 *   photoURL:    string | null
 *   createdAt:   server timestamp
 *   updatedAt:   server timestamp
 *   pairId:      null  (set by Cloud Function in Phase 2, never by client — T-01-04)
 *
 * AUTH-02: user doc is created server-side — never client-side.
 * T-01-05: no token-hydration race; document exists before client first reads it.
 */
export const createUserDoc = beforeUserCreated(async (event) => {
  const user = event.data
  if (!user) return

  const db = getFirestore()
  await db.doc(`users/${user.uid}`).set({
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    pairId: null,
  })
})
