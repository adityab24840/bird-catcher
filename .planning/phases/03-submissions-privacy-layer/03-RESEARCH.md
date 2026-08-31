# Phase 3: Submissions + Privacy Layer — Research

**Researched:** 2026-08-31
**Domain:** Firebase Storage rules, @firebase/rules-unit-testing v5, heic2any, browser-image-compression, submitEntry Cloud Function, Firestore subcollection rules
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Data Model (D-01)
- Entry path: `pairs/{pairId}/entries/{entryDate}` (YYYY-MM-DD, local TZ from client)
- Entry fields: `pairId`, `date`, `status: "pending"|"one_submitted"`, `submittedMembers: string[]`, `createdAt`, `updatedAt`
- Submission path: `pairs/{pairId}/entries/{entryDate}/submissions/{uid}` (subcollection — enables deny-by-default reads)
- Submission fields: `uid`, `photoURL: string|null` (download URL), `text: string|null`, `submittedAt`
- Storage path: `pairs/{pairId}/entries/{entryDate}/{uid}/photo.jpg`

### Locked Implementation Decisions
- `entryDate` computed client-side as `new Date().toLocaleDateString('en-CA')` → YYYY-MM-DD (D-02)
- Photo upload order: HEIC detect → heic2any → browser-image-compression → uploadBytes → getDownloadURL → pass photoURL to CF (D-03)
- `submitEntry` is a Cloud Functions v2 `onCall` — same `callableOptions` guard as joinPair (D-04)
- Storage photoURL stored in submission doc, not the storage path (D-01, D-03)
- Phase 3 does NOT implement auto-reveal (status → "revealed") — that is Phase 4 (D-04 step 7)
- Emulator test file: `tests/rules/submissions.test.ts`; unit test file: `tests/unit/submissions.test.ts` (D-09 / Claude's Discretion)

### Verified from Codebase
- `@firebase/rules-unit-testing` version installed: **5.0.2** (package.json — not v2/v3, but v5 which carries the v3 API surface)
- Storage emulator already configured in `firebase.json` at port 9199 — no changes needed there
- `heic2any` and `browser-image-compression` are NOT in `package.json` — must be installed
- `FieldValue.arrayUnion()` used in existing `joinPair` transaction (confirmed safe pattern)
- Read-before-write transaction constraint already handled in `joinPair` — same constraint applies to `submitEntry`
- Existing Firestore rules use `get(/databases/$(database)/documents/pairs/$(resource.data.pairId))` path format — established pattern to follow
</user_constraints>

---

## 1. Firebase Storage Rules with `firestore.get()`

### Syntax

In Storage Security Rules (rules_version = '2'), cross-referencing Firestore uses `firestore.get()` and `firestore.exists()`. The path format differs from Firestore rules: the database name is the **literal string `(default)`** (including parentheses), not a `$(database)` variable:

```javascript
// Storage rules — firestore.get() path format
firestore.get(/databases/(default)/documents/pairs/$(pairId))
```

Full Storage rule for Phase 3 (SEC-03):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Deny all by default
    match /{allPaths=**} {
      allow read, write: if false;
    }

    match /pairs/{pairId}/entries/{entryDate}/{uid}/{filename} {
      // Write: owner only, and only if they are a pair member
      allow write: if request.auth != null
        && request.auth.uid == uid
        && firestore.exists(/databases/(default)/documents/pairs/$(pairId))
        && request.auth.uid in
           firestore.get(/databases/(default)/documents/pairs/$(pairId)).data.members;

      // Read: owner always; partner only after reveal
      allow read: if request.auth != null && (
        request.auth.uid == uid
        || (
          request.auth.uid in
            firestore.get(/databases/(default)/documents/pairs/$(pairId)).data.members
          && firestore.exists(/databases/(default)/documents/pairs/$(pairId)/entries/$(entryDate))
          && firestore.get(/databases/(default)/documents/pairs/$(pairId)/entries/$(entryDate)).data.status == 'revealed'
        )
      );
    }
  }
}
```

### `firestore.get()` return value when document is missing

`firestore.get()` on a non-existent document returns a resource-like object where `.data` is `null`. Accessing `.data.status` on a null data object causes the rule to evaluate to `false` (does not throw — Rules evaluates to deny on errors). Guard pattern:
- Use `firestore.exists()` before `firestore.get()` when the document may not exist (e.g., entry doc before first submission).
- Alternatively, chain: `firestore.exists(path) && firestore.get(path).data.status == 'revealed'` — short-circuit prevents the null-deref.

### Emulator support for `firestore.get()` from Storage rules

**The Firebase Storage emulator supports `firestore.get()` in Storage rules**, but only when both the Storage emulator AND the Firestore emulator are running simultaneously. Firebase Emulator Suite wires them together internally. Requirements:
- Both emulators must start from the same `firebase emulators:start` command (already satisfied by the project's `firebase.json` which lists both).
- `@firebase/rules-unit-testing` v5's `initializeTestEnvironment` must declare both `firestore` and `storage` configs in the same environment — otherwise the Storage rules tester cannot call into Firestore.
- Confirmed behavior since Firebase Emulator Suite ≥ 9.11.0: `firestore.get()` resolves against the co-running Firestore emulator.

### Billing / quotas in production

Each `firestore.get()` in a Storage rule is a billable Firestore read. For a 2-person app this is negligible. Each photo read/write triggers up to 2 `get()` calls (pair membership + entry status). Acceptable at this scale.

---

## 2. `@firebase/rules-unit-testing` v5 for Subcollections

The package at version **5.0.2** (installed) uses the same API surface introduced in v3. This is the definitive pattern — NOT the older v2 API (`firebase-admin` mock-based approach).

### Import paths (v3+ / v5 API)

```ts
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'
```

### `initializeTestEnvironment` setup for Phase 3 (Firestore + Storage)

```ts
let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

