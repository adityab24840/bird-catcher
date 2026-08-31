# Phase 3: Submissions + Privacy Layer - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 12
**Analogs found:** 11 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `shared-reveal/functions/src/index.ts` | Cloud Function | request-response | itself (submitEntry mirrors joinPair pattern) | high |
| `shared-reveal/src/types/index.ts` | types | N/A | itself (add EntryDoc, SubmissionDoc) | self-extend |
| `shared-reveal/src/hooks/useEntry.ts` | hook | event-driven | `shared-reveal/src/hooks/usePair.ts` | role-match |
| `shared-reveal/src/services/submissions.ts` | service | request-response + async file ops | `shared-reveal/src/services/pair.ts` + `auth.ts` | role-match + extend |
| `shared-reveal/src/pages/HomePage.tsx` | page | event-driven + form | itself (add submission UI section, replace partner card body) | self-extend |
| `shared-reveal/firestore.rules` | config/rules | N/A | itself (add entries + submissions rules) | self-extend |
| `shared-reveal/storage.rules` | config/rules | N/A | itself (complete from placeholder) | self-extend |
| `shared-reveal/tests/unit/submissions.test.ts` | unit test | N/A | `shared-reveal/tests/unit/pair.test.ts` | role-match |
| `shared-reveal/tests/rules/submissions.test.ts` | rules test | N/A | none (new pattern, @firebase/rules-unit-testing v5) | no analog |

---

## Pattern Assignments

### `shared-reveal/functions/src/index.ts` (Cloud Function, request-response) — ADD `submitEntry` export

**Analog:** itself (`shared-reveal/functions/src/index.ts`) for the `joinPair` pattern lines 102-173

**Pattern to replicate — imports and schema** (lines 1-5 of index.ts):
```typescript
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
```
All already present. No new imports needed for `submitEntry`.

**Zod 4 schema pattern** (from joinPairSchema, lines 42-44):
```typescript
const JoinPairSchema = z.object({
  inviteCode: z.string().length(6).regex(/^[A-F0-9]{6}$/),
})
```
For submitEntry — add inline or as a separate const (RESEARCH.md §6):
```typescript
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

**callableOptions guard pattern** (line 49):
```typescript
const callableOptions = process.env.FUNCTIONS_EMULATOR ? {} : { enforceAppCheck: true }
```
Reuse verbatim — `submitEntry` also uses the same guard.

**v2 onCall export signature** (lines 102-173 of joinPair as template):
```typescript
export const submitEntry = onCall(callableOptions, async (request) => {
  // 1. Auth check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in')
  }

  // 2. Zod parse
  const parsed = SubmitEntrySchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid submission data')
  }
  const { entryDate, text, photoURL } = parsed.data
  const uid = request.auth.uid

  // 3. Setup refs
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const entryRef = db.doc(`pairs/{pairId}/entries/${entryDate}`) // pairId from user doc
  const submissionRef = db.doc(`pairs/{pairId}/entries/${entryDate}/submissions/${uid}`) // subcollection

  // 4. Firestore transaction — ALL READS BEFORE WRITES (Pitfall 2 from RESEARCH.md)
  await db.runTransaction(async (tx) => {
    const [userSnap, entrySnap] = await Promise.all([
      tx.get(userRef),
      tx.get(entryRef),
    ])

    // Validate user and get pairId
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found')
    }
    const userData = userSnap.data()!
    if (!userData.pairId) {
      throw new HttpsError('failed-precondition', 'You are not in a pair yet')
    }
    const pairId = userData.pairId

    // Idempotent guard (SUBM-04)
    const existingMembers: string[] = entrySnap.exists
      ? (entrySnap.data()!.submittedMembers ?? [])
      : []
    if (existingMembers.includes(uid)) {
      throw new HttpsError('already-exists', 'You have already submitted today')
    }

    // Write submission doc (subcollection)
    tx.set(submissionRef, {
      uid,
      photoURL: photoURL ?? null,
      text: text ?? null,
      submittedAt: FieldValue.serverTimestamp(),
    })

    // Write or update entry doc
    if (!entrySnap.exists) {
      // First submission — create entry
      tx.set(entryRef, {
        pairId,
        date: entryDate,
        status: 'one_submitted',
        submittedMembers: [uid],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      // Entry exists — update (arrayUnion safe per joinPair precedent)
      tx.update(entryRef, {
        submittedMembers: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
        status: 'one_submitted', // Phase 3 — no auto-reveal yet
      })
    }
  })

  return { entryDate, alreadySubmitted: false }
})
```

**Error codes to use** (mirrored from joinPair, lines 108-141):
- `'unauthenticated'` — no auth
- `'invalid-argument'` — Zod parse failed
- `'not-found'` — user doc missing, or invite code not found
- `'failed-precondition'` — user not in pair
- `'already-exists'` — already submitted

**Subcollection doc references** (from RESEARCH.md §6 — Admin SDK identical to client):
```typescript
const db = getFirestore()
const submissionRef = db.doc(`pairs/${pairId}/entries/${entryDate}/submissions/${uid}`)
```

---

### `shared-reveal/src/types/index.ts` (types) — ADD `EntryDoc`, `SubmissionDoc`

**Analog:** itself (lines 9-27 for UserDoc and PairDoc pattern)

**Existing interface pattern** (lines 9-16):
```typescript
export interface UserDoc {
  displayName: string | null
  email: string | null
  photoURL: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  pairId: string | null
}
```

**New interfaces to append** (after PairDoc, following same structure):
```typescript
/**
 * Firestore entries/{entryDate} document (subcollection under pairs/{pairId}).
 * Readable by both pair members; writable only by Cloud Functions.
 * Contains metadata only — no user submission content (privacy at doc level).
 */
