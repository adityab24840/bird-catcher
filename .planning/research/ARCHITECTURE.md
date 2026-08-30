# Architecture Patterns: Reveal

**Domain:** Firebase-backed PWA with database-layer submission privacy
**Researched:** 2026-08-30
**Overall confidence:** HIGH (all core claims verified against official Firebase docs and Context7)

---

## Recommended Architecture

### System Overview (ASCII)

```
 Browser (React PWA)
 ┌──────────────────────────────────────────────────────────┐
 │  AuthProvider                                             │
 │  ┌───────────────┐    ┌────────────────────────────────┐ │
 │  │  PairProvider  │    │  OfflineSyncIndicator          │ │
 │  └───────┬───────┘    └────────────────────────────────┘ │
 │          │                                                │
 │  ┌───────▼──────────────────────────────────┐            │
 │  │  App Shell (React Router)                 │            │
 │  │                                           │            │
 │  │  /          → TodayEntryPage             │            │
 │  │  /timeline  → TimelinePage               │            │
 │  │  /invite    → InvitePage                 │            │
 │  │  /join      → JoinPage                   │            │
 │  └───────────────────────────────────────────┘           │
 └────────────┬──────────────────────────────────┬──────────┘
              │ Firestore SDK                      │ Storage SDK
              │ (real-time onSnapshot)             │ (upload/download)
              ▼                                    ▼
 ┌────────────────────────┐      ┌────────────────────────────┐
 │  Cloud Firestore        │      │  Cloud Storage              │
 │  (Security Rules v2)    │      │  (Cross-service rules)      │
 └────────────┬────────────┘      └────────────────────────────┘
              │ Firestore triggers
              ▼
 ┌────────────────────────────────────────────────────────────┐
 │  Cloud Functions (v2, Node.js)                              │
 │                                                             │
 │  onCall:                                                    │
 │  - generateInvite(uid) → code                              │
 │  - joinPair(code, uid) → pairId  [transactional, cap=2]    │
 │  - revealEntry(pairId, entryId, reason) → void             │
 │                                                             │
 │  Firestore-triggered:                                       │
 │  - onSubmissionCreated → auto-reveal check + notify        │
 │                                                             │
 │  FCM: sendNotification(token, payload)                      │
 └────────────────────────────────────────────────────────────┘
```

---

## Firestore Data Model

This structure is the single most consequential architectural decision. It determines
what security rules are possible and how efficient queries will be.

### Collection / Document Hierarchy

```
/users/{uid}
  displayName: string
  email: string
  pairId: string | null
  fcmToken: string | null
  createdAt: Timestamp

/pairs/{pairId}
  members: [uid1, uid2]        // exactly 2 UIDs; enforced by Cloud Function
  createdAt: Timestamp
  createdBy: uid

/invites/{code}                // 6-char alphanumeric code
  creatorUid: string
  expiresAt: Timestamp
  used: boolean

/pairs/{pairId}/entries/{entryId}
  date: string                 // "YYYY-MM-DD" — the calendar date
  prompt: string               // static for MVP
  status: "pending" | "partial" | "revealed"
  submittedMembers: [uid, ...]  // grows as submissions arrive; max 2
  revealedBy: uid | null       // null for auto-reveal
  revealReason: "auto" | "manual" | null
  revealedAt: Timestamp | null
  createdAt: Timestamp

/pairs/{pairId}/entries/{entryId}/submissions/{uid}
  uid: string                  // redundant but useful in queries
  text: string | null
  imageRef: string | null      // Storage path: pairs/{pairId}/entries/{entryId}/{uid}/image.jpg
  submittedAt: Timestamp
```

### Why subcollections for submissions, not embedded fields

Firestore does not support partial document reads at the field level from the client SDK.
If both submissions were fields in the entry document (e.g., `entry.submissionA`,
`entry.submissionB`), there is no rule that hides specific fields from a client who can
read the document — the entire document is returned.

