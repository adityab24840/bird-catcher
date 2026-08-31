# Phase 2: Pair Management - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 10
**Analogs found:** 8 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `shared-reveal/src/pages/PairSetupPage.tsx` | page | request-response + event-driven | `shared-reveal/src/pages/HomePage.tsx` | role-match |
| `shared-reveal/src/pages/HomePage.tsx` | page | event-driven | itself | self-extend |
| `shared-reveal/src/App.tsx` | router | request-response | itself | self-extend |
| `shared-reveal/src/hooks/usePair.ts` | hook | event-driven | `shared-reveal/src/hooks/useAuth.ts` | role-match |
| `shared-reveal/src/services/pair.ts` | service | request-response | `shared-reveal/src/services/auth.ts` | role-match |
| `shared-reveal/src/types/index.ts` | types | N/A | itself | self-extend |
| `shared-reveal/functions/src/index.ts` | Cloud Function | request-response | itself (v2 pattern in RESEARCH.md) | partial |
| `shared-reveal/firestore.rules` | config/rules | N/A | itself | self-extend |
| `shared-reveal/tests/unit/pair.test.ts` | test | N/A | none | no analog |
| `shared-reveal/tests/e2e/pair.spec.ts` | E2E test | event-driven | `shared-reveal/tests/e2e/auth.spec.ts` | role-match |

---

## Pattern Assignments

### `shared-reveal/src/pages/PairSetupPage.tsx` (page, request-response + event-driven)

**Analog:** `shared-reveal/src/pages/HomePage.tsx`

**Imports pattern** (lines 1-16 of HomePage.tsx):
```tsx
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
```
For PairSetupPage, add:
```tsx
import { usePairId } from '../hooks/usePair'
import { createPairFn, joinPairFn } from '../services/pair'
```

**Card container pattern** (lines 51-53 of HomePage.tsx):
```tsx
<div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
  <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
    {/* content */}
  </div>
</div>
```

**App mark pattern** (lines 54-57 of HomePage.tsx):
```tsx
<div className="mb-6 flex justify-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow">
    R
  </div>
</div>
```

**Async handler with error pattern** (lines 42-48 of HomePage.tsx):
```tsx
async function handleSignOut() {
  try {
    await signOutUser()
  } catch (err) {
    console.error('[HomePage] signOut error:', err)
  }
}
```
Replicate for `handleCreate` and `handleJoin` — store error in `useState<string | null>(null)` and render inline below the input/button.

**Primary button style** (from `LandingPage.tsx` lines 36-40):
```tsx
className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
```
For the equal-weight CTAs (D-02), use two side-by-side buttons; the "Create" CTA gets a filled purple variant:
```tsx
className="w-full rounded-xl bg-purple-500 py-3 text-sm font-medium text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
```

**onSnapshot waiting-state redirect pattern** — mirrors HomePage.tsx lines 22-39. PairSetupPage subscribes to `users/{uid}` via `usePairId` (which uses onSnapshot); App.tsx's route guard handles the redirect automatically when `pairId` becomes non-null. No manual `navigate()` is needed inside PairSetupPage.

**Auto-submit on 6th character** (D-04):
```tsx
function handleCodeInput(e: React.ChangeEvent<HTMLInputElement>) {
  const val = e.target.value.toUpperCase().slice(0, 6)
  setJoinCode(val)
  if (val.length === 6) {
    void handleJoin(val)
  }
}
```

**Inline error display pattern:**
```tsx
{error && (
  <p className="mt-2 text-sm text-red-600">{error}</p>
)}
```

---

### `shared-reveal/src/pages/HomePage.tsx` (page, event-driven) — MODIFY

**Analog:** itself (`shared-reveal/src/pages/HomePage.tsx`)

**Existing onSnapshot pattern** (lines 22-39) — keep as-is; it already subscribes to `users/{uid}` and exposes `userDoc`.

**Partner info section to add** (after the existing Firestore user doc status block, lines 76-90): fetch partner's `users/{partnerId}` using a one-time `getDoc` or a second `onSnapshot`. Pattern:
```tsx
// Add to existing useEffect or a new useEffect after pairId is known
useEffect(() => {
  if (!userDoc?.pairId) return
  // fetch partner: find the other member in pairs/{pairId}.members
  // or read users/{partnerId} directly once pairId is known
  const pairRef = doc(db, 'pairs', userDoc.pairId)
  const unsub = onSnapshot(pairRef, (snap) => {
    if (!snap.exists()) return
    const members: string[] = snap.data().members
    const partnerId = members.find((m) => m !== user?.uid) ?? null
    setPartnerId(partnerId)
  })
  return () => unsub()
}, [userDoc?.pairId, user?.uid])
```
Then fetch partner's UserDoc from `users/{partnerId}` using the same `onSnapshot` pattern (lines 26-39 of HomePage.tsx).