afterAll(() => testEnv.cleanup())
afterEach(() => testEnv.clearFirestore())
```

Both `firestore` and `storage` blocks are required so that Storage rule `firestore.get()` calls resolve against the same emulator.

### Subcollection test patterns

Subcollection paths work exactly like top-level paths — just provide the full path string:

```ts
// Setup: seed data bypassing rules
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  // Pair
  await setDoc(doc(db, 'pairs/pair1'), { members: ['uid-alice', 'uid-bob'], ... })
  // Entry doc
  await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31'), {
    pairId: 'pair1', date: '2026-08-31',
    status: 'one_submitted', submittedMembers: ['uid-alice'],
    createdAt: new Date(), updatedAt: new Date()
  })
  // Alice's submission
  await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice'), {
    uid: 'uid-alice', photoURL: null, text: 'Hello', submittedAt: new Date()
  })
})
```

### Simulating partner reads (uid B tries to read uid A's submission)

```ts
const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
const aliceSubRef = doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')

// Should DENY before reveal
await assertFails(getDoc(aliceSubRef))

// Should ALLOW after reveal
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'pairs/pair1/entries/2026-08-31'), { status: 'revealed' }, { merge: true })
})
await assertSucceeds(getDoc(aliceSubRef))
```

### "Allow after reveal" pattern — setting entry status

Use `testEnv.withSecurityRulesDisabled()` to mutate the entry doc's status to `"revealed"` between test steps. This is the idiomatic approach for testing state-transition-dependent rules.

### Unauthenticated / non-member deny

```ts
const anonDb = testEnv.unauthenticatedContext().firestore()
const eveDb = testEnv.authenticatedContext('uid-eve').firestore() // not in pair

