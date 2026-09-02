import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { user } from 'firebase-functions/v1/auth'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { z } from 'zod'

// Must be set before initializeApp() so Admin SDK routes to Firestore emulator.
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
}

initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
})

// Best-effort push notification — never throws, never blocks the caller's response.
async function sendPush(token: string, title: string, body: string): Promise<void> {
  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        fcmOptions: { link: '/home' },
      },
    })
  } catch (err: unknown) {
    // Stale / invalid token — remove it so we don't waste FCM quota on future sends
    const code = (err as { code?: string }).code
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token') {
      console.warn('[sendPush] stale token, clearing:', token.slice(0, 20))
    } else {
      console.warn('[sendPush] failed:', err)
    }
  }
}

// Fetch fcmToken for a uid (null if not set or user doc missing)
async function getToken(db: ReturnType<typeof getFirestore>, uid: string): Promise<string | null> {
  const snap = await db.doc(`users/${uid}`).get()
  return (snap.data()?.fcmToken as string | null) ?? null
}

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
      fcmToken: null,
      reminderTime: null,
      lastDissolvedAt: null,
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
    text: z.string().max(500).nullable().optional(),
    photoURL: z.url().nullable().optional(),
    audioURL: z.url().nullable().optional(),
    mood: z.string().max(20).nullable().optional(),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
    songURL: z.string().url().regex(/^https:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/[A-Za-z0-9]+/).nullable().optional(),
    sketchURL: z.url().nullable().optional(),
    tags: z.preprocess(v => v ?? [], z.array(z.string().max(20)).max(5)),
  })
  .superRefine((data, ctx) => {
    if (!data.photoURL && !data.text?.trim() && !data.audioURL && !data.location && !data.songURL && !data.sketchURL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of photo, text, audio, location, song, or sketch is required',
        path: ['photoURL'],
      })
    }
  })

