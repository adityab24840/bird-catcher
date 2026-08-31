---
phase: 02-pair-management
plan: 00
status: complete
completed: 2026-08-31
---

# Plan 02-00 Summary — Test Scaffolding

## Outcome

All three tasks complete. Test harness in place for Wave 1 implementation.

## What Was Done

**Task 1 — Auth fixture + auth.spec.ts**
- Renamed `TEST_UID` → `TEST_UID_01`; added `TEST_UID_02`
- Added optional `uid` param to `signInAsTestUser` (defaults to `TEST_UID_01`)
- Added `secondAuthenticatedPage` fixture using `browser.newPage()` (isolated context)
- Changed `waitForURL` from `'**/home'` to `/\/(pair-setup|home)/` regex
- Updated `auth.spec.ts`: forward-compatible URL assertion; removed `getByText('Bird Eye')` assertion
- **Fixed**: `page.evaluate` was using `import('firebase/app')` (bare specifier — fails in browsers without importmap). Solution: added `window.__testSignIn(token)` hook in `src/main.tsx` (dev-only) that uses the already-emulator-connected `auth` instance. Fixture now calls `window.__testSignIn` directly.

**Task 2 — Unit test stubs**
- Created `tests/unit/pair.test.ts` (first unit test file in codebase)
- 3 concrete passing tests: invite code hex format, JoinPairSchema accept, JoinPairSchema reject × 2
- 8 `it.todo()` stubs covering PAIR-01 through PAIR-06 and SEC-05

**Task 3 — E2E stubs**
- Created `tests/e2e/pair.spec.ts`
- 3 `test.fail()` stubs: create-pair, join-pair two-user happy path, third-user rejection
- Uses `secondAuthenticatedPage` fixture in 2 tests

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run tests/unit/pair.test.ts` | ✓ 4 passed, 8 todo |
| `npm run test:e2e -- tests/e2e/auth.spec.ts` | ✓ 1 passed |
| `npm run test:e2e -- tests/e2e/pair.spec.ts` | ✓ 3 passed (test.fail stubs fail as expected) |
| `npx tsc --noEmit` | ✓ exit 0 |

## Side Effects

- `src/main.tsx` — added `window.__testSignIn` dev-only hook (required for fixture sign-in to work)
- `tests/unit/` directory created

## Next Plan

02-01 — Wave 1 implementation (Cloud Functions: `createPair`, `joinPair`; Firestore rules; types)