**Section to replace** (lines 75-90 — the "Firestore user doc status" debug block): replace with the partner identity card (D-05) once pairId is non-null:
```tsx
{userDoc?.pairId && partnerDoc ? (
  <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-center">
    {partnerDoc.photoURL && (
      <img src={partnerDoc.photoURL} className="mx-auto mb-2 h-12 w-12 rounded-full" alt="Partner" />
    )}
    <p className="font-medium text-gray-900">{partnerDoc.displayName ?? '—'}</p>
    <p className="mt-1 text-gray-500 text-xs">You're connected</p>
  </div>
) : (
  // existing debug block or loading state
)}
```

---

### `shared-reveal/src/App.tsx` (router, request-response) — MODIFY

**Analog:** itself (`shared-reveal/src/App.tsx`)

**Existing two-tier guard pattern** (lines 20-31):
```tsx
const { user, loading } = useAuth()

if (loading) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  )
}
```

**Extend to three-tier guard** — add `usePairId` import and call after `useAuth`:
```tsx
import { usePairId } from './hooks/usePair'
import PairSetupPage from './pages/PairSetupPage'

const { user, loading } = useAuth()
const { pairId, pairLoading } = usePairId(user?.uid ?? null)

if (loading || (user && pairLoading)) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  )
}
```

**Updated route table** — extend the existing Routes block (lines 37-49):
```tsx
<Routes>
  {/* / — signed out → Landing; signed in + no pair → /pair-setup; signed in + paired → /home */}
  <Route
    path="/"
    element={
      !user ? <LandingPage /> :
      pairId === null ? <Navigate to="/pair-setup" replace /> :
      <Navigate to="/home" replace />
    }
  />

  {/* /pair-setup — unpaired authenticated users only */}
  <Route
    path="/pair-setup"
    element={
      !user ? <Navigate to="/" replace /> :
      pairId !== null ? <Navigate to="/home" replace /> :
      <PairSetupPage />
    }
  />

  {/* /home — paired authenticated users only */}
  <Route
    path="/home"
    element={user ? <HomePage /> : <Navigate to="/" replace />}
  />
</Routes>
```

---

### `shared-reveal/src/hooks/usePair.ts` (hook, event-driven) — NEW

**Analog:** `shared-reveal/src/hooks/useAuth.ts`

**Imports pattern** (lines 14-18 of useAuth.ts):
```typescript
import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, db } from '../firebase/config'
```
For usePair.ts:
```typescript
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
```

**Interface + state pattern** (lines 20-23 of useAuth.ts):
```typescript
interface AuthState {
  user: User | null
  loading: boolean
}
```
For usePair.ts:
```typescript
interface PairState {
  pairId: string | null
  pairLoading: boolean
}
```

**useState + useEffect + subscription + cleanup pattern** (lines 40-71 of useAuth.ts):
```typescript
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // ...
  useEffect(() => {
    // ...
    unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return () => { unsubscribe?.() }
  }, [])
  return { user, loading }
}
```
For usePair.ts — adapt with `onSnapshot` on `users/{uid}` (pattern from HomePage.tsx lines 26-39):
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

---

### `shared-reveal/src/services/pair.ts` (service, request-response) — NEW

**Analog:** `shared-reveal/src/services/auth.ts`

**Imports and pattern structure** (lines 1-12 of auth.ts):
```typescript
import {
  GoogleAuthProvider,
  signInWithRedirect,
  // ...
} from 'firebase/auth'
import { auth } from '../firebase/config'
```
For pair.ts — typed callable wrappers:
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase/config'

const functions = getFunctions(app)
```

**Typed function export pattern** (auth.ts exports typed async functions):
```typescript
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  if (USE_POPUP) {
    await signInWithPopup(auth, provider)
  } else {
    await signInWithRedirect(auth, provider)
  }
}
```
For pair.ts — use `httpsCallable` with typed generics:
```typescript
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

**Emulator wiring** — `auth.ts` reads `VITE_FIREBASE_AUTH_EMULATOR_HOST` (line 22); pair.ts should similarly connect the Functions emulator when the env var is set:
```typescript
import { connectFunctionsEmulator } from 'firebase/functions'

if (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
```

---

### `shared-reveal/src/types/index.ts` (types) — MODIFY

**Analog:** itself (`shared-reveal/src/types/index.ts`)

**Existing interface pattern** (lines 1-16):
```typescript
import type { Timestamp } from 'firebase/firestore'

export interface UserDoc {
  displayName: string | null
  email: string | null
  photoURL: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  pairId: string | null
}
```