Placing each submission in a separate document (`submissions/{uid}`) gives each one its
own security rule scope. This is the only way to enforce per-user read access at the
database layer.

**Confidence: HIGH** — verified against Firebase field-level access control docs.

---

## Firestore Security Rules

### Design: "read-your-own-until-revealed-then-read-all"

The critical pattern uses `get()` to check the parent entry's `status` field when
evaluating whether to allow a partner to read a submission document. This is the verified
mechanism for cross-document conditional access in Firestore rules.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ──────────────────────────────────────────────────────────────

    function isSignedIn() {
      return request.auth != null;
    }

    function isInPair(pairId) {
      return request.auth.uid in
        get(/databases/$(database)/documents/pairs/$(pairId)).data.members;
    }

    function entryIsRevealed(pairId, entryId) {
      return get(/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryId))
        .data.status == "revealed";
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    match /users/{uid} {
      allow read:  if isSignedIn() && request.auth.uid == uid;
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update: if isSignedIn() && request.auth.uid == uid
        // Prevent client from forging pairId directly; Cloud Function writes pairId
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairId']);
    }

    // ── Invites ───────────────────────────────────────────────────────────────

    match /invites/{code} {
      // Client reads invite to show "invite found" UX before calling joinPair
      allow read:  if isSignedIn();
      // Client creates invite (or Cloud Function — either works here)
      allow create: if isSignedIn()
        && request.resource.data.creatorUid == request.auth.uid
        && request.resource.data.used == false;
      // Only admin (Cloud Function) can mark used
      allow update: if false; // Cloud Function uses Admin SDK (bypasses rules)
      allow delete: if false;
    }

    // ── Pairs ─────────────────────────────────────────────────────────────────

    match /pairs/{pairId} {
      // Both members can read their own pair
      allow read: if isSignedIn() && isInPair(pairId);
      // Only Cloud Function (Admin SDK) creates/updates pairs
      allow write: if false;
    }

    // ── Entries ───────────────────────────────────────────────────────────────

    match /pairs/{pairId}/entries/{entryId} {
      // Both pair members can read entry metadata (status, submittedMembers)
      // Entry metadata is not sensitive — it tells you "partner submitted" but not what
      allow read: if isSignedIn() && isInPair(pairId);

      // Client creates entries (e.g., auto-created when first submission arrives)
      // but CANNOT set status — Cloud Function manages status transitions
      allow create: if isSignedIn()
        && isInPair(pairId)
        && request.resource.data.status == "pending"
        && request.resource.data.revealedBy == null
        && request.resource.data.submittedMembers == [];

      // Clients cannot update entries at all — Cloud Function owns all state transitions
      allow update: if false;
      allow delete: if false;
    }

    // ── Submissions ───────────────────────────────────────────────────────────
    // THIS IS THE CORE PRIVACY RULE

    match /pairs/{pairId}/entries/{entryId}/submissions/{submitterUid} {
      allow read: if isSignedIn()
        && isInPair(pairId)
        && (
          // You can always read your own submission
          request.auth.uid == submitterUid
          ||
          // You can read your partner's submission ONLY after reveal
          // Uses get() on parent entry — 1 of 10 allowed doc reads per evaluation
          // isInPair() above already consumed 1 read (pairs doc), total = 2 reads
          entryIsRevealed(pairId, entryId)
        );

      // Only the matching user can create their own submission
      allow create: if isSignedIn()
        && request.auth.uid == submitterUid
        && isInPair(pairId)
        && request.resource.data.uid == request.auth.uid
        // Must provide at least text or imageRef
        && (request.resource.data.text != null || request.resource.data.imageRef != null);

      // No updates or deletes — submissions are immutable once created
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

### Document Read Budget per Rule Evaluation

Each Firestore rule evaluation permits up to 10 external document reads (for single-doc
and query requests). The submission `read` rule makes exactly 2:

| get() call | Document | Purpose |
|------------|----------|---------|
| 1 | `/pairs/{pairId}` | `isInPair()` — membership check |
| 2 | `/pairs/{pairId}/entries/{entryId}` | `entryIsRevealed()` — status check |

Budget: 2 of 10 used. Safe margin. Billing note: get() calls in rules are billed as
document reads even if the rule denies access.

**Confidence: HIGH** — limits verified in official Firebase conditions docs (10 for
single-doc/query, 20 for batched writes/transactions).

### Critical: Rules Cannot Prevent Partner from Knowing a Submission Exists

The entry's `submittedMembers` array is readable by both pair members (entry metadata is
not hidden). This is intentional — the UX must show "partner has submitted" without
revealing the content. The privacy guarantee is: submission **content** (text, image) is
hidden until revealed. The fact of submission is not hidden.

