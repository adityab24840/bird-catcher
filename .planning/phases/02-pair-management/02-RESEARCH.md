# Phase 2: Pair Management — Research

**Researched:** 2026-08-31
**Domain:** Firebase Cloud Functions v2 onCall, Firestore transactions, Firebase App Check, React routing guards
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Unpaired authenticated users land on `/pair-setup`. App.tsx route guard: if `user` exists but `pairId === null`, redirect to `/pair-setup`. After pairing, redirect to `/home`.
- **D-02:** Single `/pair-setup` screen with two equal-weight CTAs: "Create a pair" and "Join with code". Follows max-w-sm card pattern from Phase 1.
- **D-03:** After `createPair` resolves, display the 6-character code in a styled code box with a single "Copy code" button (`navigator.clipboard.writeText`). User A stays on `/pair-setup` in a "waiting" state (code visible) until their `users/{uid}.pairId` becomes non-null (via onSnapshot listener), then auto-redirect to `/home`.
- **D-04:** 6-character uppercase input field. Auto-submit (call `joinPair`) when the 6th character is entered — no separate submit button.
- **D-05:** After pairing, `/home` shows partner's display name and photo (fetched via `users/{partnerId}`) plus a brief "You're connected" message. Phase 3 replaces this content area. Sign-out button retained.

### Claude's Discretion

- Real-time pairing update strategy: use onSnapshot on `users/{uid}` to detect `pairId` becoming non-null; auto-redirect. Implementation detail for planner.
- App Check initialization (SEC-07): timing and debug-token config for emulator — follow Firebase App Check v2 patterns; debug token via env var.
- Error states for invalid/expired/already-used codes and already-paired users: standard inline error pattern below the input field.
- Firestore rules for `pairs/{pairId}` document: structure and read/write permissions are implementation decisions for the planner/researcher.
- Invite code generation algorithm (alphanumeric, 6 chars, nanoid or crypto.randomBytes): planner's choice.

### Deferred Ideas (OUT OF SCOPE)

- QR code for invite sharing — mentioned but deferred; too heavy for Phase 2
- Native share sheet (navigator.share) — simpler copy button chosen instead
- App Check enforcement level details (debug vs enforce): leave to researcher/planner
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAIR-01 | User can create a private two-person space and receive a 6-character alphanumeric invite code | `createPair` Cloud Function v2 with `crypto.randomBytes(3).toString('hex').toUpperCase()` |
| PAIR-02 | Invite code expires after 24 hours | `inviteCodeExpiry: Timestamp` field on pairs doc; `joinPair` rejects if `now > expiry` |
| PAIR-03 | Second user can join pair by entering invite code | `joinPair` Cloud Function v2 queries by `inviteCode`, validates, atomically joins |
| PAIR-04 | Pair membership capped at exactly 2 members — enforced server-side | `joinPair` rejects if `members.length >= 2` inside the Firestore transaction |
| PAIR-05 | Invite code is single-use — invalidated immediately after successful join | `joinPair` sets `inviteCodeUsed: true` atomically on successful join |
| PAIR-06 | User already in a pair cannot join or create another pair | Both functions check `users/{uid}.pairId !== null` inside their transactions |
| SEC-05 | `joinPair` validates all 5 conditions inside a single Firestore transaction | Full validation checklist inside `db.runTransaction()` — see Patterns section |
| SEC-07 | Firebase App Check enabled on Cloud Functions to mitigate invite code brute-force | `enforceAppCheck: true` in CallableOptions; `initializeAppCheck` in client config |
</phase_requirements>

---

## Summary

Phase 2 adds the pair-formation flow on top of the authenticated shell from Phase 1. Two Cloud Functions handle all state mutations: `createPair` generates a 6-character invite code and initialises the pair document, while `joinPair` atomically validates the code and links both users. All business rules — expiry, single-use, membership cap, already-paired check — live exclusively in Cloud Function transactions, never in client code or Firestore rules alone.

The critical design decision for D-03 (User A waits on `/pair-setup` until partner joins) has a non-obvious implementation consequence: `createPair` must NOT set `users/{creatorUid}.pairId` immediately. Instead, it creates the `pairs/{pairId}` document with `members: [creatorUid]` only. Then `joinPair` sets BOTH users' `pairId` in a single atomic transaction. This means `users/{uid}.pairId` transitions from `null` to a value only when the pair is complete (2 members), making the onSnapshot-based redirect in D-03 correct and symmetric for both users.

Firebase App Check (SEC-07) is initialized client-side with `ReCaptchaV3Provider` in production and the debug provider (via `VITE_APP_CHECK_DEBUG_TOKEN`) for emulator sessions. Both `createPair` and `joinPair` use `enforceAppCheck: true` in their `CallableOptions`.