await assertFails(getDoc(doc(anonDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
await assertFails(getDoc(doc(eveDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
```

### Key difference from v2 API

v2 used `initializeAdminApp` / `initializeTestApp` from a different package. v3+ (including v5) uses only `initializeTestEnvironment`. Do not mix the two.

---

## 3. `heic2any` Browser Usage

### Package

```
npm install heic2any
```

No separate `@types/heic2any` needed — the package ships its own TypeScript declarations.

### Basic usage — HEIC/HEIF → JPEG Blob

```ts
// Lazy import (required — see bundle size below)
const heic2any = (await import('heic2any')).default

const result = await heic2any({
  blob: file,          // File | Blob
  toType: 'image/jpeg',
  quality: 0.9,
})

// heic2any returns Blob | Blob[] (burst/multi-image HEIC returns an array)
const jpegBlob: Blob = Array.isArray(result) ? result[0] : result
```

HEIC detection before calling:

```ts
const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
  || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
```

Note: Some iOS devices report MIME type `''` (empty) for HEIC. Filename extension check is the reliable fallback.

### Canvas polyfill

`heic2any` uses `OffscreenCanvas` if available, else falls back to an `HTMLCanvasElement`. Modern targets (Chrome 69+, Safari 16.4+, iOS 16.4+) all have native `OffscreenCanvas`. No polyfill needed for this project's target platforms.

### Bundle size — lazy import is mandatory

`heic2any` bundles libheif compiled to WebAssembly. Uncompressed: ~3-4 MB; brotli-compressed: ~1.2 MB. Eagerly importing it bloats the initial bundle unacceptably. Use dynamic import, invoked only when a HEIC/HEIF file is detected:

```ts
// In the photo-change handler, NOT at module top level:
if (isHeic) {
  const heic2any = (await import('heic2any')).default
  jpegBlob = Array.isArray(await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 }))
    ? (result as Blob[])[0]
    : (result as Blob)
}
```

Vite will code-split this into a separate chunk automatically (dynamic import → lazy chunk).

### iOS 16.4+ Safari compatibility

Works correctly on iOS 16.4+ Safari (standalone PWA). HEIC conversion is pure JS/WASM in the browser — no native codec dependency. The conversion runs synchronously on the main thread; show a loading indicator during conversion for large files (>10 MB raw HEIC from 48MP cameras can take 1-3 seconds).

### Return value gotcha

Always handle `Blob[]`: `const blob = Array.isArray(r) ? r[0] : r`. Burst-mode HEIC (Live Photos on iPhone) returns multiple frames.

---

## 4. `browser-image-compression` Usage

### Package

```
npm install browser-image-compression
```

Ships TypeScript declarations. No `@types/` package needed.

### Basic usage

```ts
import imageCompression from 'browser-image-compression'

const options = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,   // runs compression off-main-thread (default true)
}

const compressedFile = await imageCompression(file, options)
```

### After heic2any conversion

`imageCompression` expects a `File`, not a `Blob`. After `heic2any` returns a `Blob`, wrap it:

```ts
const jpegFile = new File([jpegBlob], 'photo.jpg', { type: 'image/jpeg' })
const compressedFile = await imageCompression(jpegFile, options)
```

Then pass `compressedFile` (a `File`, which extends `Blob`) directly to `uploadBytes`.

### EXIF / orientation

`browser-image-compression` v2.x reads EXIF orientation and physically rotates the canvas before stripping EXIF. The resulting image is correctly oriented without needing EXIF. This means `<img>` tags will display correctly without `image-orientation: from-image` CSS. No special handling needed.

### `useWebWorker: true`

Default is `true`. This runs compression in a Web Worker, keeping the main thread responsive. Works on iOS Safari 16.4+. Keep it `true` for this app.

---

## 5. Firebase Storage `getDownloadURL` Flow

### firebase@12 modular SDK pattern

```ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'

const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/photo.jpg`
const storageRef = ref(storage, storagePath)

// Upload (compressedFile is a File from browser-image-compression)
const snapshot = await uploadBytes(storageRef, compressedFile, {
  contentType: 'image/jpeg',
})

// Get permanent download URL
const photoURL = await getDownloadURL(snapshot.ref)
```

Use `uploadBytes` (one-shot) rather than `uploadBytesResumable` unless progress reporting is needed. `uploadBytesResumable` is appropriate if a progress bar is desired.

### Do download URLs expire?

**Firebase Storage download URLs are permanent.** They contain an access token and do not expire by default. The URL remains valid until:
- The file is deleted from Storage
- The token is manually revoked via the Firebase Console (Storage → Files → "Revoke access")

For this app, permanent URLs are fine — the pair is private and the token is embedded in the URL.

### Storing downloadURL vs. storage path — recommendation

This project already decided (D-01/D-03) to store the **download URL** (`photoURL: string | null`) in the Firestore submission doc, not the storage path. Tradeoffs:

| | Download URL | Storage path |
|---|---|---|
| Rendering | Direct `<img src={photoURL}>` — no async call | Must call `getDownloadURL(ref(storage, path))` at render time |
| Revocation | Requires deleting file + updating Firestore doc | Re-call `getDownloadURL` on a new file anytime |
| Storage size | Longer URL string (~200 chars) | Short path string |

For a 2-person private app with no revocation requirement in Phase 3, storing the download URL is the correct choice. Stick with D-01.

---

## 6. `submitEntry` Cloud Function Transaction Pattern

### Schema (Zod 4)

```ts
import { z } from 'zod'

const SubmitEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().max(500).nullable(),
  photoURL: z.url().nullable(),
}).superRefine((data, ctx) => {
  if (!data.photoURL && !data.text?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one of photo or text is required',
      path: ['photoURL'],
    })
  }
})
```

Note: `z.url()` is Zod 4 top-level method (not `z.string().url()`). Confirmed in CLAUDE.md Zod 4 migration table.

### Subcollection document references (Admin SDK)

```ts
const db = getFirestore()
const userRef = db.doc(`users/${uid}`)
const entryRef = db.doc(`pairs/${pairId}/entries/${entryDate}`)
const submissionRef = db.doc(`pairs/${pairId}/entries/${entryDate}/submissions/${uid}`)
```

Subcollection paths in Admin SDK are identical to client SDK — just use the full path string.

### Full transaction — ALL READS BEFORE WRITES

The Admin SDK constraint (confirmed in existing joinPair code) requires all `tx.get()` calls to complete before any `tx.set()`/`tx.update()` calls. Use `Promise.all` for efficiency:

```ts
await db.runTransaction(async (tx) => {
  // --- READS ---
  const [userSnap, entrySnap] = await Promise.all([
    tx.get(userRef),
    tx.get(entryRef),
  ])

  // Validate user has a pair
  if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')
  const userData = userSnap.data()!
  if (!userData.pairId) throw new HttpsError('failed-precondition', 'You are not in a pair yet')
  if (userData.pairId !== pairId) throw new HttpsError('permission-denied', 'Pair mismatch')

  // Idempotent guard (SUBM-04 / D-08)
  const existingMembers: string[] = entrySnap.exists
    ? (entrySnap.data()!.submittedMembers ?? [])
    : []
  if (existingMembers.includes(uid)) {
    throw new HttpsError('already-exists', 'You have already submitted today')
  }

  // --- WRITES ---
  // submission doc (always a create — idempotent guard above prevents duplicates)
  tx.set(submissionRef, {
    uid,
    photoURL: photoURL ?? null,
    text: text ?? null,
    submittedAt: FieldValue.serverTimestamp(),
  })

  if (!entrySnap.exists) {
    // First submission — create entry doc directly in one_submitted state
    tx.set(entryRef, {
      pairId,
      date: entryDate,
      status: 'one_submitted',
      submittedMembers: [uid],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    // Entry exists — update (arrayUnion is safe here per joinPair precedent)
    tx.update(entryRef, {
      submittedMembers: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
      // status stays 'one_submitted' for both 1st and 2nd submission in Phase 3
      // Phase 4 will read submittedMembers.length == 2 and transition to 'revealed'
      status: 'one_submitted',
    })
  }
})

return { entryDate, alreadySubmitted: false }
```

### `tx.set()` vs `tx.update()` constraint

`tx.update()` on a non-existent document throws `NOT_FOUND` even inside a transaction. The `if (!entrySnap.exists) { tx.set(...) } else { tx.update(...) }` branching pattern is mandatory. `tx.set(ref, data, { merge: true })` is an alternative to conditional branching but produces less predictable behavior with `FieldValue.serverTimestamp()` on create vs update — prefer explicit branching.

### `FieldValue.arrayUnion(uid)` in transactions

Confirmed safe: `joinPair` uses `FieldValue.arrayUnion(uid)` inside `tx.update()` successfully. Same pattern applies here.

### Returning `alreadySubmitted`

If the idempotent check fires, throw `HttpsError('already-exists', ...)` rather than returning `{ alreadySubmitted: true }`. The client should show the SubmittedState based on the `onSnapshot` listener hitting `submittedMembers.includes(uid)` — not on the CF return value. The CF error is the safety net for direct CF invocations.

---

## 7. Firestore Subcollection Security Rules

### Entry doc rules

```javascript
match /pairs/{pairId}/entries/{entryDate} {
  // Both members can read entry doc — it contains only status + submittedMembers (not content)
  allow read: if request.auth != null
    && request.auth.uid in
       get(/databases/$(database)/documents/pairs/$(pairId)).data.members;

  // No client writes — all writes via Admin SDK (Cloud Functions)
  allow write: if false;
}
```

### Submission subcollection rules (SEC-01, SEC-02, SEC-05)

```javascript
match /pairs/{pairId}/entries/{entryDate}/submissions/{uid} {
  allow read: if request.auth != null && (
    // Owner can always read their own submission
    request.auth.uid == uid
    // Partner can read only after entry is revealed
    || (
      request.auth.uid in
        get(/databases/$(database)/documents/pairs/$(pairId)).data.members
      && get(/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)).data != null
      && get(/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)).data.status == 'revealed'
    )
  );

  // No client writes — Admin SDK only (SEC-02)
  allow write: if false;
}
```

### `in` operator and missing fields

- `request.auth.uid in resource.data.members` — only valid when the document **exists** (for reads where `resource` is defined). On read requests, `resource` is always the existing document — safe to use without existence check.
- `get()` result `.data` is null if the document doesn't exist. Guard: `get(...).data != null && get(...).data.status == 'revealed'`. In Phase 3, the entry doc is always created by the CF before the submission doc, so in practice the entry will exist when the submission is being read. But the guard is defensive correctness.

### Path format in Firestore rules

`/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)` — `$(database)` is the Firestore rules variable (injected by the runtime). Confirmed as the correct pattern from existing `firestore.rules` in this codebase.

### Wildcard matching for subcollections

`match /pairs/{pairId}/entries/{entryDate}/submissions/{uid}` captures all four path segments as variables. The outer `match /databases/{database}/documents` block provides `$(database)`. Subcollection wildcards are standard Firestore rules — no special syntax.

### Collection group queries (not needed in Phase 3)

Phase 3 only reads individual submission docs via direct path. Collection group queries (`collectionGroup('submissions')`) would require a separate `match /{path=**}/submissions/{uid}` rule — not needed here.

---

## Pitfalls

1. **`firestore.get()` path in Storage rules uses literal `(default)`, not `$(database)`** — Storage rules and Firestore rules use different syntaxes. In Firestore rules: `get(/databases/$(database)/documents/...)`. In Storage rules: `firestore.get(/databases/(default)/documents/...)`. Mixing them causes the rule to evaluate as `false` silently.

2. **Both emulators must run together for `firestore.get()` in Storage rules** — Running `firebase emulators:start --only storage` will cause `firestore.get()` calls in Storage rules to fail (no Firestore emulator to resolve against). The `firebase.json` in this project already starts all emulators together — but CI scripts and test runners must also start all emulators.

3. **`@firebase/rules-unit-testing` v5 requires BOTH `firestore` and `storage` keys in `initializeTestEnvironment` to test Storage rules that call `firestore.get()`** — if only `storage` is declared, `firestore.get()` in Storage rules returns `false` in the test environment.

4. **`tx.update()` on non-existent document throws** — The entry doc may not exist on the first submission. Must branch: `if (!entrySnap.exists) tx.set(...) else tx.update(...)`. Never call `tx.update(entryRef, ...)` without first confirming existence via `entrySnap.exists`.

5. **`heic2any` returns `Blob | Blob[]`** — Multi-frame HEIC (burst, Live Photo) returns an array. Always guard: `const blob = Array.isArray(r) ? r[0] : r`.

6. **`heic2any` must be lazy-imported** — Eagerly importing it adds ~1.2 MB compressed to the initial bundle. Use `(await import('heic2any')).default` inside the HEIC branch of the file-change handler.

7. **`browser-image-compression` accepts `File`, not `Blob`** — `heic2any` returns a `Blob`. Wrap before passing: `new File([blob], 'photo.jpg', { type: 'image/jpeg' })`.

8. **HEIC MIME type detection on iOS** — iOS sometimes reports HEIC files with `type: ''` (empty string). Add filename extension check: `file.name.toLowerCase().endsWith('.heic')` as a fallback alongside `file.type === 'image/heic'`.

9. **Admin SDK read-before-write constraint** — All `tx.get()` calls must complete before any `tx.set()`/`tx.update()`. Use `Promise.all([tx.get(userRef), tx.get(entryRef)])`. This is the established pattern from `joinPair` in `functions/src/index.ts`.

10. **Zod 4 `z.url()` is top-level, not chained** — `z.string().url()` is Zod 3 syntax. Zod 4 uses `z.url()` directly (confirmed in CLAUDE.md migration table). Using `z.string().url()` in Zod 4 will throw a runtime error on schema construction.

11. **`pairId` must be validated inside the CF** — The client passes `pairId` in the submission (implicitly via the user's stored `pairId`). The CF must read `users/{uid}.pairId` from Firestore (inside the transaction) and use that — never trust a `pairId` passed by the client payload. The CF derives `pairId` from the server-side user doc.

12. **Storage emulator already configured in `firebase.json`** — No changes needed to `firebase.json` for Storage emulator. It's at port 9199 and already in the emulator block.

13. **`heic2any` and `browser-image-compression` are not in `package.json`** — Both must be `npm install`ed in `shared-reveal/` (client). They are not needed in `functions/` (photo processing is client-side only per D-03).

---

## Validation Architecture

### Firestore Emulator Rule Tests (`tests/rules/submissions.test.ts`)

**Setup:** One `beforeAll` that seeds: `pairs/pair1` (members: [alice, bob]), `pairs/pair1/entries/2026-08-31` (status: 'one_submitted', submittedMembers: [alice]), `pairs/pair1/entries/2026-08-31/submissions/uid-alice` (text: 'test').

**Deny scenarios (assertFails):**
1. Bob reads Alice's submission before reveal → DENY (SEC-01, SUBM-05)
2. Alice reads Bob's submission (doesn't exist yet) → DENY — still deny even for non-existent doc
3. Eve (uid not in pair) reads Alice's submission → DENY (SEC-04)
4. Anonymous user reads Alice's submission → DENY
5. Alice writes directly to her own submission doc from client → DENY (SEC-02)
6. Alice writes directly to entry doc's `status` field from client → DENY (SEC-02)
7. Bob writes to Alice's submission path from client → DENY
8. Anyone creates an entry doc directly from client → DENY

**Allow scenarios (assertSucceeds):**
1. Alice reads her own submission → ALLOW (SEC-01 owner branch)
2. Bob reads Bob's own submission (seed Bob's submission first) → ALLOW
3. Alice reads entry doc (status, submittedMembers) → ALLOW (not sensitive — no content)
4. Bob reads entry doc → ALLOW
5. After reveal: set entry status to 'revealed' via `withSecurityRulesDisabled` → Alice reads Bob's submission → ALLOW (SEC-04)
6. After reveal: Bob reads Alice's submission → ALLOW

**Client-write deny scenarios:**
7. Alice directly updates `pairs/pair1/entries/2026-08-31` with `{ status: 'revealed' }` → DENY
8. Alice directly creates `pairs/pair1/entries/2026-08-31/submissions/uid-alice` → DENY

### Storage Emulator Rule Tests (separate or same file, section)

**Setup:** Seed Firestore (pair + entry) via `withSecurityRulesDisabled` on the Firestore context; test Storage operations on authenticated Storage contexts.

**Deny scenarios:**
1. Bob writes to Alice's storage path (`pairs/pair1/entries/.../uid-alice/photo.jpg`) → DENY
2. Eve (non-member) writes to any path → DENY
3. Bob reads Alice's storage photo before reveal → DENY
4. Eve reads any storage photo → DENY

**Allow scenarios:**
1. Alice uploads to her own path → ALLOW
2. Alice reads her own photo → ALLOW (unrevealed)
3. After reveal: Bob reads Alice's photo → ALLOW

### Unit Tests (`tests/unit/submissions.test.ts`)

**Zod schema tests:**
1. Valid input (photoURL + text) → `safeParse` succeeds
2. Valid input (photoURL only, text null) → succeeds
3. Valid input (text only, photoURL null) → succeeds
4. Invalid: both null (photoURL: null, text: null) → `superRefine` fires, error on `photoURL` path
5. Invalid: text only but text is whitespace only (`text: '   '`) → `superRefine` fires (`.trim()` check)
6. Invalid: `entryDate` wrong format (e.g., `'20260831'`) → regex fails
7. Invalid: `entryDate` valid format (`'2026-08-31'`) → succeeds
8. Invalid: `text` too long (501 chars) → `z.string().max(500)` fails
9. Invalid: `photoURL` is not a valid URL → `z.url()` fails

**CF validation logic tests (pure functions, no emulator):**
1. `submittedMembers.includes(uid)` true → idempotent guard triggers (test the condition logic)
2. Entry doc missing → entry created with `status: 'one_submitted'` and `submittedMembers: [uid]`
3. Entry doc with 1 member → update adds uid, status stays `one_submitted`

---

## Summary

### What the planner needs to know to create PLAN.md files

**Phase 3 is 4-5 plans:**

**Plan 03-01 (Types + Zod schema):** Add `EntryDoc` and `SubmissionDoc` to `src/types/index.ts`. Define `SubmitEntrySchema` in `functions/src/index.ts`. Write unit tests in `tests/unit/submissions.test.ts` covering Zod schema (TEST-01). Straightforward — no new dependencies.

**Plan 03-02 (Photo upload pipeline):** `npm install heic2any browser-image-compression` in `shared-reveal/`. Write a `uploadSubmissionPhoto(pairId, entryDate, uid, file)` service in `src/services/submissions.ts` that does the full HEIC→JPEG→compress→upload→getDownloadURL pipeline. Unit-testable with mock files (no emulator needed for logic tests). Lazy-import `heic2any`. Handle `Blob[]` return. Wrap Blob to File before compression.

**Plan 03-03 (`submitEntry` Cloud Function):** Add `submitEntry` export to `functions/src/index.ts`. Same pattern as `joinPair`: callableOptions guard, Zod parse, read-before-write transaction. Key branching: `entrySnap.exists` → `tx.set` vs `tx.update`. `FieldValue.arrayUnion` for `submittedMembers`. Phase 4 will add reveal logic to this function.

**Plan 03-04 (Security rules):** Update `firestore.rules` to add `entries/{entryDate}` (read: pair members; write: false) and `submissions/{uid}` (read: owner always or partner post-reveal via `get()`; write: false). Update `storage.rules` with `pairs/{pairId}/entries/{entryDate}/{uid}/{filename}` write rule (membership check via `firestore.get()`) and read rule (owner always or post-reveal via `firestore.get()`). Write emulator tests in `tests/rules/submissions.test.ts` using `@firebase/rules-unit-testing` v5 with both `firestore` and `storage` in `initializeTestEnvironment` (TEST-02, SEC-01–04).

**Plan 03-05 (Submission UI):** Replace the partner card body in `HomePage.tsx` with three sub-components: `SubmitForm` (photo + text form, char counter, HEIC conversion feedback), `SubmittedState` (confirmation card), `PartnerStatus` badge (status from `submittedMembers`, no content). Add `useEntry(pairId: string | null, entryDate: string)` hook in `src/hooks/useEntry.ts` (onSnapshot on the entry doc). Wire state machine: not in submittedMembers → SubmitForm; in submittedMembers → SubmittedState; partner in submittedMembers → PartnerStatus badge. (SUBM-01–07, D-05, D-06)

**Critical sequencing constraint:** Plan 03-04 (rules) must come before or alongside Plan 03-03 (CF) so the CF deploy doesn't create a window where writes succeed but reads are broken. In practice, all rules are deployed together — plan can sequence rules first.

**No new Firebase emulator config needed:** `firebase.json` already has storage emulator at port 9199.

**New npm deps (client only):** `heic2any`, `browser-image-compression` — add to `shared-reveal/package.json` dependencies (not devDependencies, since they run in the browser).

**`pairId` derivation in CF:** CF reads `pairId` from `users/{uid}` inside the transaction — the client does NOT pass it. The CF constructs the Firestore paths using the server-validated `pairId`.

**Storage rules pitfall to call out explicitly in the plan:** `(default)` vs `$(database)` in cross-service `firestore.get()` calls. This is the most likely implementation error.
