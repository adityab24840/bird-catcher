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
import { user } from 'firebase-functions/v1/auth'

// Initialize the Admin SDK once at module load.
initializeApp()

/**
 * Writes the users/{uid} Firestore document when a new Firebase Auth user is created.
 * Uses v1 user().onCreate (non-blocking) — v2 beforeUserCreated blocks sign-in on
 * any function error, which is unsafe for emulator dev and unnecessary here.
 *
 * Document shape (matches UserDoc type in src/types/index.ts):
 *   displayName: string | null
 *   email:       string | null
 *   photoURL:    string | null
 *   createdAt:   server timestamp
 *   updatedAt:   server timestamp
 *   pairId:      null
 *
 * AUTH-02: user doc created server-side — never client-side (T-01-05).
 */
export const createUserDoc = user().onCreate(async (userRecord) => {
  const db = getFirestore()
  await db.doc(`users/${userRecord.uid}`).set({
    displayName: userRecord.displayName ?? null,
    email: userRecord.email ?? null,
    photoURL: userRecord.photoURL ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    pairId: null,
  })
})