export interface EntryDoc {
  pairId: string                        // Denormalized for easier querying
  date: string                          // YYYY-MM-DD in user's local timezone
  status: 'pending' | 'one_submitted'   // Phase 3: only these two; Phase 4 adds 'revealed'
  submittedMembers: string[]            // UIDs of members who have submitted
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Firestore submissions/{uid} document (subcollection under pairs/{pairId}/entries/{entryDate}).
 * Readable by owner always; readable by partner only when entry.status === 'revealed'.
 * Writable only by Cloud Functions.
 */
export interface SubmissionDoc {
  uid: string                    // Owner UID
  photoURL: string | null        // Firebase Storage download URL (or null)
  text: string | null            // Text content, max 500 chars (or null)
  submittedAt: Timestamp
}
```

**Import already present** (line 1):
```typescript
import type { Timestamp } from 'firebase/firestore'
```

---

### `shared-reveal/src/hooks/useEntry.ts` (hook, event-driven) — NEW

**Analog:** `shared-reveal/src/hooks/usePair.ts` (lines 1-39)

**Imports pattern** (usePair.ts lines 1-4):
```typescript
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
```
For useEntry:
```typescript
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EntryDoc } from '../types/index'
```

**Interface + state pattern** (usePair.ts lines 6-9):
```typescript
interface PairState {
  pairId: string | null
  pairLoading: boolean
}
```
For useEntry:
```typescript
interface EntryState {
  entryDoc: EntryDoc | null
  entryLoading: boolean
}
```

**useState + useEffect + subscription + cleanup pattern** (usePair.ts lines 11-39):
```typescript
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
For useEntry — adapt with onSnapshot on the entry doc (pairId + entryDate params):
```typescript
export function useEntry(pairId: string | null, entryDate: string): EntryState {
  const [entryDoc, setEntryDoc] = useState<EntryDoc | null>(null)
  const [entryLoading, setEntryLoading] = useState(true)

  useEffect(() => {
    if (!pairId || !entryDate) {
      setEntryDoc(null)
      setEntryLoading(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, `pairs/${pairId}/entries`, entryDate),
      (snap) => {
        const data = snap.exists() ? (snap.data() as EntryDoc) : null
        setEntryDoc(data)
        setEntryLoading(false)
      },
      (err) => {
        console.error('[useEntry] listener error:', err)
        setEntryLoading(false)
      },
    )

    return () => unsub()
  }, [pairId, entryDate])

  return { entryDoc, entryLoading }
}
```

**Key difference from usePairId:** Takes two params (pairId + entryDate) instead of one (uid). Always returns an EntryDoc or null, unlike pairId which is a string. No lazy loading — both params must be ready to subscribe.

---

### `shared-reveal/src/services/submissions.ts` (service, request-response + async file ops) — NEW

**Analog:** `shared-reveal/src/services/pair.ts` (lines 1-14) + `shared-reveal/src/services/auth.ts` (for general service structure)

**Imports pattern** (pair.ts lines 1-2):
```typescript
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'
```
For submissions.ts — extends with Storage and photo processing:
```typescript
import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { functions, storage } from '../firebase/config'
import imageCompression from 'browser-image-compression'
```

**Typed callable wrapper pattern** (pair.ts lines 4-14):
```typescript
interface CreatePairResult { pairId: string; inviteCode: string }
interface JoinPairResult { pairId: string }

export const createPairFn = httpsCallable<void, CreatePairResult>(functions, 'createPair')
export const joinPairFn = httpsCallable<{ inviteCode: string }, JoinPairResult>(functions, 'joinPair')
```
For submissions.ts:
```typescript
interface SubmitEntryInput {
  entryDate: string      // YYYY-MM-DD from client
  text: string | null
  photoURL: string | null  // Already a download URL from storage
}

interface SubmitEntryResult {
  entryDate: string
  alreadySubmitted: boolean
}

export const submitEntryFn = httpsCallable<SubmitEntryInput, SubmitEntryResult>(
  functions,
  'submitEntry'
)
```

