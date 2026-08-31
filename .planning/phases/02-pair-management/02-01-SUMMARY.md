---
phase: 02-pair-management
plan: 01
status: complete
completed: 2026-08-31
---

# Plan 02-01 Summary — Server Layer (Cloud Functions + Firestore Rules)

## Outcome

createPair and joinPair Cloud Functions implemented. Firestore rules extended. All unit tests pass.

## What Was Done

**Task 1 — PairDoc type + createPair**
- Added `PairDoc` interface to `src/types/index.ts` (7 fields: createdBy, members, inviteCode, inviteCodeExpiry, inviteCodeUsed, createdAt, updatedAt)
- Added `zod@^4.5.4` to `functions/package.json` (was missing — research said "pre-existing" but not in functions manifest)
- Defined `JoinPairSchema` at module scope (shared between createPair validation + joinPair input)
- Implemented `createPair` v2 onCall with `enforceAppCheck: true`; uses Firestore transaction to guard PAIR-06; does NOT set users/{uid}.pairId (D-03 requirement)

**Task 2 — joinPair + Firestore rules**
- Implemented `joinPair` v2 onCall with `enforceAppCheck: true`; inviteCode query outside transaction; all 5 SEC-05 checks inside `db.runTransaction()` with reads-before-writes
- Sets both users' pairId atomically in one transaction (D-01 + D-03 onSnapshot triggers)
- Updated `firestore.rules`:  users/{uid} read rule extended with pair-member read via `get()` (D-05); new `match /pairs/{pairId}` block (read for members, `allow write: if false`)
- Converted all SEC-05 `it.todo()` stubs and PAIR-06 createPair stub to concrete `it()` tests (pure boolean condition checks, no Firestore calls)

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run tests/unit/pair.test.ts` | ✓ 12 passed |
| `cd functions && npx tsc --noEmit` | ✓ exit 0 |
| `cd shared-reveal && npx tsc --noEmit` | ✓ exit 0 |

## Acceptance Criteria Met

- `export const createPair = onCall` ✓
- `export const joinPair = onCall` ✓
- `enforceAppCheck: true` on both ✓
- createPair has no `tx.update(userRef` (pairId not set in creator's doc) ✓
- joinPair: inviteCode query outside transaction ✓
- joinPair: `Promise.all([tx.get(pairRef), tx.get(joinerRef)])` reads-before-writes ✓
- joinPair: all 5 SEC-05 checks present ✓
- joinPair: writes pairId to both joinerRef AND creatorRef ✓
- `firestore.rules` contains `match /pairs/{pairId}` ✓
- `firestore.rules` users/{uid} read contains `get(/databases` ✓
- `firestore.rules` pairs block has `allow write: if false` ✓

## Next Plan

02-02 — Wave 3: PairSetupPage UI, App.tsx three-tier route guard, usePairId hook, App Check client init