**Primary recommendation:** `createPair` does not touch `users/{uid}.pairId`; `joinPair` atomically sets both users' `pairId` and invalidates the invite code. This is the only design that satisfies D-01 + D-03 without an extra "pair complete" boolean or a members-count listener in the routing layer.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invite code generation | Cloud Function | — | Must be server-side; client-generated codes are untrusted |
| Pair membership enforcement | Cloud Function (Firestore transaction) | Firestore Security Rules (secondary guard) | SEC-05 requires single-transaction validation; rules block direct client writes as defense-in-depth |
| pairId routing guard | Frontend (App.tsx) | — | UI concern; backed by server-authoritative pairId from Firestore |
| Real-time pairId detection | Frontend (onSnapshot) | — | Client subscribes to its own user doc for redirect trigger |
| Invite code brute-force mitigation | App Check (Cloud Functions) | — | SEC-07: enforceAppCheck on both callables |
| Partner profile read after pairing | Firestore Security Rules | — | Allows pair members to read each other's user docs |
| Input validation (invite code format) | Client + Cloud Function | — | Client validates for UX; function validates with Zod for security |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase (JS SDK) | 12.18.0 | Client-side Firestore, Auth, App Check | Project constraint — Firebase only |
| firebase-functions | 7.3.2 | Cloud Functions v2 onCall | Project constraint — CF v2 for all mutations |
| firebase-admin | 14.3.0 | Admin SDK in Cloud Functions (Firestore, FieldValue) | Standard Admin SDK for server-side Firestore |
| zod | 4.5.4 | Input validation in Cloud Functions | Project constraint — Zod 4 for all schema validation |

[VERIFIED: npm registry] — all four packages confirmed at these versions via `npm view` during research.

### No New Packages Required

Phase 2 installs zero new npm packages. All required functionality is in the existing dependency tree:
- `firebase/app-check` — already in the firebase 12.18.0 package [VERIFIED: npm registry]
- `crypto` — Node.js built-in, available in Cloud Functions Node 22 runtime
- `@firebase/rules-unit-testing` 5.0.2 — already installed for emulator rule tests

### Installation

```bash
# No new installs required for Phase 2
# Confirm existing deps are installed:
cd shared-reveal && npm install
cd shared-reveal/functions && npm install
```

---

## Package Legitimacy Audit

Phase 2 adds no new packages. All packages used are pre-existing project dependencies verified at project setup.

| Package | Registry | Age | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|
| firebase | npm | 8+ yrs | OK (pre-existing) | Approved |
| firebase-functions | npm | 8+ yrs | OK (pre-existing) | Approved |
| firebase-admin | npm | 8+ yrs | OK (pre-existing) | Approved |
| zod | npm | 4+ yrs | OK (pre-existing) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User A (browser)                    Firestore                      User B (browser)
      |                                  |                                |
  [PairSetupPage]                        |                          [PairSetupPage]
  "Create" click                         |                          "Join" + 6-char code
      |                                  |                                |
      v                                  |                                v
  httpsCallable("createPair")            |                    httpsCallable("joinPair")
      |                                  |                                |
      v                                  |                                v
[createPair Cloud Function]             |               [joinPair Cloud Function]
  - check user not paired               |                 - query pairs by inviteCode
  - generate 6-char code                |                 - runTransaction:
  - runTransaction:                     |                   . get pairDoc (validate all 5)
    . get userDoc (re-check)            |                   . get joinerUserDoc
    . set pairs/{pairId}                |                   . update pairDoc.members
    . (does NOT set userDoc.pairId)     |                   . set joinerUserDoc.pairId
  - return { pairId, inviteCode }       |                   . set creatorUserDoc.pairId
      |                                 |                                |
      |   [pairs/{pairId} created]------+------[pairs/{pairId} updated] |
      |   members: [creatorUid]         |      members: [creatorUid, joinerUid]
      |                                 |      inviteCodeUsed: true      |
      |                                 |                                |
  [show invite code + spinner]          |      [users/{creatorUid}.pairId set]
  [onSnapshot: users/{uid}.pairId]      |      [users/{joinerUid}.pairId set]
      |                                 |                                |
      +--- pairId null→non-null --------+-------- pairId null→non-null --+
      |                                                                  |
      v                                                                  v
  Navigate("/home")                                              Navigate("/home")
  [HomePage: fetch users/{partnerId}]                      [HomePage: fetch users/{partnerId}]
  show partner name + avatar                               show partner name + avatar
```

### Recommended Project Structure

```
shared-reveal/src/
├── hooks/
│   ├── useAuth.ts           # existing — returns user, loading
│   └── usePairId.ts         # NEW — onSnapshot on users/{uid}, returns pairId, pairLoading
├── pages/
│   ├── LandingPage.tsx      # existing
│   ├── HomePage.tsx         # extend — show partner info when pairId non-null
│   └── PairSetupPage.tsx    # NEW — Create / Join flow, invite code display, join input
├── components/
│   └── InviteCodeBox.tsx    # NEW (optional) — styled code display + copy button
├── services/
│   └── pair.ts              # NEW — createPair() and joinPair() callable wrappers
├── types/
│   └── index.ts             # extend — add PairDoc interface
└── firebase/
    └── config.ts            # extend — add initializeAppCheck()