---

## Cloud Functions (v2) Patterns

### Why Functions for State Transitions, Not Rules

Firestore Security Rules are declarative (allow/deny) — they cannot initiate writes,
run logic, or sequence operations. They validate. Cloud Functions execute. The reveal
transition requires:

1. Reading entry state (check both submitted / verify submitter identity)
2. Writing new status atomically
3. Preventing race conditions via Firestore transactions
4. Sending FCM notifications

This cannot be done in rules. Functions also run with the Admin SDK, which bypasses
rules entirely — this is what you want for trusted server-side operations. The rules then
prevent clients from doing these operations directly (`allow update: if false` on entries).

### Function 1: `generateInvite` (onCall)

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const generateInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");

  const uid = request.auth.uid;
  const db = getFirestore();

  // Check user is not already in a pair
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.pairId) {
    throw new HttpsError("failed-precondition", "Already in a pair");
  }

  const code = generateCode();          // 6-char alphanumeric
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.doc(`invites/${code}`).set({
    creatorUid: uid,
    expiresAt,
    used: false,
  });

  return { code };
});
```

### Function 2: `joinPair` (onCall) — Transactional, Pair Cap = 2

```typescript
export const joinPair = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");

  const { code } = request.data as { code: string };
  const uid = request.auth.uid;
  const db = getFirestore();

  const pairId = db.collection("pairs").doc().id;  // pre-generate ID

  await db.runTransaction(async (tx) => {
    const inviteRef = db.doc(`invites/${code}`);
    const invite = await tx.get(inviteRef);

    if (!invite.exists) throw new HttpsError("not-found", "Invite not found");
    const data = invite.data()!;

    if (data.used) throw new HttpsError("already-exists", "Invite already used");
    if (data.expiresAt.toDate() < new Date()) {
      throw new HttpsError("deadline-exceeded", "Invite expired");
    }
    if (data.creatorUid === uid) {
      throw new HttpsError("invalid-argument", "Cannot join your own invite");
    }

    const creatorRef = db.doc(`users/${data.creatorUid}`);
    const creator = await tx.get(creatorRef);
    if (creator.data()?.pairId) {
      throw new HttpsError("failed-precondition", "Inviter already in a pair");
    }

    const joinerRef = db.doc(`users/${uid}`);
    const joiner = await tx.get(joinerRef);
    if (joiner.data()?.pairId) {
      throw new HttpsError("failed-precondition", "You are already in a pair");
    }

    // All checks pass — execute atomically
    tx.set(db.doc(`pairs/${pairId}`), {
      members: [data.creatorUid, uid],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: data.creatorUid,
    });
    tx.update(creatorRef, { pairId });
    tx.update(joinerRef, { pairId });
    tx.update(inviteRef, { used: true });
  });

  return { pairId };
});
```

The pair size cap of exactly 2 is enforced by the transaction: both users' existing
pairId is checked before creating the pair. There is no "members.length" check against
the pair document because the pair document is created atomically in the same transaction
that sets both users' pairId fields.

### Function 3: `onSubmissionCreated` — Auto-Reveal + Notify (Firestore trigger)

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";

export const onSubmissionCreated = onDocumentCreated(
  "pairs/{pairId}/entries/{entryId}/submissions/{uid}",
  async (event) => {
    const { pairId, entryId, uid } = event.params;
    const db = getFirestore();

    const entryRef = db.doc(`pairs/${pairId}/entries/${entryId}`);
    const pairRef = db.doc(`pairs/${pairId}`);

    let shouldNotifyPartner = false;
    let autoRevealed = false;

    await db.runTransaction(async (tx) => {
      const [entry, pair] = await Promise.all([
        tx.get(entryRef),
        tx.get(pairRef),
      ]);

      const entryData = entry.data()!;
      const pairData = pair.data()!;
      const members: string[] = pairData.members;

      const updatedSubmittedMembers = [
        ...new Set([...(entryData.submittedMembers || []), uid]),
      ];

      tx.update(entryRef, { submittedMembers: updatedSubmittedMembers });

      if (updatedSubmittedMembers.length === members.length) {
        // Both have submitted — auto-reveal
        tx.update(entryRef, {
          status: "revealed",
          revealedBy: null,
          revealReason: "auto",
          revealedAt: FieldValue.serverTimestamp(),
        });
        autoRevealed = true;
      } else {
        // Partial — notify partner that their partner submitted
        shouldNotifyPartner = true;
      }
    });

    // Send FCM outside transaction (non-atomic by design — notification failure
    // should not roll back the reveal)
    if (autoRevealed) {
      await notifyBothMembers(pairId, "Both submitted — your entry is revealed!");
    } else if (shouldNotifyPartner) {
      await notifyPartner(pairId, uid, "Your partner submitted. Your turn!");
    }
  }
);
```