**Photo upload pipeline** (from RESEARCH.md §3-5; D-03 of CONTEXT.md):
```typescript
/**
 * Converts HEIC/HEIF to JPEG (if needed), compresses to ≤1MB, uploads to Firebase Storage,
 * and returns the permanent download URL.
 * 
 * Flow: HEIC detect → heic2any → browser-image-compression → uploadBytes → getDownloadURL
 * 
 * HEIC conversion is lazy-imported (Pitfall 6 from RESEARCH.md).
 * Returns null if no file is provided.
 */
export async function uploadSubmissionPhoto(
  pairId: string,
  entryDate: string,
  uid: string,
  file: File
): Promise<string | null> {
  if (!file) return null

  try {
    // Step 1: HEIC/HEIF detection and conversion to JPEG
    const isHeic = file.type === 'image/heic'
      || file.type === 'image/heif'
      || file.name.toLowerCase().endsWith('.heic')
      || file.name.toLowerCase().endsWith('.heif')

    let jpegBlob: Blob = file

    if (isHeic) {
      const heic2any = (await import('heic2any')).default
      const result = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9,
      })
      // Pitfall 5 from RESEARCH.md: heic2any returns Blob | Blob[]
      jpegBlob = Array.isArray(result) ? result[0] : result
    }

    // Step 2: Convert Blob to File for browser-image-compression (Pitfall 7)
    const jpegFile = new File([jpegBlob], 'photo.jpg', { type: 'image/jpeg' })

    // Step 3: Compress to ≤1 MB, ≤1920px
    const compressedFile = await imageCompression(jpegFile, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    })

    // Step 4: Upload to Storage
    const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/photo.jpg`
    const storageRef = ref(storage, storagePath)
    const snapshot = await uploadBytes(storageRef, compressedFile, {
      contentType: 'image/jpeg',
    })

    // Step 5: Get permanent download URL
    const photoURL = await getDownloadURL(snapshot.ref)
    return photoURL
  } catch (err) {
    console.error('[uploadSubmissionPhoto] failed:', err)
    throw err
  }
}
```

**HEIC detection logic** (from RESEARCH.md §3):
```typescript
const isHeic = file.type === 'image/heic'
  || file.type === 'image/heif'
  || file.name.toLowerCase().endsWith('.heic')   // Pitfall 8 fallback
  || file.name.toLowerCase().endsWith('.heif')
```

---

### `shared-reveal/src/pages/HomePage.tsx` (page, event-driven + form) — MODIFY

**Analog:** itself (`shared-reveal/src/pages/HomePage.tsx` lines 1-149 as base) + `shared-reveal/src/pages/PairSetupPage.tsx` (form handling pattern)

**Existing pattern to preserve** (lines 22-78):
- User auth subscription via `useAuth()`
- onSnapshot listeners for `users/{uid}` and partner doc
- Partner identity card display (lines 113-136)

**Structure of Phase 3 modifications:**
1. Add `useEntry(pairId, entryDate)` hook call (after userDoc and partnerId are known)
2. Generate `entryDate` as `new Date().toLocaleDateString('en-CA')` in a useEffect
3. Add submission section (replaces partner card body content in lines 113-136)
4. Wire state machine: show SubmitForm OR SubmittedState based on `submittedMembers.includes(uid)`
5. Add PartnerStatus badge when partner is in submittedMembers

**Import additions** (after existing imports):
```typescript
import { useEntry } from '../hooks/useEntry'
import { submitEntryFn } from '../services/submissions'
import { uploadSubmissionPhoto } from '../services/submissions'
```

**Date computation pattern** (in useEffect):
```typescript
const [entryDate, setEntryDate] = useState<string>('')

useEffect(() => {
  const today = new Date().toLocaleDateString('en-CA') // Produces YYYY-MM-DD in local TZ
  setEntryDate(today)
}, [])
```

**Hook call pattern** (after userDoc.pairId is known):
```typescript
const { entryDoc, entryLoading } = useEntry(userDoc?.pairId ?? null, entryDate)
```

**State variables to add**:
```typescript
const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
const [photoPreview, setPhotoPreview] = useState<string | null>(null)
const [submissionText, setSubmissionText] = useState('')
const [submitting, setSubmitting] = useState(false)
const [submitError, setSubmitError] = useState<string | null>(null)
const [uploadingPhoto, setUploadingPhoto] = useState(false)
```

**Photo selection handler** (from RESEARCH.md §3 + D-03 of CONTEXT.md):
```typescript
async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return

  setSelectedPhoto(file)
  
  // Create local preview
  const reader = new FileReader()
  reader.onload = (evt) => {
    setPhotoPreview(evt.target?.result as string)
  }
  reader.readAsDataURL(file)
}