shared-reveal/functions/src/
└── index.ts                 # extend — add createPair, joinPair v2 onCall exports

shared-reveal/
└── firestore.rules          # extend — add pairs/{pairId} rules + partner read rule
```

### Pattern 1: createPair Cloud Function v2

**What:** Creates a pair document with a 6-char invite code. Does NOT set creator's `pairId` — that happens when the second user joins.

**When to use:** User A taps "Create a pair" on PairSetupPage.

```typescript
// Source: firebase-functions/v2/providers/https.d.ts (verified in node_modules)
// Source: Firebase callable functions docs — https://firebase.google.com/docs/functions/callable
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

export const createPair = onCall(
  { enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const userRef = db.doc(`users/${uid}`)

    // Invite code: 6 uppercase hex chars from crypto.randomBytes
    // crypto is a Node.js built-in — no package install needed
    const { randomBytes } = await import('node:crypto')
    const inviteCode = randomBytes(3).toString('hex').toUpperCase()

    // Expiry: 24 hours from now
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)

    const pairRef = db.collection('pairs').doc() // auto-ID

    await db.runTransaction(async (tx) => {
      // Re-read userDoc inside transaction to guard against concurrent createPair
      const userSnap = await tx.get(userRef)
      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User document not found')
      }
      if (userSnap.data()!.pairId !== null) {
        throw new HttpsError('already-exists', 'You are already in a pair')
      }

      // Write pair doc — do NOT write userRef.pairId here (D-03 requires waiting state)
      tx.set(pairRef, {
        createdBy: uid,
        members: [uid],
        inviteCode,
        inviteCodeExpiry: expiresAt,
        inviteCodeUsed: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      // pairId intentionally NOT set on userRef — set by joinPair when pair is complete
    })

    return { pairId: pairRef.id, inviteCode }
  }
)
```

### Pattern 2: joinPair Cloud Function v2 — SEC-05 Transaction

**What:** Validates all 5 SEC-05 conditions in one transaction and links both users.

**When to use:** User B enters their 6th character in the invite code input.

```typescript
// Source: firebase-functions/v2/providers/https.d.ts (verified in node_modules)
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { z } from 'zod'

// Zod 4 validation — validate before hitting Firestore
const JoinPairSchema = z.object({
  inviteCode: z.string().length(6).regex(/^[A-F0-9]{6}$/),
})