### Function 4: `revealEntry` (onCall) — Manual Reveal ("Reveal Anyway")

```typescript
export const revealEntry = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");

  const { pairId, entryId } = request.data as { pairId: string; entryId: string };
  const uid = request.auth.uid;
  const db = getFirestore();

  await db.runTransaction(async (tx) => {
    const [entry, pair] = await Promise.all([
      tx.get(db.doc(`pairs/${pairId}/entries/${entryId}`)),
      tx.get(db.doc(`pairs/${pairId}`)),
    ]);

    if (!pair.data()?.members.includes(uid)) {
      throw new HttpsError("permission-denied", "Not in this pair");
    }

    const entryData = entry.data()!;
    if (entryData.status === "revealed") return;  // idempotent

    if (!entryData.submittedMembers?.includes(uid)) {
      throw new HttpsError("failed-precondition", "You have not submitted yet");
    }

    tx.update(db.doc(`pairs/${pairId}/entries/${entryId}`), {
      status: "revealed",
      revealedBy: uid,
      revealReason: "manual",
      revealedAt: FieldValue.serverTimestamp(),
    });
  });

  // Notify partner outside transaction
  await notifyPartner(pairId, uid, "Your partner revealed the entry early!");
});
```

---

## Firebase Storage Security Rules

Storage rules use cross-service `firestore.get()` to mirror the Firestore privacy model.
This feature became stable in September 2022.