**New interface to append** — follow exact same structure (no class, export interface, import from firebase/firestore):
```typescript
export interface PairDoc {
  createdBy: string           // UID of pair creator
  members: string[]           // [creatorUid] until join; [creatorUid, joinerUid] after
  inviteCode: string          // 6-char uppercase hex, e.g. "A1B2C3"
  inviteCodeExpiry: Timestamp // PAIR-02: 24 hours from creation
  inviteCodeUsed: boolean     // PAIR-05: true after successful join
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

### `shared-reveal/functions/src/index.ts` (Cloud Function, request-response) — MODIFY

**Analog:** itself (`shared-reveal/functions/src/index.ts`) for Admin SDK/Firestore patterns; RESEARCH.md Pattern 1 & 2 for v2 onCall pattern.

**Existing imports pattern** (lines 1-3 of index.ts):
```typescript
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { user } from 'firebase-functions/v1/auth'
```
Add for new v2 functions:
```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
```

**Admin SDK init pattern** (lines 6-10 of index.ts) — keep unchanged:
```typescript
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
}
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'birds-eye-c09ff' })
```

**Error + try/catch pattern** (lines 21-37 of index.ts):
```typescript
try {
  const db = getFirestore()
  await db.doc(`users/${userRecord.uid}`).set({ ... })
  console.log('[createUserDoc] wrote users/' + userRecord.uid)
} catch (err) {
  console.error('[createUserDoc] FAILED:', err)
  throw err
}
```
For v2 onCall: throw `HttpsError` for business logic errors (not generic Error); re-throw or let the SDK handle unexpected errors:
```typescript
if (!request.auth) {
  throw new HttpsError('unauthenticated', 'Must be signed in')
}
```

**v2 onCall export signature** (from RESEARCH.md Pattern 1, verified against `firebase-functions/v2/providers/https.d.ts`):
```typescript
export const createPair = onCall(
  { enforceAppCheck: true },
  async (request) => {
    // request.auth, request.data
  }
)

export const joinPair = onCall(
  { enforceAppCheck: true },
  async (request) => {
    // Zod parse → Firestore query (outside tx) → runTransaction
  }
)
```

**Firestore transaction pattern** — reads before writes, Admin SDK constraint (RESEARCH.md Pitfall 2):
```typescript
await db.runTransaction(async (tx) => {
  // ALL READS FIRST
  const [pairSnap, joinerSnap] = await Promise.all([
    tx.get(pairRef),
    tx.get(joinerRef),
  ])
  // VALIDATE
  // ALL WRITES AFTER
  tx.update(pairRef, { ... })
  tx.update(joinerRef, { ... })
})
```

**Zod 4 validation pattern** (from RESEARCH.md Pattern 2):
```typescript
const JoinPairSchema = z.object({
  inviteCode: z.string().length(6).regex(/^[A-F0-9]{6}$/),
})
const parsed = JoinPairSchema.safeParse(request.data)
if (!parsed.success) {
  throw new HttpsError('invalid-argument', 'Invalid invite code format')
}
```

---

### `shared-reveal/firestore.rules` (config/rules) — MODIFY

**Analog:** itself (`shared-reveal/firestore.rules`)

**Existing rule structure** (full file, lines 1-29):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null
        && request.auth.uid == uid
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairId']);
      allow delete: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Changes to users/{uid} read rule** — extend to also allow pair-member reads (D-05 partner display):
```
allow read: if request.auth != null && (
  request.auth.uid == uid
  ||
  (
    resource.data.pairId != null
    && request.auth.uid in
       get(/databases/$(database)/documents/pairs/$(resource.data.pairId)).data.members
  )
);
```

**New pairs/{pairId} block to insert** before the catch-all deny:
```
match /pairs/{pairId} {
  // Members can read their own pair document.
  allow read: if request.auth != null
    && request.auth.uid in resource.data.members;

  // All writes go through Cloud Functions only.
  allow write: if false;
}
```

---

### `shared-reveal/tests/e2e/pair.spec.ts` (E2E test, event-driven) — NEW

**Analog:** `shared-reveal/tests/e2e/auth.spec.ts` + `shared-reveal/tests/e2e/fixtures/auth.ts`

**Import pattern** (line 1 of auth.spec.ts):
```typescript
import { test, expect } from './fixtures/auth'
```

**Fixture extension needed** — auth.ts defines a single `TEST_UID = 'e2e-test-user-01'`. For pair.spec.ts, two users are required. Extend the fixture to expose a second authenticated page:
```typescript
// In tests/e2e/fixtures/auth.ts — add TEST_UID_02
const TEST_UID_02 = 'e2e-test-user-02'