function handleRemovePhoto() {
  setSelectedPhoto(null)
  setPhotoPreview(null)
}
```

**Submission handler** (mirrors PairSetupPage handleJoin, lines 40-51):
```typescript
async function handleSubmit() {
  setSubmitError(null)

  // Client-side validation (Zod + at-least-one check)
  if (!selectedPhoto && !submissionText.trim()) {
    setSubmitError('Please add a photo or text before submitting.')
    return
  }

  if (submissionText.length > 500) {
    setSubmitError('Text must be 500 characters or less.')
    return
  }

  setSubmitting(true)
  try {
    // Upload photo if present
    let photoURL: string | null = null
    if (selectedPhoto) {
      setUploadingPhoto(true)
      photoURL = await uploadSubmissionPhoto(
        userDoc!.pairId!,
        entryDate,
        user!.uid,
        selectedPhoto
      )
      setUploadingPhoto(false)
    }

    // Call submitEntry Cloud Function
    const result = await submitEntryFn({
      entryDate,
      text: submissionText.trim() || null,
      photoURL,
    })

    // Clear form on success — UI will update via onSnapshot listener
    setSelectedPhoto(null)
    setPhotoPreview(null)
    setSubmissionText('')
  } catch (err: any) {
    const errMsg = err.message ?? 'Failed to submit'
    setSubmitError(errMsg)
    console.error('[HomePage] submit error:', err)
  } finally {
    setSubmitting(false)
  }
}
```

**UI section to replace** (lines 113-136 — the partner card body):
```tsx
{/* Submission UI — replaces partner card body from Phase 2 */}
<div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-center">
  {docLoading || entryLoading ? (
    <p className="text-gray-400">Loading…</p>
  ) : entryDoc?.submittedMembers?.includes(user?.uid ?? '') ? (
    <>
      {/* SubmittedState component */}
      <div className="space-y-3">
        <div className="text-2xl">✓</div>
        <p className="font-medium text-gray-900">You've shared something for today</p>
        
        {/* PartnerStatus badge */}
        {entryDoc?.submittedMembers?.includes(partnerId ?? '') && (
          <p className="text-xs text-green-600 mt-2">They've shared something too ✓</p>
        )}
        {!entryDoc?.submittedMembers?.includes(partnerId ?? '') && (
          <p className="text-xs text-gray-500 mt-2">Waiting for them to share…</p>
        )}
      </div>
    </>
  ) : (
    <>
      {/* SubmitForm component */}
      <div className="space-y-3 text-left">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Photo (optional)</label>
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              <button
                onClick={handleRemovePhoto}
                className="absolute top-1 right-1 bg-white rounded-full p-1 shadow"
              >
                ×
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              disabled={submitting || uploadingPhoto}
              className="block w-full text-xs text-gray-500 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white file:px-3 file:py-1 cursor-pointer disabled:opacity-50"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Text (optional) • {submissionText.length}/500
          </label>
          <textarea
            value={submissionText}
            onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
            placeholder="What reminded you of them today?"
            disabled={submitting || uploadingPhoto}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            rows={3}
          />
        </div>

        {submitError && (
          <p className="text-xs text-red-600">{submitError}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || uploadingPhoto}
          className="w-full rounded-lg bg-purple-500 py-2 text-sm font-medium text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : uploadingPhoto ? 'Uploading photo…' : 'Share today's something'}
        </button>

        {/* Partner status indicator */}
        {entryDoc && (
          <p className="text-xs text-gray-500">
            {entryDoc.submittedMembers?.includes(partnerId ?? '') 
              ? "They've shared something for today ✓"
              : 'Waiting for them to share…'}
          </p>
        )}
      </div>
    </>
  )}
</div>
```

---

### `shared-reveal/firestore.rules` (config/rules) — MODIFY

**Analog:** itself (lines 1-47)

**Preserve existing rules:**
- `/users/{uid}` read/create/update/delete
- `/pairs/{pairId}` read/write=false

**Add after /pairs block, before catch-all deny** (new lines):
```javascript
match /pairs/{pairId}/entries/{entryDate} {
  // Both pair members can read entry doc (status + submittedMembers only, no content)
  allow read: if request.auth != null
    && request.auth.uid in
       get(/databases/$(database)/documents/pairs/$(pairId)).data.members;

  // No client writes — all writes via Admin SDK Cloud Functions (SEC-02)
  allow write: if false;

  // Nested submissions subcollection
  match /submissions/{uid} {
    // Owner can always read their own submission
    allow read: if request.auth != null && request.auth.uid == uid;

    // Partner can read only after entry is revealed (SEC-01, SEC-04)
    // Guard with null-check for missing entry docs (Pitfall from RESEARCH.md §7)
    allow read: if request.auth != null
      && request.auth.uid != uid
      && request.auth.uid in
         get(/databases/$(database)/documents/pairs/$(pairId)).data.members
      && get(/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)).data != null
      && get(/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)).data.status == 'revealed';

    // No client writes — Admin SDK only (SEC-02)
    allow write: if false;
  }
}
```

**Path format reminder** (from RESEARCH.md §7):
- `$(database)` variable — injected by Firestore rules runtime
- Full path: `/databases/$(database)/documents/pairs/$(pairId)/entries/$(entryDate)`
- `get()` returns resource-like object; `.data` is null if missing — guard with `!= null`

---

### `shared-reveal/storage.rules` (config/rules) — MODIFY or CREATE

**Analog:** itself (lines 1-10) as placeholder

**Complete rules** (from RESEARCH.md §1):
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Deny all by default
    match /{allPaths=**} {
      allow read, write: if false;
    }

    // Photo uploads: pairs/{pairId}/entries/{entryDate}/{uid}/photo.jpg
    match /pairs/{pairId}/entries/{entryDate}/{uid}/{filename} {
      // Write: owner only, and membership verified via Firestore
      allow write: if request.auth != null
        && request.auth.uid == uid
        && firestore.exists(/databases/(default)/documents/pairs/$(pairId))
        && request.auth.uid in
           firestore.get(/databases/(default)/documents/pairs/$(pairId)).data.members;

      // Read: owner always; partner after reveal (cross-Firestore check)
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

**Critical pitfall** (Pitfall 1 from RESEARCH.md):
- Storage rules use literal `(default)` NOT `$(database)` in `firestore.get()` calls
- Firestore rules use `$(database)` variable
- Mixing them causes silent rule denial

**Emulator note** (from RESEARCH.md §1):
- Both Firestore and Storage emulators must run together (`firebase emulators:start`)
- Storage rules `firestore.get()` resolves against co-running Firestore emulator
- Already configured in project's `firebase.json`

---

### `shared-reveal/tests/rules/submissions.test.ts` (rules test) — NEW

**Analog:** none (new pattern; @firebase/rules-unit-testing v5 — see RESEARCH.md §2)

**Full test file structure** (from RESEARCH.md §2 Validation Architecture):

```typescript
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'

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