The Storage path from PROJECT.md: `pairs/{pairId}/entries/{entryId}/{uid}/image.jpg`

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /pairs/{pairId}/entries/{entryId}/{submitterUid}/image.jpg {

      function isPairMember() {
        return request.auth.uid in
          firestore.get(/databases/(default)/documents/pairs/$(pairId)).data.members;
      }

      function entryIsRevealed() {
        return firestore.get(
          /databases/(default)/documents/pairs/$(pairId)/entries/$(entryId)
        ).data.status == "revealed";
      }

      allow read: if request.auth != null
        && isPairMember()                    // read 1: pairs doc
        && (
          request.auth.uid == submitterUid   // own image — always
          || entryIsRevealed()               // read 2: entry doc — partner image after reveal
        );

      allow write: if request.auth != null
        && request.auth.uid == submitterUid  // can only write to own path
        && isPairMember();                   // must be in the pair
    }
  }
}
```

**Document read budget:** 2 of 2 allowed (Storage rules cap is 2 external Firestore
reads per evaluation). This exactly fits the requirement — no headroom for additional
checks. Do not add a third get() call to Storage rules.

**Confirmed limitation:** `getAfter()` and `existsAfter()` are NOT available in Storage
rules (only `get()` and `exists()`). The cross-project read restriction also applies:
only the same Firebase project's Firestore can be queried.

---

## React Real-Time Listener Patterns

### The Core Problem: Listeners for Denied Documents

A Firestore `onSnapshot` on a document path that rules currently deny returns a
`permission-denied` error — it does not silently return nothing. You cannot pre-subscribe
to a partner's submission and "wait" for it to become readable.

When `entry.status` changes to `"revealed"`, rules will now allow the partner's
submission to be read — but an existing denied listener does not automatically recover.

**Solution: Conditional listener management based on entry status.**

```typescript
// useEntryListeners.ts
export function useEntryListeners(pairId: string, entryId: string, uid: string) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [ownSubmission, setOwnSubmission] = useState<Submission | null>(null);
  const [partnerSubmission, setPartnerSubmission] = useState<Submission | null>(null);

  // Layer 1: Always listen to entry metadata (status, submittedMembers)
  useEffect(() => {
    return onSnapshot(
      doc(db, "pairs", pairId, "entries", entryId),
      (snap) => setEntry(snap.exists() ? (snap.data() as Entry) : null),
      (err) => console.error("entry listener error", err)
    );
  }, [pairId, entryId]);

  // Layer 2: Always listen to own submission
  useEffect(() => {
    return onSnapshot(
      doc(db, "pairs", pairId, "entries", entryId, "submissions", uid),
      (snap) => setOwnSubmission(snap.exists() ? (snap.data() as Submission) : null)
    );
  }, [pairId, entryId, uid]);

  // Layer 3: Conditionally listen to partner submission — ONLY when revealed
  useEffect(() => {
    if (!entry || entry.status !== "revealed") return;

    const partnerId = entry.submittedMembers?.find((m) => m !== uid);
    if (!partnerId) return;

    return onSnapshot(
      doc(db, "pairs", pairId, "entries", entryId, "submissions", partnerId),
      (snap) => setPartnerSubmission(snap.exists() ? (snap.data() as Submission) : null)
    );
  }, [entry?.status, pairId, entryId, uid]);

  return { entry, ownSubmission, partnerSubmission };
}
```

The `partnerId` is resolved from `entry.submittedMembers` (which the client can read
because entry metadata is always readable to pair members). When `entry.status` flips
to `"revealed"` via a real-time update, the Layer 3 effect re-runs, starts the partner
submission listener, and now rules allow it to succeed.

### Timeline Query

The timeline listens to all revealed entries for a pair, ordered by date descending:

```typescript
query(
  collection(db, "pairs", pairId, "entries"),
  where("status", "==", "revealed"),
  orderBy("date", "desc")
)
```

The security rule for entry reads (pair membership check) will fire per document in
the query result set. At a rate of 1 billing read per entry per rule evaluation, a
365-entry timeline costs ~365 extra reads per initial query load. This is acceptable at
this scale. Subsequent real-time updates only re-evaluate changed documents.

---

## Firebase Emulator Suite

### firebase.json configuration

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": {
    "source": "functions"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

### Rule Tests with @firebase/rules-unit-testing

```typescript
// firestore.rules.test.ts
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "reveal-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterEach(async () => { await env.clearFirestore(); });

it("denies partner reading submission before reveal", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    // Seed: pair with 2 members, entry in "partial" status, one submission
    await ctx.firestore().doc("pairs/pair1").set({ members: ["alice", "bob"] });
    await ctx.firestore().doc("pairs/pair1/entries/entry1").set({
      status: "partial",
      submittedMembers: ["alice"],
    });
    await ctx.firestore().doc("pairs/pair1/entries/entry1/submissions/alice").set({
      uid: "alice", text: "Today I thought of you", imageRef: null
    });
  });

  const bob = env.authenticatedContext("bob");
  await assertFails(
    getDoc(bob.firestore().doc("pairs/pair1/entries/entry1/submissions/alice"))
  );
});

