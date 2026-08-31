---
phase: 02-pair-management
plan: 02
status: complete
completed: 2026-08-31
---

# Plan 02-02 Summary — Client Layer (App Check, Services, usePairId Hook)

## Outcome

Client wired to Cloud Functions. App Check initialized. usePairId hook ready for App.tsx route guard.

## What Was Done

**Task 1 — App Check + functions in firebase/config.ts**
- Added `getFunctions`, `connectFunctionsEmulator` imports
- Added `initializeAppCheck`, `ReCaptchaV3Provider` imports
- Initialized App Check with debug token guard (must run before any httpsCallable call)
- Exported `functions` from `getFunctions(app)`
- Extended emulator guard block with `connectFunctionsEmulator(functions, '127.0.0.1', 5001)`
- Added `VITE_APP_CHECK_DEBUG_TOKEN=true` and `VITE_RECAPTCHA_SITE_KEY=placeholder` to `.env.local`
- Documented both vars in `.env.example` with usage instructions

**Task 2 — services/pair.ts + hooks/usePair.ts**
- Created `src/services/pair.ts`: `createPairFn` and `joinPairFn` typed httpsCallable wrappers
- Created `src/hooks/usePair.ts`: `usePairId(uid)` onSnapshot hook returning `{ pairId, pairLoading }`
  - Null uid guard: clears state immediately
  - Cleanup: `return () => unsub()` prevents listener leak on unmount
  - Dependency array: `[uid]` — resubscribes if user changes

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ exit 0 |
| `export const functions` in config.ts | ✓ line 57 |
| `initializeAppCheck` in config.ts | ✓ line 52 |
| `connectFunctionsEmulator` inside emulator guard | ✓ line 69 |
| `VITE_APP_CHECK_DEBUG_TOKEN` in .env.local | ✓ 1 occurrence |
| No `connectFunctionsEmulator` in pair.ts | ✓ 0 occurrences |
| `return () => unsub()` in usePair.ts | ✓ line 35 |

## Next Plan

02-03 — Wave 3: PairSetupPage UI, App.tsx three-tier route guard, HomePage partner display