describe('Firestore Submission Rules (SEC-01, SEC-02, SEC-04, SUBM-05)', () => {
  beforeEach(async () => {
    // Seed test data via withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      // Pair: alice + bob
      await setDoc(doc(db, 'pairs/pair1'), {
        members: ['uid-alice', 'uid-bob'],
        createdBy: 'uid-alice',
        inviteCode: 'A1B2C3',
        inviteCodeExpiry: new Date(),
        inviteCodeUsed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      // Entry: one_submitted (alice submitted)
      await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31'), {
        pairId: 'pair1',
        date: '2026-08-31',
        status: 'one_submitted',
        submittedMembers: ['uid-alice'],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      // Alice's submission
      await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice'), {
        uid: 'uid-alice',
        photoURL: null,
        text: 'Hello, Bob',
        submittedAt: new Date(),
      })
      // Bob's submission (for later tests)
      await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31/submissions/uid-bob'), {
        uid: 'uid-bob',
        photoURL: null,
        text: 'Hello, Alice',
        submittedAt: new Date(),
      })
    })
  })

  // DENY scenarios
  it('denies partner read before reveal (SEC-01)', async () => {
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    const aliceSubRef = doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertFails(getDoc(aliceSubRef))
  })

  it('denies non-member read (SEC-04)', async () => {
    const eveDb = testEnv.authenticatedContext('uid-eve').firestore()
    const aliceSubRef = doc(eveDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertFails(getDoc(aliceSubRef))
  })

  it('denies anonymous read', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    const aliceSubRef = doc(anonDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertFails(getDoc(aliceSubRef))
  })

  it('denies client write to submission doc (SEC-02)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const aliceSubRef = doc(aliceDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertFails(setDoc(aliceSubRef, { text: 'Modified' }, { merge: true }))
  })

  it('denies client write to entry doc status (SEC-02)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const entryRef = doc(aliceDb, 'pairs/pair1/entries/2026-08-31')
    await assertFails(setDoc(entryRef, { status: 'revealed' }, { merge: true }))
  })

  it('denies client creation of entry doc', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const entryRef = doc(aliceDb, 'pairs/pair1/entries/2026-09-01')
    await assertFails(setDoc(entryRef, {
      pairId: 'pair1',
      date: '2026-09-01',
      status: 'pending',
      submittedMembers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  })

  // ALLOW scenarios
  it('allows owner read of own submission (SEC-01)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const aliceSubRef = doc(aliceDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertSucceeds(getDoc(aliceSubRef))
  })

  it('allows both members to read entry doc (metadata only)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    const entryRef = (db) => doc(db, 'pairs/pair1/entries/2026-08-31')
    await assertSucceeds(getDoc(entryRef(aliceDb)))
    await assertSucceeds(getDoc(entryRef(bobDb)))
  })

  it('allows partner read after reveal (SEC-01 post-reveal)', async () => {
    // Update status to 'revealed' via rules-disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const entryRef = doc(ctx.firestore(), 'pairs/pair1/entries/2026-08-31')
      await setDoc(entryRef, { status: 'revealed' }, { merge: true })
    })

    // Now Bob should be able to read Alice's submission
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    const aliceSubRef = doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')
    await assertSucceeds(getDoc(aliceSubRef))
  })
})