it("allows partner reading submission after reveal", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("pairs/pair1").set({ members: ["alice", "bob"] });
    await ctx.firestore().doc("pairs/pair1/entries/entry1").set({
      status: "revealed",
      submittedMembers: ["alice", "bob"],
    });
    await ctx.firestore().doc("pairs/pair1/entries/entry1/submissions/alice").set({
      uid: "alice", text: "Today I thought of you", imageRef: null
    });
  });

  const bob = env.authenticatedContext("bob");
  await assertSucceeds(
    getDoc(bob.firestore().doc("pairs/pair1/entries/entry1/submissions/alice"))
  );
});
```

**Run emulators for rule tests:**

```bash
firebase emulators:exec --only firestore,storage "npx vitest run tests/rules"
```

Cross-service Storage rules (using `firestore.get()`) do NOT work correctly with the
Firebase Emulator as of mid-2026. GitHub issue firebase/firebase-js-sdk#6803 tracks this.
**Implication:** Write Storage rule tests against the emulator using only single-service
checks, and validate cross-service behavior manually against a real Firebase project in
staging. This is a known limitation, not a product risk.

---

## Offline-First Considerations

### Enabling Persistence (Web SDK v9+)

```typescript
// firebase.ts
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({}),
});
```

This enables IndexedDB-backed offline persistence. Write operations queue locally and
sync when connectivity is restored. Browser support: Chrome, Safari, Firefox (confirmed
in official docs).

### Offline Submission Flow

When a user submits while offline:

1. The submission write goes into Firestore's local write queue (IndexedDB)
2. The UI can reflect the optimistic write immediately via the local snapshot
3. When connectivity restores, the submission document is written to Firestore
4. The `onSubmissionCreated` Cloud Function fires on the server-side write
5. If both members have now submitted, the Function executes the auto-reveal transaction

**Risk to understand:** There is a window between offline submission and server sync
where the partner's reveal Function has not fired. If the partner also submits while
offline and both sync at the same time, two `onSubmissionCreated` triggers fire. The
transaction in the Function handles this correctly because it reads the current
`submittedMembers` array atomically before writing.

**Risk to document for users:** The PWA should show a clear offline indicator when writes
are pending. The service worker handles shell caching; Firestore handles data. They are
independent layers.

### Pending Write UI Pattern

```typescript
import { onSnapshotsInSync } from "firebase/firestore";

// Detect when all local writes have synced
const [pendingWrites, setPendingWrites] = useState(false);

onSnapshotsInSync(db, () => {
  // All listeners are now in sync with server
  setPendingWrites(false);
});
```

Alternatively, check `snapshot.metadata.hasPendingWrites` in the submission listener
and show a "Saving..." indicator until it becomes false.

---

## Component Boundaries

```
src/
├── lib/
│   ├── firebase.ts          // Firebase app init + SDK exports
│   ├── firestore.ts         // typed collection refs, converters
│   └── storage.ts           // upload helpers, client-side compression
│
├── providers/
│   ├── AuthProvider.tsx     // onAuthStateChanged, user doc sync
│   └── PairProvider.tsx     // pair doc listener, pair context
│
├── hooks/
│   ├── useEntry.ts          // entry + conditional submission listeners
│   ├── useTimeline.ts       // query revealed entries, real-time
│   └── useFCM.ts            // FCM token registration + foreground messages
│
├── pages/
│   ├── TodayEntryPage.tsx   // submits if not yet; shows status; shows reveal
│   ├── TimelinePage.tsx     // list of revealed entries
│   ├── InvitePage.tsx       // generate invite, show QR / code
│   └── JoinPage.tsx         // enter invite code, call joinPair function
│
├── components/
│   ├── SubmissionForm.tsx   // photo picker + text, client-side compress, submit
│   ├── RevealView.tsx       // both submissions side by side after reveal
│   ├── TimelineEntry.tsx    // single revealed entry card
│   └── OfflineIndicator.tsx // hasPendingWrites banner
│
└── functions/               // Cloud Functions package (separate)
    ├── src/
    │   ├── generateInvite.ts
    │   ├── joinPair.ts
    │   ├── revealEntry.ts
    │   ├── onSubmissionCreated.ts
    │   └── notifications.ts
    └── package.json