export const joinPair = onCall(
  { enforceAppCheck: true },
  async (request) => {
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

    // Query pairs by inviteCode (outside transaction — narrows the document)
    const pairsSnap = await db
      .collection('pairs')
      .where('inviteCode', '==', inviteCode)
      .limit(1)
      .get()

    if (pairsSnap.empty) {
      throw new HttpsError('not-found', 'Invite code not found')
    }

    const pairRef = pairsSnap.docs[0].ref
    const joinerRef = db.doc(`users/${uid}`)

    await db.runTransaction(async (tx) => {
      // ALL READS BEFORE WRITES (Admin SDK constraint — same as client SDK)
      const [pairSnap, joinerSnap] = await Promise.all([
        tx.get(pairRef),
        tx.get(joinerRef),
      ])

      if (!pairSnap.exists) {
        throw new HttpsError('not-found', 'Pair not found')
      }

      const pair = pairSnap.data()!
      const now = new Date()

      // SEC-05 Check 1: not expired
      if (pair.inviteCodeExpiry.toDate() < now) {
        throw new HttpsError('deadline-exceeded', 'Invite code has expired')
      }
      // SEC-05 Check 2: not used
      if (pair.inviteCodeUsed) {
        throw new HttpsError('already-exists', 'Invite code has already been used')
      }
      // SEC-05 Check 3: pair has < 2 members (PAIR-04)
      if (pair.members.length >= 2) {
        throw new HttpsError('resource-exhausted', 'Pair is already full')
      }
      // SEC-05 Check 4: requester is not the creator (can't join own pair)
      if (pair.createdBy === uid) {
        throw new HttpsError('invalid-argument', 'You cannot join your own pair')
      }
      // SEC-05 Check 5: requester not already in a pair (PAIR-06)
      if (!joinerSnap.exists) {
        throw new HttpsError('not-found', 'User not found')
      }
      if (joinerSnap.data()!.pairId !== null) {
        throw new HttpsError('already-exists', 'You are already in a pair')
      }

      // ALL WRITES — atomic, all conditions passed
      const creatorRef = db.doc(`users/${pair.createdBy}`)

      tx.update(pairRef, {
        inviteCodeUsed: true,
        members: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      })
      // Set BOTH users' pairId — this triggers both onSnapshot listeners (D-01, D-03)
      tx.update(joinerRef, {
        pairId: pairRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(creatorRef, {
        pairId: pairRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    return { pairId: pairRef.id }
  }
)
```

### Pattern 3: usePairId Hook (Client)

**What:** Subscribes to `users/{uid}` in real-time and exposes `pairId`. When pairId transitions from null to non-null, App.tsx re-renders and the route guard redirects to `/home`.

```typescript
// Source: follows established pattern from shared-reveal/src/pages/HomePage.tsx (verified)
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'

interface PairState {
  pairId: string | null
  pairLoading: boolean
}

export function usePairId(uid: string | null): PairState {
  const [pairId, setPairId] = useState<string | null>(null)
  const [pairLoading, setPairLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setPairId(null)
      setPairLoading(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as UserDoc) : null
        setPairId(data?.pairId ?? null)
        setPairLoading(false)
      },
      (err) => {
        console.error('[usePairId] listener error:', err)
        setPairLoading(false)
      },
    )

    return () => unsub()
  }, [uid])

  return { pairId, pairLoading }
}
```

### Pattern 4: App.tsx Three-Tier Route Guard

**What:** Guards routes based on auth state AND pair state. The pair guard uses `pairId` from `usePairId`, which is driven by the server-authoritative `users/{uid}.pairId` field.

```typescript
// Source: extends shared-reveal/src/App.tsx (verified pattern)
const { user, loading } = useAuth()
const { pairId, pairLoading } = usePairId(user?.uid ?? null)

if (loading || (user && pairLoading)) {
  return <Spinner />
}

// Routes:
// / + signed out           → LandingPage
// / + signed in + no pair  → Navigate to /pair-setup
// / + signed in + paired   → Navigate to /home
// /pair-setup + no pair    → PairSetupPage
// /pair-setup + paired     → Navigate to /home
// /home + signed in        → HomePage
// /home + signed out       → Navigate to /
```

### Pattern 5: Firebase App Check Initialization

**What:** Adds App Check to the client. Must be called before any Callable function invocations.

```typescript
// Source: firebase/app-check module — verified in node_modules/@firebase/app-check/dist/app-check-public.d.ts
// Source: Firebase App Check docs — https://firebase.google.com/docs/app-check/web/recaptcha-provider
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { app } from './config' // existing Firebase app instance

// Debug mode: set global before initializeAppCheck().
// In emulator dev sessions, VITE_APP_CHECK_DEBUG_TOKEN=true auto-generates a debug token
// (visible in the browser console on first run). Register it in Firebase Console:
// Security → App Check → Apps → [your app] → Manage debug tokens.
if (import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN) {
  // @ts-expect-error — self global required by Firebase App Check debug provider
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
})
```

**Environment variables needed:**
- `VITE_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 site key (from Google reCAPTCHA console)
- `VITE_APP_CHECK_DEBUG_TOKEN` — set to `"true"` for auto-generate, or an explicit registered debug token UUID for CI

### Pattern 6: Firestore Security Rules Updates

**What:** Extends existing `firestore.rules` with pair collection rules and partner read access.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      // Existing: own read + own create + own update (no pairId from client)
      allow read: if request.auth != null && (
        // Own doc (existing rule)
        request.auth.uid == uid
        ||
        // Pair member can read partner's user doc for /home partner display (D-05)
        // resource.data.pairId is the target user's pairId; requester must be in that pair
        (
          resource.data.pairId != null
          && request.auth.uid in
             get(/databases/$(database)/documents/pairs/$(resource.data.pairId)).data.members
        )
      );

      allow create: if request.auth != null && request.auth.uid == uid;

      allow update: if request.auth != null
        && request.auth.uid == uid
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairId']);

      allow delete: if false;
    }

    match /pairs/{pairId} {
      // Members can read their pair document (to display invite code, member count, etc.)
      allow read: if request.auth != null
        && request.auth.uid in resource.data.members;

      // All writes go through Cloud Functions only
      allow write: if false;
    }

    // Catch-all deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Critical rule design note:** The partner read rule checks `resource.data.pairId` (the target user's pairId field) and verifies the requester is in that pair's members array. This rule is safe because:
- `pairId` on user docs is only written by Cloud Functions (the existing update rule blocks client writes to pairId)
- `members` on pair docs is only written by Cloud Functions (pairs have `allow write: if false`)
- Therefore, the requester being listed in members can only happen via the Cloud Function transaction

### Pattern 7: Client-Side Callable Wrappers

**What:** `services/pair.ts` wraps the callable functions with typed inputs/outputs.

```typescript
// Source: firebase/functions modular API — confirmed in firebase 12.18.0 SDK
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase/config'

const functions = getFunctions(app)

interface CreatePairResult { pairId: string; inviteCode: string }
interface JoinPairResult { pairId: string }

export const createPairFn = httpsCallable<void, CreatePairResult>(
  functions,
  'createPair'
)

export const joinPairFn = httpsCallable<{ inviteCode: string }, JoinPairResult>(
  functions,
  'joinPair'
)
```

### Anti-Patterns to Avoid

- **Setting creator's pairId in createPair:** If `createPair` sets `users/{creatorUid}.pairId`, the D-01 redirect fires immediately and User A lands on `/home` before their partner joins. D-03's "waiting state on /pair-setup" becomes impossible without a parallel "pair complete" listener. Keeping pairId null until both members are present is simpler.
- **Querying Firestore by inviteCode inside the transaction:** Firestore transactions can't include collection group queries. Always query outside the transaction, then validate the found document inside the transaction.
- **Reading documents inside the transaction after writing them:** All reads must precede all writes in a transaction (Admin SDK enforces this for consistency). Use `Promise.all([tx.get(ref1), tx.get(ref2)])` for parallel reads.
- **Validating invite code format only in the client:** The joinPair function must re-validate with Zod — the callable is callable from any HTTP client, not just the app.
- **Initializing App Check after calling a protected function:** `initializeAppCheck` must run before any `httpsCallable` invocation. Put it in `firebase/config.ts` alongside `initializeApp`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-document update | Custom retry loop with individual writes | `db.runTransaction()` (Admin SDK) | Firestore transactions provide serializable isolation and automatic retries on contention |
| Invite code brute-force protection | Rate-limiting middleware or counter per IP | Firebase App Check with `enforceAppCheck: true` | App Check validates the attestation at the platform level (reCAPTCHA v3); no server-side rate-limit code needed |
| Real-time pair state sync | Polling Firestore on an interval | `onSnapshot` on `users/{uid}` | onSnapshot is a persistent WebSocket; instant delivery, no polling overhead |
| Input validation in Cloud Functions | Manual `if (!data.inviteCode)` checks | Zod 4 `safeParse` | Handles all edge cases (wrong type, wrong length, wrong charset) in one schema declaration |
| Adding a second item to a Firestore array | Read array, push, write back | `FieldValue.arrayUnion(uid)` | arrayUnion is atomic — no read-modify-write race condition |

---

## Common Pitfalls

### Pitfall 1: Creator's pairId Set Too Early

**What goes wrong:** If `createPair` writes `users/{creatorUid}.pairId = pairRef.id`, the route guard triggers immediately after `createPair` returns and sends User A to `/home` — skipping the waiting state entirely. D-03 becomes impossible to implement without a second "is pair complete" signal.

**Why it happens:** Natural instinct is to link the creator to the pair document immediately, same as the joiner.

**How to avoid:** `createPair` writes only to `pairs/{pairId}` (with `members: [creatorUid]`). `joinPair` writes to both users' docs in one transaction.

**Warning signs:** User A sees `/home` immediately after clicking "Create a pair" with no chance to share the invite code.

---

### Pitfall 2: Transaction Reads After Writes (Admin SDK)

**What goes wrong:** Placing a `tx.get()` call after a `tx.update()` or `tx.set()` in the same transaction throws: `"Firestore read was called after a write"`.

**Why it happens:** The Admin SDK enforces read-before-write ordering in transactions, matching Firestore's serializable semantics.

**How to avoid:** Collect all refs to read, call them together with `Promise.all([tx.get(ref1), tx.get(ref2)])` at the start of the transaction body, then do all writes after validation.

**Warning signs:** Runtime error `"Firestore read was called after a write"` in Cloud Function logs.

---

### Pitfall 3: Querying inviteCode Inside a Transaction

**What goes wrong:** Firestore transactions do not support `collection().where().get()` — only `tx.get(docRef)` is allowed. Running a collection query inside a transaction throws `"runTransaction requires a document reference"`.

**Why it happens:** Firestore transactions are document-scoped; collection queries can span arbitrarily many documents and cannot be part of a transactional read set.

**How to avoid:** Run the `where('inviteCode', '==', code).limit(1)` query **outside** the transaction to get the document reference, then validate that document **inside** the transaction via `tx.get(pairRef)`.

**Warning signs:** `"runTransaction requires a document reference"` error in Cloud Function logs.

---

### Pitfall 4: App Check Blocks Emulator Callables

**What goes wrong:** In the local dev environment, calling a Cloud Function with `enforceAppCheck: true` returns a 403 error because there's no real reCAPTCHA attestation available.

**Why it happens:** App Check enforcement is active but the browser doesn't have a valid token for `localhost`.

**How to avoid:** Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` (or a registered debug token UUID) before calling `initializeAppCheck`. This activates the Firebase App Check debug provider, which accepts the auto-generated or registered token.

**Warning signs:** Cloud Function calls return `PERMISSION_DENIED (403)` in the emulator; the browser console shows `"AppCheck: AppCheck Fetch client could not get token"`.

---

### Pitfall 5: Firestore `get()` in Security Rules Counts as a Read

**What goes wrong:** The partner-read rule uses `get(/databases/.../pairs/$(pairId))` — this is a Firestore security rule document access. It is billed and has rate limits (applies to Firestore plan).

**Why it happens:** `get()` in rules performs an actual Firestore read for every document access that triggers the rule.

**How to avoid:** The rule is necessary and correct; there's no way to avoid it. However, be aware that high-frequency reads of `users/{uid}` by pair members will double the Firestore read count due to the `get()`. For Phase 2 scope (2 users), this is negligible. Document for Phase 6 (hardening).

**Warning signs:** Unexpected Firestore read counts in the Firebase Console metrics dashboard.

---

### Pitfall 6: Missing Firestore Index for inviteCode Query

**What goes wrong:** `collection('pairs').where('inviteCode', '==', code).limit(1).get()` may require a Firestore composite index if combined with other where clauses. Even a single-field query may need the index deployed.

**Why it happens:** Firestore automatically creates single-field indexes for top-level fields, but only when the collection is active and the index build completes.

**How to avoid:** The single-field query on `inviteCode` alone uses the auto-generated single-field index — no manual index definition needed. Do NOT add `.where('inviteCodeUsed', '==', false)` as a second filter (it would require a composite index). Instead, validate `inviteCodeUsed` inside the transaction after fetching the document.

**Warning signs:** `"The query requires an index"` error with a link to create the index in Firestore console.

---

## Code Examples

### Firestore `pairs/{pairId}` Document Shape

```typescript
// Add to shared-reveal/src/types/index.ts
// Source: derived from requirements PAIR-01 through PAIR-05

import type { Timestamp } from 'firebase/firestore'

export interface PairDoc {
  createdBy: string           // UID of creator (User A)
  members: string[]           // [creatorUid] until join; [creatorUid, joinerUid] after
  inviteCode: string          // 6-char uppercase hex, e.g. "A1B2C3"
  inviteCodeExpiry: Timestamp // PAIR-02: 24 hours from creation
  inviteCodeUsed: boolean     // PAIR-05: true after successful join
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Zod Schema for joinPair Input

```typescript
// Source: Zod 4 docs — https://zod.dev/v4 (confirmed syntax for regex)
import { z } from 'zod'

// Matches the output of crypto.randomBytes(3).toString('hex').toUpperCase()
// Pattern: exactly 6 characters, uppercase hex (A-F, 0-9)
export const JoinPairSchema = z.object({
  inviteCode: z
    .string()
    .length(6, 'Invite code must be exactly 6 characters')
    .regex(/^[A-F0-9]{6}$/, 'Invite code must be uppercase letters and numbers'),
})
```

### Invite Code Generation (Node.js built-in)

```typescript
// Source: Node.js crypto module documentation (built-in, no install needed)
// ASSUMED: randomBytes(3).toString('hex').toUpperCase() gives 6-char hex string
// Entropy: 16^6 = 16,777,216 unique codes — sufficient for 24-hour single-use codes
// in a private 2-person app protected by App Check
import { randomBytes } from 'node:crypto'

function generateInviteCode(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}
// Example outputs: "A1B2C3", "FF0012", "3E9A4B"
```

### PairSetupPage — Waiting State Pattern

```typescript
// Source: follows onSnapshot pattern from shared-reveal/src/pages/HomePage.tsx (verified)
// User A's view after createPair resolves — shows invite code, waits for onSnapshot

const [inviteCode, setInviteCode] = useState<string | null>(null)
const [creating, setCreating] = useState(false)
const [error, setError] = useState<string | null>(null)

async function handleCreate() {
  setCreating(true)
  setError(null)
  try {
    const result = await createPairFn()
    setInviteCode(result.data.inviteCode)
    // usePairId's onSnapshot will trigger when joinPair sets pairId;
    // App.tsx route guard redirects to /home automatically — no manual navigate needed
  } catch (err: any) {
    setError(err.message ?? 'Failed to create pair')
  } finally {
    setCreating(false)
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `firebase-functions/https.onCall` (v1) | `firebase-functions/v2/https.onCall` with `CallableOptions` | Functions SDK v4+ | v2 supports `enforceAppCheck`, `concurrency`, Cloud Run backing; v1 deprecated for new functions |
| Manual rate-limiting middleware | Firebase App Check with `enforceAppCheck: true` | App Check GA 2022 | Eliminates invite-code brute-force without server-side rate-limit logic |
| `firebase.appCheck().activate()` (compat) | `initializeAppCheck(app, { provider, ... })` (modular) | Firebase SDK v9+ | Modular SDK required per project constraints; tree-shakes unused SDK code |
| `FieldValue.arrayUnion` via import from `firebase-admin/firestore` | Same — no change | — | Admin SDK path confirmed: `import { FieldValue } from 'firebase-admin/firestore'` |

**Deprecated/outdated:**
- `firebase-functions/v1/https.onCall`: do not use for new Phase 2 functions. The existing `createUserDoc` uses v1 auth trigger (acceptable; v1 auth triggers are separate from v1 callable), but new callable functions must use v2.
- `firebase.functions()` (compat layer): use `getFunctions(app)` + `httpsCallable` from `firebase/functions` modular SDK.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crypto.randomBytes(3).toString('hex').toUpperCase()` produces a 6-character string | Invite code generation | If Node crypto behavior differs, codes could be wrong length — verify with a unit test |
| A2 | Single-field Firestore index on `pairs.inviteCode` is auto-created without manual index definition | Pitfall 6 | If the auto-index doesn't exist at query time, joinPair throws "requires an index" — mitigate by running a test join in the emulator before phase close |
| A3 | The `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` flag must be set before `initializeAppCheck` in the same script scope | App Check setup | If order doesn't matter, no impact. If it does (and Firebase checks this eagerly), App Check would fail in emulator. Test in dev with emulator before Phase 2 sign-off |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
_(Table is not empty — A1-A3 are assumptions that unit/emulator tests will verify.)_

---

## Open Questions

1. **reCAPTCHA v3 site key — when to obtain?**
   - What we know: App Check initialization requires a reCAPTCHA v3 site key. The key is obtained from the Google reCAPTCHA console (separate from Firebase console) and registered in Firebase Console under Security → App Check.
   - What's unclear: This requires a production domain. In the emulator, the debug provider replaces reCAPTCHA entirely, so the site key is not needed until staging/production deploy.
   - Recommendation: Add `VITE_RECAPTCHA_SITE_KEY=placeholder` to `.env.local` for local dev (debug provider takes over). Obtain real key before Phase 6 production deploy. Document in a `.env.example` file.

2. **Functions emulator with App Check enforcement — does `enforceAppCheck: true` block emulator calls?**
   - What we know: Firebase App Check debug provider bypasses enforcement when a registered debug token is provided. Firebase Functions emulator respects App Check enforcement settings.
   - What's unclear: Whether `enforceAppCheck: true` in the local emulator requires the debug token to be registered in the Firebase Console, or if `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` auto-accepts any debug session.
   - Recommendation: Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in the client config for all dev sessions; test a callable function invocation in the emulator as the first task in the phase. If calls are blocked (403), register the auto-generated token from the browser console in Firebase Console → App Check → Manage debug tokens.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Firebase CLI (`firebase`) | Emulator, deploy | Check with `firebase --version` | Confirmed in Phase 1 | — |
| Node 22 runtime | Cloud Functions | Available (Phase 1 confirmed) | 22 | — |
| Firebase Emulator Suite | Emulator testing | Confirmed in Phase 1 | — | — |
| reCAPTCHA v3 site key | App Check production | Not yet obtained | — | Debug token for local dev |

**Missing dependencies with no fallback:** reCAPTCHA v3 site key is required before App Check can be tested against a live environment. Not blocking for emulator work.

**Missing dependencies with fallback:** `VITE_APP_CHECK_DEBUG_TOKEN=true` covers all emulator and dev sessions. Real reCAPTCHA key deferred to production deploy.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 |
| Config file | None — Vitest uses Vite's `vite.config.ts` defaults (no test section found) |
| Quick run command | `cd shared-reveal && npm test` |
| Full suite command | `cd shared-reveal && npm test && npm run test:e2e` |

**Note:** Vitest has no configuration file in this project. It uses auto-discovery defaults: picks up `**/*.{test,spec}.{ts,tsx}` files outside `node_modules`. Unit test files go in `shared-reveal/tests/unit/`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAIR-01 | createPair returns a 6-char uppercase invite code | unit | `vitest run tests/unit/pair.test.ts` | No — Wave 0 |
| PAIR-02 | Expired invite codes are rejected | unit | `vitest run tests/unit/pair.test.ts` | No — Wave 0 |
| PAIR-03 | joinPair with valid code succeeds | E2E (emulator) | `playwright test tests/e2e/pair.spec.ts` | No — Wave 0 |
| PAIR-04 | Third user joining is rejected | unit (function logic) | `vitest run tests/unit/pair.test.ts` | No — Wave 0 |
| PAIR-05 | Invite code unusable after one join | E2E (emulator) | `playwright test tests/e2e/pair.spec.ts` | No — Wave 0 |
| PAIR-06 | Already-paired user cannot create or join | unit | `vitest run tests/unit/pair.test.ts` | No — Wave 0 |
| SEC-05 | All 5 validations run in one transaction | unit (mock tx) | `vitest run tests/unit/pair.test.ts` | No — Wave 0 |
| SEC-07 | Functions reject requests without App Check token | manual — emulator does not enforce by default | manual / emulator + enforceAppCheck flag | No |

### Sampling Rate

- **Per task commit:** `cd shared-reveal && npm test` (unit tests only, < 10s)
- **Per wave merge:** `cd shared-reveal && npm test && npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `shared-reveal/tests/unit/pair.test.ts` — covers PAIR-01 through PAIR-06, SEC-05 validation logic (invite code generation, expiry calculation, Zod schema, validation order)
- [ ] `shared-reveal/tests/e2e/pair.spec.ts` — covers PAIR-03, PAIR-04, PAIR-05 (two-user happy path via emulator; second join rejection)
- [ ] Second E2E test user fixture (`TEST_UID_02`) in `shared-reveal/tests/e2e/fixtures/auth.ts` — needed for two-user Playwright tests

*(Existing unit test infrastructure: Vitest is installed and `npm test` runs. Existing E2E: Playwright config targets `tests/e2e/`. Auth fixture already supports custom token sign-in — extend for second user.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `request.auth` check in every onCall handler |
| V3 Session Management | no — handled by Phase 1 Firebase Auth | — |
| V4 Access Control | yes | Firestore Security Rules + `enforceAppCheck` on callables |
| V5 Input Validation | yes | Zod 4 `safeParse` in joinPair; regex + length validation |
| V6 Cryptography | partial | `crypto.randomBytes` for invite code — not a cryptographic secret but uses a CSPRNG |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invite code brute-force (16M codes, 24h window) | Elevation of Privilege | App Check `enforceAppCheck: true` on joinPair (SEC-07) |
| Race condition: two users join same code simultaneously | Elevation of Privilege | Firestore transaction — `inviteCodeUsed` check inside tx; second joiner's tx aborts |
| Client writes pairId directly (bypassing invitation) | Tampering | Firestore rule: `!request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairId'])` |
| Creator joining their own pair | Elevation of Privilege | joinPair check: `if (pair.createdBy === uid) throw` |
| Already-paired user creating a second pair | Elevation of Privilege | createPair transaction: `if (userSnap.data().pairId !== null) throw` |
| Firebase Admin SDK credentials in client bundle | Information Disclosure | Admin SDK is server-only (functions/); client bundle only has JS SDK — verified in Phase 1, re-verify in Phase 6 (SEC-06) |

---

## Sources

### Primary (HIGH confidence)

- `shared-reveal/functions/node_modules/firebase-functions/lib/v2/providers/https.d.ts` — verified `onCall`, `HttpsError`, `CallableOptions`, `enforceAppCheck` type signatures [VERIFIED: local node_modules]
- `shared-reveal/node_modules/@firebase/app-check/dist/app-check-public.d.ts` — verified `initializeAppCheck`, `ReCaptchaV3Provider`, `ReCaptchaEnterpriseProvider` exports [VERIFIED: local node_modules]
- `shared-reveal/functions/node_modules/firebase-functions/package.json` exports field — confirmed `firebase-functions/v2/https` canonical import path [VERIFIED: local node_modules]
- `shared-reveal/src/pages/HomePage.tsx` — verified `onSnapshot` + `useEffect` hook pattern [VERIFIED: codebase]
- `shared-reveal/firestore.rules` — verified existing rule structure and `pairId` write protection [VERIFIED: codebase]
- `shared-reveal/src/types/index.ts` — verified `UserDoc.pairId: string | null` field [VERIFIED: codebase]
- [Firebase App Check enforcement for Cloud Functions](https://firebase.google.com/docs/app-check/cloud-functions) — `enforceAppCheck: true` option [CITED: firebase.google.com]
- [Firebase App Check reCAPTCHA v3 web setup](https://firebase.google.com/docs/app-check/web/recaptcha-provider) — `initializeAppCheck` + debug token setup [CITED: firebase.google.com]
- [Firebase callable functions documentation](https://firebase.google.com/docs/functions/callable) — v2 onCall request object, HttpsError codes [CITED: firebase.google.com]

### Secondary (MEDIUM confidence)

- npm registry: `firebase@12.18.0`, `firebase-functions@7.3.2`, `firebase-admin@14.3.0` confirmed as latest stable [VERIFIED: npm registry]

### Tertiary (LOW confidence)

- `crypto.randomBytes(3).toString('hex').toUpperCase()` produces 6-char string — high confidence but not explicitly documented; marked as [ASSUMED] in Assumptions Log (A1)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in local node_modules and npm registry
- Cloud Function patterns: HIGH — type signatures verified from installed package; official Firebase docs cited
- Architecture: HIGH — derived from locked CONTEXT.md decisions + codebase analysis
- Firestore rules: HIGH — based on existing rules file pattern + official Firestore rules docs
- App Check: HIGH — initializeAppCheck API verified in local node_modules; debug token mechanism cited from official docs
- Pitfalls: HIGH — transaction read-before-write and query-in-transaction limits are well-documented Firestore constraints

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (Firebase SDK and App Check APIs are stable)