describe('Storage Submission Rules (SEC-03)', () => {
  beforeEach(async () => {
    // Seed Firestore pair + entry via rules-disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'pairs/pair1'), {
        members: ['uid-alice', 'uid-bob'],
        createdBy: 'uid-alice',
        inviteCode: 'A1B2C3',
        inviteCodeExpiry: new Date(),
        inviteCodeUsed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31'), {
        pairId: 'pair1',
        date: '2026-08-31',
        status: 'one_submitted',
        submittedMembers: ['uid-alice'],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })
  })

  // DENY scenarios
  it('denies non-member write to storage', async () => {
    const eveStorage = testEnv.authenticatedContext('uid-eve').storage()
    const photoRef = eveStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertFails(photoRef.putString('fake image data'))
  })

  it('denies write to non-owner path', async () => {
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    const alicePhotoRef = bobStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertFails(alicePhotoRef.putString('fake image data'))
  })

  it('denies partner read before reveal', async () => {
    // Upload Alice's photo via rules-disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage()
      const photoRef = storage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
      await photoRef.putString('fake image')
    })

    // Bob tries to read — should deny
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    const alicePhotoRef = bobStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertFails(alicePhotoRef.getBytes(1024))
  })

  // ALLOW scenarios
  it('allows owner write to own path', async () => {
    const aliceStorage = testEnv.authenticatedContext('uid-alice').storage()
    const photoRef = aliceStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertSucceeds(photoRef.putString('fake image data'))
  })

  it('allows owner read of own photo', async () => {
    // Upload via rules-disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage()
      const photoRef = storage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
      await photoRef.putString('fake image')
    })

    // Alice reads her own photo
    const aliceStorage = testEnv.authenticatedContext('uid-alice').storage()
    const photoRef = aliceStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertSucceeds(photoRef.getBytes(1024))
  })

  it('allows partner read after reveal', async () => {
    // Upload photo via rules-disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage()
      const photoRef = storage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
      await photoRef.putString('fake image')
    })

    // Update entry status to 'revealed'
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const entryRef = doc(ctx.firestore(), 'pairs/pair1/entries/2026-08-31')
      await setDoc(entryRef, { status: 'revealed' }, { merge: true })
    })

    // Bob now reads Alice's photo — should succeed
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    const alicePhotoRef = bobStorage.ref('pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg')
    await assertSucceeds(alicePhotoRef.getBytes(1024))
  })
})
```

**Key pattern elements:**
- `initializeTestEnvironment` with both `firestore` and `storage` blocks (Pitfall 3 from RESEARCH.md)
- `beforeEach` seed with `withSecurityRulesDisabled` (not `beforeAll` — ensure clean state)
- `afterEach` calls `testEnv.clearFirestore()` (Storage auto-clears)
- Authenticated contexts via `testEnv.authenticatedContext('uid')`
- `assertFails()` for deny tests, `assertSucceeds()` for allow tests
- State transitions tested via `withSecurityRulesDisabled(...merge: true)` updates

---

### `shared-reveal/tests/unit/submissions.test.ts` (unit test) — NEW

**Analog:** `shared-reveal/tests/unit/pair.test.ts` (lines 1-80)

**Vitest import pattern** (pair.test.ts lines 1-3):
```typescript
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
```
For submissions.test.ts:
```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
```

**Test structure** (mirrored from pair.test.ts lines 10-32):
```typescript
describe('SubmitEntrySchema', () => {
  // Zod schema must be imported from functions/src/index.ts or copied here
  // For testing purposes, inline it:
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

  // Valid inputs
  it('accepts photo + text', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: 'https://example.com/photo.jpg',
      text: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  it('accepts photo only (text null)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: 'https://example.com/photo.jpg',
      text: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts text only (photoURL null)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  // Invalid inputs
  it('rejects both null (at-least-one validation)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: null,
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.photoURL).toBeDefined()
  })

  it('rejects whitespace-only text', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('accepts entryDate in YYYY-MM-DD format', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  it('rejects entryDate in YYYYMMDD format', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '20260831',
      photoURL: null,
      text: 'Hello',
    })
    expect(result.success).toBe(false)
  })

  it('rejects text longer than 500 chars', () => {
    const longText = 'x'.repeat(501)
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: longText,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid photoURL', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: 'not-a-url',
      text: null,
    })
    expect(result.success).toBe(false)
  })

  it('accepts 500-char text exactly', () => {
    const maxText = 'x'.repeat(500)
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      photoURL: null,
      text: maxText,
    })
    expect(result.success).toBe(true)
  })
})