```

---

## Build Order Implications for Phases

The data model and security rules have strict dependency ordering. Rules cannot be
tested without the data model, and the reveal logic cannot be tested without rules.

### Phase 1: Project Skeleton + Auth

Deliverables:
- Firebase project, `firebase.json`, emulator config
- `initializeFirestore` with `persistentLocalCache`
- Google Sign-In with `onAuthStateChanged` + user doc auto-create on first sign-in
- Firestore rules for `/users/{uid}` (own-read, own-create)
- PWA manifest + service worker (vite-plugin-pwa)

Architectural dependency: Auth must exist before pairs (pair membership is indexed by
UID). User document pattern must be established before invite flow.

### Phase 2: Pair Management (joinPair + invite)

Deliverables:
- `generateInvite` and `joinPair` Cloud Functions
- `/invites/{code}` and `/pairs/{pairId}` Firestore rules
- Invite + Join pages
- Emulator tests for invite flow (joinPair transaction, cap=2 enforcement)

Architectural dependency: Pair must exist before entries can be scoped to a pair.
The `pairId` in the user document is the foreign key for all subsequent data.

### Phase 3: Submission (the privacy layer)

Deliverables:
- Entry auto-creation on first submission of the day
- `SubmissionForm` with client-side image compression + Storage upload
- Firestore rules for `/pairs/{pairId}/entries/{entryId}` (metadata readable, status
  not writable by client)
- Firestore rules for `/submissions/{uid}` (own-write, own-read)
- Storage rules (pair membership check — NOT cross-service yet)
- Offline persistence active; pending write indicator
- Emulator tests: own submission write succeeds; partner read fails

This phase establishes the privacy property but without the reveal path yet. The partner
will see "partner has submitted" via `submittedMembers` but cannot read the submission.

### Phase 4: Reveal

Deliverables:
- `onSubmissionCreated` Cloud Function (auto-reveal transaction + FCM stub)
- `revealEntry` callable Cloud Function
- Full Firestore rules for `submissions/{uid}` (partner read when revealed)
- Storage cross-service rules for image access after reveal
- `useEntry` hook with conditional partner submission listener
- `RevealView` component
- Emulator tests: auto-reveal fires correctly; partner read succeeds after reveal;
  manual reveal via callable

**This phase is where the core product promise is validated.** All previous phases
are scaffolding for this one.

### Phase 5: Timeline + FCM

Deliverables:
- `useTimeline` hook (query `status == "revealed"`, order by date desc)
- `TimelinePage` and `TimelineEntry` components
- FCM token registration in `useFCM`
- FCM sends in Cloud Functions (partner submitted, auto-revealed, manual-revealed)
- Emulator tests for timeline query (access control for non-members)

### Phase 6: PWA Hardening + Emulator Rule Coverage

Deliverables:
- Complete Firestore rule test suite (all allow/deny cases)
- Storage rule test suite (own-write, partner-read pre/post reveal)
- Service worker caching strategy (cache-first for app shell)
- Offline indicator component wired to `hasPendingWrites`
- Cross-browser PWA install testing (Android Chrome, iOS Safari, desktop)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding Both Submissions in the Entry Document

**What:** Storing `entry.submissionAlice` and `entry.submissionBob` as fields.
**Why bad:** Firestore does not support partial field-level reads from the client SDK.
If the entry document is readable, all fields are readable. Rules cannot hide specific
fields from a reader who can access the document. This breaks the privacy guarantee.
**Instead:** Subcollection `submissions/{uid}` — each document has its own rule scope.

### Anti-Pattern 2: Trusting the Client to Enforce "Don't Read Partner Submission"

**What:** Adding frontend guards that prevent the UI from fetching partner data.
**Why bad:** A modified client, browser dev tools, or direct Firestore SDK call bypasses
all frontend logic. The privacy guarantee must live in Security Rules.
**Instead:** `allow update: if false` on submissions; partner read blocked by entry
status check via `get()`.

### Anti-Pattern 3: Using a Real-time Listener on Partner's Submission Before Reveal

**What:** Starting `onSnapshot` on partner's submission document immediately on page
load, expecting it to "start working" when the entry is revealed.
**Why bad:** A denied `onSnapshot` returns a `permission-denied` error and does not
auto-recover. It will not resume when rules change.
**Instead:** Conditional listener in `useEffect` that only subscribes when
`entry.status === "revealed"`.

### Anti-Pattern 4: Letting the Client Write `entry.status`

**What:** Client calls `updateDoc(entryRef, { status: "revealed" })`.
**Why bad:** No race condition protection. Two simultaneous calls could double-reveal
and trigger two notification sends. Business logic (check both submitted) cannot be
enforced.
**Instead:** `allow update: if false` on entries; all transitions go through callable
Cloud Functions with Firestore transactions.

### Anti-Pattern 5: Three or More `get()` Calls in a Single Storage Rule

**What:** Adding a third `firestore.get()` to Storage rules (e.g., to check user doc).
**Why bad:** Storage rules cap at 2 external Firestore document reads per evaluation.
A third read causes the rule to deny access with no visible error.
**Instead:** Embed all needed info in the pair or entry document. The current design
uses exactly 2 reads (pair membership + entry status) and has no headroom.

---

## Scalability Considerations

| Concern | At 2 users (MVP) | At 100 pairs | At 10K pairs |
|---------|-----------------|--------------|--------------|
| Security rule reads billing | Negligible | Minor | Monitor via Cloud Console |
| Timeline query cost | 1 read/entry + 1 rule eval/entry | Same, per pair | Same, per pair |
| Cloud Function invocations | ~2/day | ~200/day | ~20K/day — still within free tier |
| FCM deliverability | High (small scale) | High | High (FCM scales independently) |
| Offline write conflicts | Not possible (own submission, immutable) | Not possible | Not possible |

For an app capped at 2 users per pair, Firestore scale is a non-concern at MVP. The
architecture does not need sharding, caching layers, or CDN optimization for content.

---

## Sources

- [Firestore Security Rules: Writing Conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Structuring Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-structure)
- [Firestore Role-Based Access with get()](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [Announcing Cross-Service Security Rules](https://firebase.blog/posts/2022/09/announcing-cross-service-security-rules/)
- [Firebase Storage: Use Conditions in Security Rules](https://firebase.google.com/docs/storage/security/rules-conditions)
- [Cloud Functions v2: Extend Firestore with Functions](https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen)
- [Firestore Transactions and Batched Writes](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Access Firestore Data Offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore Real-Time Updates: Get() with Listeners](https://firebase.google.com/docs/firestore/query-data/listen)
- [Test Firestore Security Rules with Emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Build Security Rule Unit Tests](https://firebase.google.com/docs/rules/unit-tests)
- [Patterns for Security: Rules + Cloud Functions](https://medium.com/firebase-developers/patterns-for-security-with-firebase-combine-rules-with-cloud-functions-for-more-flexibility-d03cdc975f50)
- [Cross-service rules emulator bug: firebase-js-sdk#6803](https://github.com/firebase/firebase-js-sdk/issues/6803)
- [Makerkit: Firestore in Storage Rules (cross-service examples)](https://makerkit.dev/blog/tutorials/firestore-storage-rules)