// Add second fixture
export const test = base.extend<{
  authenticatedPage: Page
  secondAuthenticatedPage: Page
}>({
  authenticatedPage: async ({ page }, use) => { ... },
  secondAuthenticatedPage: async ({ browser }, use) => {
    const page = await browser.newPage()
    await signInAsTestUser(page, TEST_UID_02)
    await use(page)
    await page.close()
  },
})
```

**Test structure pattern** (auth.spec.ts lines 1-6):
```typescript
test('description of behavior', async ({ authenticatedPage: page }) => {
  await expect(page).toHaveURL(/\/expected-path/)
  await expect(page.getByText('Expected Text')).toBeVisible()
})
```
For pair.spec.ts tests:
```typescript
test('User A creates pair and receives invite code', async ({ authenticatedPage: page }) => {
  await page.waitForURL('**/pair-setup')
  await page.getByRole('button', { name: /create a pair/i }).click()
  await expect(page.getByText(/[A-F0-9]{6}/)).toBeVisible()
})

test('User B joins with code and both redirect to /home', async ({
  authenticatedPage: pageA,
  secondAuthenticatedPage: pageB,
}) => {
  // pageA: create pair → get code
  // pageB: enter code → auto-submit
  // Both: assert /home
})
```

**waitForURL pattern** (auth.ts line 46):
```typescript
await page.waitForURL('**/home', { timeout: 10_000 })
```

---

### `shared-reveal/tests/unit/pair.test.ts` (unit test) — NEW

**No analog found** — no unit tests exist in this codebase yet. Use Vitest patterns from RESEARCH.md.

**Vitest import pattern:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
```

**Test structure for Cloud Function logic** — test the pure validation logic (Zod schema, invite code generation, expiry calculation) without Firebase emulator:
```typescript
describe('invite code generation', () => {
  it('produces a 6-character uppercase hex string', () => {
    // import { generateInviteCode } if extracted as a pure function
    const code = randomBytes(3).toString('hex').toUpperCase()
    expect(code).toMatch(/^[A-F0-9]{6}$/)
  })
})

describe('JoinPairSchema', () => {
  it('accepts valid 6-char hex codes', () => {
    const result = JoinPairSchema.safeParse({ inviteCode: 'A1B2C3' })
    expect(result.success).toBe(true)
  })
  it('rejects codes shorter than 6 characters', () => {
    const result = JoinPairSchema.safeParse({ inviteCode: 'ABC' })
    expect(result.success).toBe(false)
  })
})
```

---

## Shared Patterns

### onSnapshot Subscription with Cleanup
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 22-39
**Apply to:** `usePair.ts`, `HomePage.tsx` (partner fetch), `PairSetupPage.tsx` (if subscribing to pair doc)
```tsx
const unsub = onSnapshot(
  doc(db, 'collection', id),
  (snap) => {
    setData(snap.exists() ? (snap.data() as MyType) : null)
    setLoading(false)
  },
  (err) => {
    console.error('[ComponentName] listener error:', err)
    setLoading(false)
  },
)
return () => unsub()
```

### Async Handler Error Containment
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 42-48; `shared-reveal/src/pages/LandingPage.tsx` lines 12-18
**Apply to:** `PairSetupPage.tsx` handleCreate, handleJoin
```tsx
async function handleAction() {
  try {
    await serviceCall()
  } catch (err) {
    console.error('[ComponentName] action error:', err)
    // for user-facing errors: setError(err.message ?? 'Unexpected error')
  }
}
```

### Card Container UI
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 51-53
**Apply to:** `PairSetupPage.tsx`
```tsx
<div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
  <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
```

### Purple App Mark
**Source:** `shared-reveal/src/pages/HomePage.tsx` lines 54-57
**Apply to:** `PairSetupPage.tsx`
```tsx
<div className="mb-6 flex justify-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow">
    R
  </div>
</div>
```

### Firebase Auth Route Guard (Loading State)
**Source:** `shared-reveal/src/App.tsx` lines 25-31
**Apply to:** `App.tsx` (extend for pair loading tier)
```tsx
if (loading) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  )
}
```

### Admin SDK Firestore Error Pattern
**Source:** `shared-reveal/functions/src/index.ts` lines 22-36
**Apply to:** `createPair`, `joinPair` functions
```typescript
try {
  // operation
  console.log('[functionName] success log')
} catch (err) {
  console.error('[functionName] FAILED:', err)
  throw err
}
```
For business errors, throw `HttpsError` before the try/catch.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `shared-reveal/tests/unit/pair.test.ts` | unit test | N/A | No unit tests exist in this codebase yet; use Vitest patterns from RESEARCH.md |

---

## Metadata

**Analog search scope:** `shared-reveal/src/`, `shared-reveal/functions/src/`, `shared-reveal/tests/`, `shared-reveal/firestore.rules`
**Files scanned:** 13 source files + 2 test files + 1 rules file
**Pattern extraction date:** 2026-08-31