describe('Date computation (entryDate)', () => {
  it('toLocaleDateString("en-CA") produces YYYY-MM-DD format', () => {
    const date = new Date('2026-08-31T12:00:00')
    const formatted = date.toLocaleDateString('en-CA')
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatted).toBe('2026-08-31')
  })
})
```

**Test coverage goals** (from RESEARCH.md §Validation Architecture, unit test section):
- Zod schema validation (valid inputs, invalid inputs, edge cases)
- At-least-one validation (both null → error)
- Text length boundary (501 > max, 500 = max)
- Entry date format validation
- Photo URL validation
- Whitespace trimming in text check

---

## Shared Patterns

### onSnapshot Subscription with Cleanup
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 22-39; `shared-reveal/src/hooks/usePair.ts` lines 15-35
**Apply to:** `useEntry.ts`, `HomePage.tsx` (submission status listener)
```typescript
const unsub = onSnapshot(
  doc(db, 'pairs/pairId/entries/entryDate'),
  (snap) => {
    setData(snap.exists() ? (snap.data() as MyType) : null)
    setLoading(false)
  },
  (err) => {
    console.error('[HookName] listener error:', err)
    setLoading(false)
  },
)
return () => unsub()
```

### Async Handler with Loading + Error State
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 80-86; `shared-reveal/src/pages/PairSetupPage.tsx` lines 40-51
**Apply to:** `HomePage.tsx` `handleSubmit`
```typescript
async function handleAction() {
  setError(null)
  setLoading(true)
  try {
    await serviceCall()
    // success — clear form or update state
  } catch (err: any) {
    setError(err.message ?? 'Unexpected error')
    console.error('[ComponentName] error:', err)
  } finally {
    setLoading(false)
  }
}
```

### Firestore Transaction: Read Before Write Pattern
**Source:** `shared-reveal/functions/src/index.ts` lines 125-170 (joinPair)
**Apply to:** `submitEntry` in `functions/src/index.ts`
```typescript
await db.runTransaction(async (tx) => {
  // ALL READS FIRST
  const [snap1, snap2] = await Promise.all([
    tx.get(ref1),
    tx.get(ref2),
  ])

  // VALIDATE + THROW ERRORS
  if (!snap1.exists) throw new HttpsError('not-found', '...')

  // ALL WRITES AFTER
  tx.set(ref, { ... })
  tx.update(ref2, { ... })
})
```

### Zod 4 Schema with Validation
**Source:** `shared-reveal/functions/src/index.ts` lines 42-44 (JoinPairSchema)
**Apply to:** `SubmitEntrySchema` in `functions/src/index.ts`
```typescript
const MySchema = z.object({
  field1: z.string().regex(/^pattern$/),
  field2: z.url().nullable(),
}).superRefine((data, ctx) => {
  if (shouldFail(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Custom error',
      path: ['fieldName'],
    })
  }
})

const parsed = MySchema.safeParse(request.data)
if (!parsed.success) throw new HttpsError('invalid-argument', '...')
```

### Cloud Function v2 onCall with App Check
**Source:** `shared-reveal/functions/src/index.ts` lines 49-94 (createPair)
**Apply to:** `submitEntry` export
```typescript
const callableOptions = process.env.FUNCTIONS_EMULATOR ? {} : { enforceAppCheck: true }

export const myFunction = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
  const { field1, field2 } = request.data
  // ... logic
  return { resultField: value }
})
```

### Typed httpsCallable Wrapper
**Source:** `shared-reveal/src/services/pair.ts` lines 1-14
**Apply to:** `submissions.ts`
```typescript
interface InputType { field1: string; field2: string | null }
interface OutputType { resultField: string }

export const myFn = httpsCallable<InputType, OutputType>(functions, 'functionName')

// Usage in component:
// const result = await myFn({ field1: '...', field2: null })
// result.data.resultField
```

### Form State Management
**Source:** `shared-reveal/src/pages/PairSetupPage.tsx` lines 4-13 (local state)
**Apply to:** `HomePage.tsx` submission form
```typescript
const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
const [submissionText, setSubmissionText] = useState('')
const [submitting, setSubmitting] = useState(false)
const [error, setError] = useState<string | null>(null)
```

### Photo Input + Preview
**Pattern from CONTEXT.md §D-03 + RESEARCH.md §3**
**Apply to:** `HomePage.tsx` submission form UI
```typescript
function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setSelectedPhoto(file)
  const reader = new FileReader()
  reader.onload = (evt) => setPhotoPreview(evt.target?.result as string)
  reader.readAsDataURL(file)
}