// App Check disabled until Phase 6 (reCAPTCHA not yet configured).
// cors:true required for emulator cross-origin requests from localhost dev server.
const callableOptions = { cors: true }

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

  console.log('[joinPair] querying pairs for inviteCode:', inviteCode, 'uid:', uid)
  // Query outside transaction — collection queries cannot run inside Firestore transactions (Pitfall 3)
  const pairsSnap = await db.collection('pairs').where('inviteCode', '==', inviteCode).limit(1).get()
  console.log('[joinPair] query done, empty:', pairsSnap.empty)
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
    console.error('[submitEntry] validation errors:', JSON.stringify(parsed.error.issues))
    throw new HttpsError('invalid-argument', 'Invalid submission data')
  }

  const { entryDate, text, photoURL, audioURL = null, mood = null, location = null, songURL = null, sketchURL = null } = parsed.data
  const tags = parsed.data.tags
  const uid = request.auth.uid
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)

  let isResubmission = false

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

    // READ 2+3: entry doc and existing submission doc (reads must precede writes)
    const [entrySnap, submissionSnap] = await Promise.all([
      tx.get(entryRef),
      tx.get(submissionRef),
    ])

    const existingMembers: string[] = entrySnap.exists
      ? (entrySnap.data()!.submittedMembers ?? [])
      : []
    isResubmission = existingMembers.includes(uid)

    // WRITE 1: submission doc — accumulate into arrays on re-submission
    if (!submissionSnap.exists) {
      tx.set(submissionRef, {
        uid,
        photoURLs: photoURL ? [photoURL] : [],
        audioURLs: audioURL ? [audioURL] : [],
        texts: text ? [text] : [],
        mood: mood ?? null,
        location: location ?? null,
        songURLs: songURL ? [songURL] : [],
        songURL: songURL ?? null,
        sketchURL: sketchURL ?? null,
        tags: tags ?? [],
        submittedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const existing = submissionSnap.data()!
      const existingPhotos: string[] = existing.photoURLs ?? (existing.photoURL ? [existing.photoURL] : [])
      const existingAudios: string[] = existing.audioURLs ?? []
      const existingTexts: string[] = existing.texts ?? (existing.text ? [existing.text] : [])
      const existingSongs: string[] = existing.songURLs ?? (existing.songURL ? [existing.songURL] : [])
      const updatedSongs: string[] = songURL ? [...existingSongs, songURL] : existingSongs
      tx.set(submissionRef, {
        uid,
        photoURLs: photoURL ? [...existingPhotos, photoURL] : existingPhotos,
        audioURLs: audioURL ? [...existingAudios, audioURL] : existingAudios,
        texts: text ? [...existingTexts, text] : existingTexts,
        mood: mood ?? existing.mood ?? null,
        location: location ?? existing.location ?? null,
        songURLs: updatedSongs,
        songURL: updatedSongs[updatedSongs.length - 1] ?? null,
        sketchURL: sketchURL ?? existing.sketchURL ?? null,
        tags: tags?.length ? tags : (existing.tags ?? []),
        photoURL: null,
        text: null,
        submittedAt: existing.submittedAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

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
    } else if (!isResubmission) {
      tx.update(entryRef, {
        submittedMembers: FieldValue.arrayUnion(uid),
        status: 'one_submitted',
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      // Re-submission: just touch updatedAt (submittedMembers already has uid)
      tx.update(entryRef, { updatedAt: FieldValue.serverTimestamp() })
    }
  })

  // Notify partner (best-effort, outside transaction so it never blocks the response)
  try {
    const db2 = getFirestore()
    const userSnap2 = await db2.doc(`users/${uid}`).get()
    const pairId2: string = userSnap2.data()!.pairId
    const pairSnap2 = await db2.doc(`pairs/${pairId2}`).get()
    const members2: string[] = pairSnap2.data()!.members ?? []
    const partnerId = members2.find((m) => m !== uid)
    if (partnerId) {
      const partnerToken = await getToken(db2, partnerId)
      if (partnerToken) {
        await sendPush(partnerToken, 'Bird Eye', 'Your partner shared something today 🌿')
      }
    }
  } catch (err) {
    console.warn('[submitEntry] notification failed:', err)
  }

  return { entryDate, alreadySubmitted: isResubmission }
})

/**
 * Firestore trigger: auto-reveals an entry when the second submission lands.
 * Runs inside a transaction to guard against double-fire (idempotent status check).
 *
 * Phase 4: REVEAL-01 (auto-reveal when both members have submitted).
 */
export const autoReveal = onDocumentWritten(
  'pairs/{pairId}/entries/{entryDate}/submissions/{uid}',
  async (event) => {
    // Ignore deletes
    if (!event.data?.after.exists) return

    const { pairId, entryDate } = event.params
    const db = getFirestore()
    const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)

    let didReveal = false
    let memberUids: string[] = []

    await db.runTransaction(async (tx) => {
      const entrySnap = await tx.get(entryRef)
      if (!entrySnap.exists) return
      const entry = entrySnap.data()!
      // Guard: only reveal when 2 members submitted and not already revealed
      memberUids = entry.submittedMembers ?? []
      if (memberUids.length < 2) return
      if (entry.status === 'revealed') return

      tx.update(entryRef, {
        status: 'revealed',
        revealedBy: 'auto',
        revealReason: 'auto',
        revealedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      didReveal = true
    })

    // Notify both members (best-effort)
    if (didReveal && memberUids.length === 2) {
      await Promise.allSettled(
        memberUids.map(async (memberId) => {
          const token = await getToken(db, memberId)
          if (token) await sendPush(token, 'Bird Eye', "Both of you shared today — it's revealed! 🌿")
        })
      )
    }
  }
)

const RevealAnywaySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Callable: lets a user who has already submitted reveal the entry early
 * without waiting for their partner.
 *
 * Phase 4: REVEAL-02 (reveal-anyway, manual trigger).
 */
export const revealAnyway = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
  const parsed = RevealAnywaySchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid entry date')
  const { entryDate } = parsed.data
  const uid = request.auth.uid
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')
    const pairId: string = userSnap.data()!.pairId
    if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

    const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
    const entrySnap = await tx.get(entryRef)
    if (!entrySnap.exists) throw new HttpsError('not-found', 'Entry not found')
    const entry = entrySnap.data()!

    if (!(entry.submittedMembers ?? []).includes(uid)) {
      throw new HttpsError('failed-precondition', 'You have not submitted today')
    }
    if (entry.status === 'revealed') {
      throw new HttpsError('already-exists', 'Entry already revealed')
    }

    tx.update(entryRef, {
      status: 'revealed',
      revealedBy: uid,
      revealReason: 'manual',
      revealedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  // Notify partner (best-effort)
  try {
    const db2 = getFirestore()
    const userSnap2 = await db2.doc(`users/${uid}`).get()
    const pairId2: string = userSnap2.data()!.pairId
    const pairSnap2 = await db2.doc(`pairs/${pairId2}`).get()
    const members2: string[] = pairSnap2.data()!.members ?? []
    const partnerId = members2.find((m) => m !== uid)
    if (partnerId) {
      const partnerToken = await getToken(db2, partnerId)
      if (partnerToken) {
        await sendPush(partnerToken, 'Bird Eye', 'Your partner revealed — come see what they shared 🌿')
      }
    }
  } catch (err) {
    console.warn('[revealAnyway] notification failed:', err)
  }

  return { entryDate, revealed: true }
})

const ReactToEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emoji: z.string().max(8),
})

/**
 * Sets or clears the calling user's emoji reaction on a revealed entry.
 * Empty string emoji clears the reaction.
 */
export const reactToEntry = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
  const parsed = ReactToEntrySchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input')

  const { entryDate, emoji } = parsed.data
  const uid = request.auth.uid
  const db = getFirestore()

  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')
  const pairId: string = userSnap.data()!.pairId
  if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

  const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
  const entrySnap = await entryRef.get()
  if (!entrySnap.exists) throw new HttpsError('not-found', 'Entry not found')
  if (entrySnap.data()!.status !== 'revealed') {
    throw new HttpsError('failed-precondition', 'Entry not yet revealed')
  }

  if (emoji) {
    await entryRef.update({ [`reactions.${uid}`]: emoji, updatedAt: FieldValue.serverTimestamp() })
  } else {
    // Empty string = clear reaction (use FieldValue.delete())
    await entryRef.update({ [`reactions.${uid}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  }

  return { entryDate, emoji }
})

/**
 * Sends a "thinking of you" ping to the partner — writes to pair doc + FCM push.
 * Rate-limited by the client (30s cooldown enforced in UI).
 */
export const sendPing = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
  const uid = request.auth.uid
  const db = getFirestore()

  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')
  const pairId: string = userSnap.data()!.pairId
  if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

  await db.doc(`pairs/${pairId}`).update({
    lastPing: { from: uid, at: FieldValue.serverTimestamp() },
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Notify partner
  const pairSnap = await db.doc(`pairs/${pairId}`).get()
  const members: string[] = pairSnap.data()!.members ?? []
  const partnerId = members.find((m) => m !== uid)
  if (partnerId) {
    const partnerToken = await getToken(db, partnerId)
    if (partnerToken) await sendPush(partnerToken, 'Bird Eye', '💭 Thinking of you')
  }

  return { sent: true }
})

const MILESTONES: Record<number, string> = {
  1:   '🌿 First reveal! You started something.',
  7:   '✨ 7 reveals — a whole week of this.',
  10:  '🌱 10 reveals — still showing up.',
  30:  '🌸 30 reveals. A whole month.',
  50:  '🍃 50 reveals. This is becoming something real.',
  100: '🎉 100 reveals together. You built this.',
  200: "💚 200 reveals. Look how far you've come.",
  365: '🌳 365 reveals. A full year of this.',
}

/**
 * Fires FCM milestone notifications when the revealed entry count crosses
 * a threshold for the first time. Idempotent — tracks fired milestones on pair doc.
 */
export const checkMilestones = onDocumentWritten(
  'pairs/{pairId}/entries/{entryDate}',
  async (event) => {
    const after = event.data?.after
    if (!after?.exists) return
    if (after.data()?.status !== 'revealed') return

    const { pairId } = event.params
    const db = getFirestore()
    const pairRef = db.doc(`pairs/${pairId}`)

    const pairSnap = await pairRef.get()
    if (!pairSnap.exists) return
    const pair = pairSnap.data()!
    const alreadyFired: string[] = pair.milestonesFired ?? []

    // Count all revealed entries for this pair
    const revealedSnap = await db
      .collection(`pairs/${pairId}/entries`)
      .where('status', '==', 'revealed')
      .count()
      .get()
    const count = revealedSnap.data().count

    const newMilestones = Object.keys(MILESTONES)
      .map(Number)
      .filter((n) => count >= n && !alreadyFired.includes(String(n)))

    if (!newMilestones.length) return

    // Mark all new milestones as fired atomically
    await pairRef.update({
      milestonesFired: FieldValue.arrayUnion(...newMilestones.map(String)),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Notify both members with the highest milestone message
    const highestMilestone = Math.max(...newMilestones)
    const message = MILESTONES[highestMilestone]
    const members: string[] = pair.members ?? []

    await Promise.allSettled(
      members.map(async (uid) => {
        const token = await getToken(db, uid)
        if (token) await sendPush(token, 'Bird Eye', message)
      })
    )
  }
)

// ── Summaries ────────────────────────────────────────────────────────────────

async function generateSummary(type: 'weekly' | 'monthly'): Promise<void> {
  const db = getFirestore()
  const now = new Date()

  let startDate: string
  let endDate: string
  let periodKey: string
  let label: string
  let pushTitle: string

  if (type === 'weekly') {
    const thisMonday = new Date(now.valueOf())
    thisMonday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()))
    const prevMonday = new Date(thisMonday.valueOf())
    prevMonday.setDate(thisMonday.getDate() - 7)
    const prevSunday = new Date(thisMonday.valueOf())
    prevSunday.setDate(thisMonday.getDate() - 1)
    startDate = prevMonday.toISOString().slice(0, 10)
    endDate = prevSunday.toISOString().slice(0, 10)
    periodKey = `weekly-${startDate}`
    label = 'last week'
    pushTitle = '📅 Weekly summary'
  } else {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = prevMonth.getFullYear()
    const m = String(prevMonth.getMonth() + 1).padStart(2, '0')
    startDate = `${y}-${m}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    periodKey = `monthly-${y}-${m}`
    label = prevMonth.toLocaleString('en-US', { month: 'long' })
    pushTitle = '🗓️ Monthly summary'
  }

  const pairsSnap = await db.collection('pairs').get()

  await Promise.allSettled(
    pairsSnap.docs.map(async (pairDoc) => {
      const pair = pairDoc.data()
      const members: string[] = pair.members ?? []
      if (members.length !== 2) return

      const countSnap = await db
        .collection(`pairs/${pairDoc.id}/entries`)
        .where('status', '==', 'revealed')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .count()
        .get()

      const revealCount: number = countSnap.data().count
      if (revealCount === 0) return

      await db.doc(`pairs/${pairDoc.id}/summaries/${periodKey}`).set({
        type,
        period: periodKey,
        label,
        revealCount,
        createdAt: FieldValue.serverTimestamp(),
      })

      const body = revealCount === 1
        ? `1 reveal ${label}`
        : `${revealCount} reveals ${label}`

      await Promise.allSettled(
        members.map(async (uid) => {
          const token = await getToken(db, uid)
          if (token) await sendPush(token, pushTitle, body)
        })
      )
    })
  )
}

// ── Leave pair ────────────────────────────────────────────────────────────────

export const leavePair = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not signed in')
  const uid = request.auth.uid
  const db = getFirestore()

  const userRef = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')

  const pairId: string | null = userSnap.data()?.pairId ?? null
  if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

  const pairRef = db.doc(`pairs/${pairId}`)
  const pairSnap = await pairRef.get()
  if (!pairSnap.exists) throw new HttpsError('not-found', 'Pair not found')

  const members: string[] = pairSnap.data()?.members ?? []
  const partnerId = members.find((m) => m !== uid) ?? null

  await db.runTransaction(async (tx) => {
    tx.update(pairRef, {
      dissolvedAt: FieldValue.serverTimestamp(),
      dissolvedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(userRef, {
      pairId: null,
      lastDissolvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (partnerId) {
      tx.update(db.doc(`users/${partnerId}`), {
        pairId: null,
        lastDissolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  })

  if (partnerId) {
    const token = await getToken(db, partnerId)
    if (token) await sendPush(token, '🌿 Bird Eye', 'Your partner has left the pair.')
  }

  return { success: true }
})

// ── Entry deletion (mutual consent) ──────────────────────────────────────────

const EntryDateSchema = z.object({ entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

export const requestEntryDeletion = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not signed in')
  const uid = request.auth.uid
  const parsed = EntryDateSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid data')

  const { entryDate } = parsed.data
  const db = getFirestore()

  const userSnap = await db.doc(`users/${uid}`).get()
  const pairId: string | null = userSnap.data()?.pairId ?? null
  if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

  const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
  const entrySnap = await entryRef.get()
  if (!entrySnap.exists) throw new HttpsError('not-found', 'Entry not found')

  const entry = entrySnap.data()!
  if (entry.status !== 'revealed') throw new HttpsError('failed-precondition', 'Entry not revealed')
  if (entry.deletionRequest) throw new HttpsError('already-exists', 'Deletion already requested')

  await entryRef.update({
    deletionRequest: { requestedBy: uid, requestedAt: FieldValue.serverTimestamp() },
    updatedAt: FieldValue.serverTimestamp(),
  })

  const pairData = (await db.doc(`pairs/${pairId}`).get()).data()
  const partnerId = (pairData?.members as string[] ?? []).find((m) => m !== uid)
  if (partnerId) {
    const token = await getToken(db, partnerId)
    if (token) await sendPush(token, '🌿 Bird Eye', 'Your partner wants to delete a shared entry.')
  }

  return { entryDate }
})

export const respondEntryDeletion = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not signed in')
  const uid = request.auth.uid
  const parsed = z.object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accept: z.boolean(),
  }).safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid data')

  const { entryDate, accept } = parsed.data
  const db = getFirestore()

  const userSnap = await db.doc(`users/${uid}`).get()
  const pairId: string | null = userSnap.data()?.pairId ?? null
  if (!pairId) throw new HttpsError('failed-precondition', 'Not in a pair')

  const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
  const entrySnap = await entryRef.get()
  if (!entrySnap.exists) throw new HttpsError('not-found', 'Entry not found')

  const entry = entrySnap.data()!
  if (!entry.deletionRequest) throw new HttpsError('failed-precondition', 'No deletion request')
  if (entry.deletionRequest.requestedBy === uid) {
    throw new HttpsError('failed-precondition', 'Cannot respond to your own request')
  }

  const requesterId: string = entry.deletionRequest.requestedBy

  if (!accept) {
    await entryRef.update({ deletionRequest: null, updatedAt: FieldValue.serverTimestamp() })
    const token = await getToken(db, requesterId)
    if (token) await sendPush(token, '🌿 Bird Eye', 'Your deletion request was declined.')
    return { entryDate, deleted: false }
  }

  // Accepted — delete submissions then entry doc
  const pairSnap = await db.doc(`pairs/${pairId}`).get()
  const members: string[] = pairSnap.data()?.members ?? []
  const batch = db.batch()
  for (const memberId of members) {
    batch.delete(entryRef.collection('submissions').doc(memberId))
  }
  batch.delete(entryRef)
  await batch.commit()

  // Best-effort Storage cleanup
  try {
    const { getStorage } = await import('firebase-admin/storage')
    await getStorage().bucket().deleteFiles({ prefix: `pairs/${pairId}/entries/${entryDate}/` })
  } catch (err) {
    console.warn('[respondEntryDeletion] storage cleanup partial:', err)
  }

  const token = await getToken(db, requesterId)
  if (token) await sendPush(token, '🌿 Bird Eye', 'The entry has been deleted.')

  return { entryDate, deleted: true }
})

// Every Monday at 9 am UTC — summarises the previous Mon–Sun week
export const weeklySummary = onSchedule('0 9 * * 1', async () => {
  await generateSummary('weekly')
})

// 1st of every month at 9 am UTC — summarises the previous calendar month
export const monthlySummary = onSchedule('0 9 1 * *', async () => {
  await generateSummary('monthly')
})

// ── Daily reminder ────────────────────────────────────────────────────────────

// Runs every hour on the hour. For each user with a reminderTime set,
// checks if the current hour in their timezone matches — and pushes a
// reminder if they haven't submitted today.
export const dailyReminder = onSchedule('0 * * * *', async () => {
  const db = getFirestore()
  const now = new Date()

  const usersSnap = await db.collection('users')
    .where('reminderTime', '!=', null)
    .get()

  await Promise.allSettled(
    usersSnap.docs.map(async (userSnap) => {
      const data = userSnap.data()
      const rt = data.reminderTime as { hour: number; tz: string } | null
      if (!rt || rt.hour == null || !rt.tz) return

      // Resolve user's current local hour
      let userHour: number
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: rt.tz,
          hour: 'numeric',
          hour12: false,
          hourCycle: 'h23',
        }).formatToParts(now)
        userHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '-1', 10)
      } catch {
        return // invalid timezone stored — skip
      }
      if (userHour !== rt.hour) return

      // Resolve user's today date string (YYYY-MM-DD) in their timezone
      const todayInTz = new Intl.DateTimeFormat('en-CA', {
        timeZone: rt.tz,
      }).format(now)

      const uid = userSnap.id
      const pairId: string | null = data.pairId ?? null
      if (!pairId) return

      // Skip if already submitted today
      const entrySnap = await db.doc(`pairs/${pairId}/entries/${todayInTz}`).get()
      if (entrySnap.exists) {
        const submitted: string[] = entrySnap.data()?.submittedMembers ?? []
        if (submitted.includes(uid)) return
      }

      const token: string | null = data.fcmToken ?? null
      if (!token) return

      await sendPush(
        token,
        '🌿 Bird Eye',
        "You haven't shared today yet — what reminded you of them?"
      )
    })
  )
})

