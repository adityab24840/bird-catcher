import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { user } from 'firebase-functions/v1/auth'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'

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

// Input schema shared by both createPair (validation) and joinPair (SEC-05)
const JoinPairSchema = z.object({
  inviteCode: z.string().length(6).regex(/^[A-F0-9]{6}$/),
})

const SubmitEntrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    text: z.string().max(500).nullable(),
    photoURL: z.url().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.photoURL && !data.text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of photo or text is required',
        path: ['photoURL'],
      })
    }
  })

// App Check enforcement: emulator sets FUNCTIONS_EMULATOR=true and does not issue
// real App Check tokens, so enforcing there always throws unauthenticated.
// Enforce only in production (SEC-07).
const callableOptions = process.env.FUNCTIONS_EMULATOR ? {} : { enforceAppCheck: true }

/**
 * Creates a new pair and returns a 6-char invite code.
 *
 * PAIR-01, PAIR-02, PAIR-06, SEC-07.
 * CRITICAL (D-03): does NOT set users/{creatorUid}.pairId — that happens in joinPair
 * so User A stays on /pair-setup until their partner joins.
 */
export const createPair = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in')
  }

  const uid = request.auth.uid
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)

  const { randomBytes } = await import('node:crypto')
  const inviteCode = randomBytes(3).toString('hex').toUpperCase()
  const inviteCodeExpiry = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  const pairRef = db.collection('pairs').doc()

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User document not found')
    }
    if (userSnap.data()!.pairId !== null) {
      throw new HttpsError('already-exists', 'You are already in a pair')
    }

    tx.set(pairRef, {
      createdBy: uid,
      members: [uid],
      inviteCode,
      inviteCodeExpiry,
      inviteCodeUsed: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    // pairId intentionally NOT set on userRef — joinPair sets both users' pairId atomically
  })

  return { pairId: pairRef.id, inviteCode }
})

/**
 * Joins a pair by invite code. Validates all 5 SEC-05 conditions inside a single
 * Firestore transaction and atomically sets pairId on both users' documents.
 *
 * PAIR-03, PAIR-04, PAIR-05, PAIR-06, SEC-05, SEC-07.
 */
export const joinPair = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in')
  }

  const parsed = JoinPairSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid invite code format')
  }

  const { inviteCode } = parsed.data
  const uid = request.auth.uid
  const db = getFirestore()

  // Query outside transaction — collection queries cannot run inside Firestore transactions (Pitfall 3)
  const pairsSnap = await db.collection('pairs').where('inviteCode', '==', inviteCode).limit(1).get()
  if (pairsSnap.empty) {
    throw new HttpsError('not-found', 'Invite code not found')
  }

  const pairRef = pairsSnap.docs[0].ref
  const joinerRef = db.doc(`users/${uid}`)

  await db.runTransaction(async (tx) => {
    // ALL READS BEFORE WRITES — Admin SDK constraint (Pitfall 2)
    const [pairSnap, joinerSnap] = await Promise.all([tx.get(pairRef), tx.get(joinerRef)])

    if (!pairSnap.exists) {
      throw new HttpsError('not-found', 'Pair not found')
    }

    const pair = pairSnap.data()!

    // SEC-05 Check 1: not expired (PAIR-02)
    if (pair.inviteCodeExpiry.toDate() < new Date()) {
      throw new HttpsError('deadline-exceeded', 'Invite code has expired')
    }
    // SEC-05 Check 2: not already used (PAIR-05)
    if (pair.inviteCodeUsed) {
      throw new HttpsError('already-exists', 'Invite code has already been used')
    }
    // SEC-05 Check 3: pair not full (PAIR-04)
    if (pair.members.length >= 2) {
      throw new HttpsError('resource-exhausted', 'Pair is already full')
    }
    // SEC-05 Check 4: cannot join own pair
    if (pair.createdBy === uid) {
      throw new HttpsError('invalid-argument', 'You cannot join your own pair')
    }
    // SEC-05 Check 5: joiner not already in a pair (PAIR-06)
    if (!joinerSnap.exists) {
      throw new HttpsError('not-found', 'User not found')
    }
    if (joinerSnap.data()!.pairId !== null) {
      throw new HttpsError('already-exists', 'You are already in a pair')
    }

    // ALL WRITES — all conditions passed
    const creatorRef = db.doc(`users/${pair.createdBy}`)

    tx.update(pairRef, {
      inviteCodeUsed: true,
      members: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    })
    // Set pairId on BOTH users atomically — triggers both D-01 and D-03 onSnapshot listeners
    tx.update(joinerRef, { pairId: pairRef.id, updatedAt: FieldValue.serverTimestamp() })
    tx.update(creatorRef, { pairId: pairRef.id, updatedAt: FieldValue.serverTimestamp() })
  })

  return { pairId: pairRef.id }
})

/**
 * Submits today's entry (photo and/or text) for the authenticated user.
 * Validates input, derives pairId from server-side user doc, writes submission
 * subcollection doc and entry doc inside a single Firestore transaction.
 *
 * SUBM-01–04, SUBM-07: photo/text submission, at-least-one, idempotent, local-date key.
 * Phase 3 only — does NOT auto-reveal (status stays 'one_submitted'); Phase 4 adds that.
 */
export const submitEntry = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in')
  }

  const parsed = SubmitEntrySchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid submission data')
  }

  const { entryDate, text, photoURL } = parsed.data
  const uid = request.auth.uid
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)

  await db.runTransaction(async (tx) => {
    // ALL READS BEFORE WRITES — Admin SDK constraint (see joinPair pattern)
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found')
    }
    const userData = userSnap.data()!
    if (!userData.pairId) {
      throw new HttpsError('failed-precondition', 'You are not in a pair yet')
    }
    const pairId: string = userData.pairId

    // Build refs after pairId is validated server-side — never from request.data
    const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
    const submissionRef = entryRef.collection('submissions').doc(uid)

    // READ 2: entry doc (may not exist on first submission)
    const entrySnap = await tx.get(entryRef)

    // SUBM-04: idempotent guard — check before any writes
    const existingMembers: string[] = entrySnap.exists
      ? (entrySnap.data()!.submittedMembers ?? [])
      : []
    if (existingMembers.includes(uid)) {
      throw new HttpsError('already-exists', 'You have already submitted today')
    }

    // WRITE 1: submission subcollection doc
    tx.set(submissionRef, {
      uid,
      photoURL: photoURL ?? null,
      text: text ?? null,
      submittedAt: FieldValue.serverTimestamp(),
    })

    // WRITE 2: entry doc — MUST branch on exists (tx.update on non-existent throws)
    if (!entrySnap.exists) {
      tx.set(entryRef, {
        pairId,
        date: entryDate,
        status: 'one_submitted',
        submittedMembers: [uid],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      tx.update(entryRef, {
        submittedMembers: FieldValue.arrayUnion(uid),
        status: 'one_submitted',
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  })

  return { entryDate, alreadySubmitted: false }
})