function handleRemovePhoto() {
  setSelectedPhoto(null)
  setPhotoPreview(null)
}
```

### Character Counter in Textarea
**Pattern from CONTEXT.md specifics**
**Apply to:** `HomePage.tsx` submission form UI
```typescript
<textarea
  value={submissionText}
  onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
  className="..."
  rows={3}
/>
<p className="text-xs text-gray-500">{submissionText.length}/500</p>
```

### Inline Error Display
**Source:** `shared-reveal/src/pages/PairSetupPage.tsx` line 93; `HomePage.tsx` line 141
**Apply to:** `HomePage.tsx` submission form
```typescript
{error && (
  <p className="text-xs text-red-600">{error}</p>
)}
```

### State Machine: Conditional UI Rendering
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 113-136 (partner card conditional on docLoading/pairId)
**Apply to:** `HomePage.tsx` submission section
```typescript
{loading ? (
  <p>Loading…</p>
) : userIsInSubmittedMembers ? (
  <SubmittedState />
) : (
  <SubmitForm />
)}
```

### Firestore Security Rules: get() Cross-Collection Check
**Source:** `shared-reveal/firestore.rules` lines 9-14 (read users/{uid} as pair member)
**Apply to:** `firestore.rules` for submissions subcollection reveal access
```javascript
allow read: if request.auth != null && (
  request.auth.uid == uid  // owner
  || (
    request.auth.uid in get(...).data.members  // pair member
    && get(...parent.parent).data.status == 'revealed'  // after reveal
  )
);
```

### Storage Rules: firestore.get() Syntax in Cross-Service Rules
**Source:** RESEARCH.md §1 (Storage rules pattern)
**Critical difference:** Storage uses `(default)` literal, Firestore uses `$(database)` variable
**Apply to:** `storage.rules`
```javascript
firestore.get(/databases/(default)/documents/pairs/$(pairId)).data.members
```

### Firebase Emulator Testing Setup
**Source:** RESEARCH.md §2 (v5 API pattern)
**Apply to:** `tests/rules/submissions.test.ts`
```typescript
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
```

---

## Dependencies to Install

**In `shared-reveal/` (client):**
```bash
npm install heic2any browser-image-compression
```

**Already present:**
- `zod@4.x` (Phase 1)
- `firebase@12.18.0` (Phase 1)
- `firebase-functions@4.x` (devDependency)
- `vitest` (devDependency)
- `@firebase/rules-unit-testing@5.0.2` (devDependency)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `shared-reveal/tests/rules/submissions.test.ts` | rules test | N/A | New @firebase/rules-unit-testing v5 pattern; RESEARCH.md §2 provides complete guide |

---

## Metadata

**Analog search scope:** `shared-reveal/src/`, `shared-reveal/functions/src/`, `shared-reveal/tests/`, `shared-reveal/*.rules`
**Files scanned:** 9 source files + 2 test files + 2 rules files + context/research documents
**Pattern extraction date:** 2026-08-31
**Phase 3 files to create/modify:** 9
**Shared pattern clusters:** 12
**Total pattern assignments:** 12 (all Phase 3 files have analogs or documented patterns)

---

## Critical Implementation Sequencing

1. **Plan 03-01 (Types + Zod):** Add `EntryDoc`, `SubmissionDoc` to `src/types/index.ts`. Define `SubmitEntrySchema` in `functions/src/index.ts` — no new dependencies, no compilation blockers.

2. **Plan 03-02 (Photo Upload Pipeline):** Install `heic2any` + `browser-image-compression`. Write `uploadSubmissionPhoto` service in `src/services/submissions.ts` — pure client logic, testable with mock files.

3. **Plan 03-03 (`submitEntry` Cloud Function):** Add `submitEntry` export to `functions/src/index.ts` — depends on EntryDoc/SubmissionDoc types and SubmitEntrySchema.

4. **Plan 03-04 (Security Rules):** Update `firestore.rules` and complete `storage.rules` — independent of client/function code, can deploy in parallel with 03-03.

5. **Plan 03-05 (Submission UI + Hooks):** Add `useEntry` hook and `submitEntryFn` wrapper. Modify `HomePage.tsx` with submission form/state machine — depends on all prior plans.

6. **Plan 03-06 (Unit Tests):** Write `tests/unit/submissions.test.ts` — depends on SubmitEntrySchema (03-01).

7. **Plan 03-07 (Rules Tests):** Write `tests/rules/submissions.test.ts` — depends on final `firestore.rules` + `storage.rules` (03-04).

---

*Phase: 03-submissions-privacy-layer*
*Pattern mapping date: 2026-08-31 (structured code-level analog extraction)*