// ── Yearly summary (fires Jan 1 at 10:00 UTC) ────────────────────────────────

export const yearlySummary = onSchedule('0 10 1 1 *', async () => {
  const db = getFirestore()
  const now = new Date()
  const year = now.getFullYear() - 1
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  const periodKey = `yearly-${year}`
  const label = String(year)

  const pairsSnap = await db.collection('pairs').where('dissolvedAt', '==', null).get()

  await Promise.allSettled(
    pairsSnap.docs.map(async (pairDoc) => {
      const pairId = pairDoc.id
      const members: string[] = pairDoc.data().members ?? []
      if (members.length < 2) return

      const existing = await db
        .collection(`pairs/${pairId}/summaries`)
        .where('period', '==', periodKey)
        .limit(1)
        .get()
      if (!existing.empty) return

      const revealedSnap = await db
        .collection(`pairs/${pairId}/entries`)
        .where('status', '==', 'revealed')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get()
      const revealCount = revealedSnap.size
      if (revealCount === 0) return

      await db.collection(`pairs/${pairId}/summaries`).add({
        type: 'yearly',
        period: periodKey,
        label,
        revealCount,
        createdAt: FieldValue.serverTimestamp(),
      })

      const body = `You shared ${revealCount} moment${revealCount === 1 ? '' : 's'} together in ${year}. 🌿`
      await Promise.allSettled(
        members.map(async (uid) => {
          const token = await getToken(db, uid)
          if (token) await sendPush(token, `🌳 ${year} in review`, body)
        })
      )
    })
  )
})

