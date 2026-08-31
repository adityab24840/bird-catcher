---
phase: "01"
plan: "02"
subsystem: auth
tags: [firebase, google-auth, signInWithRedirect, cloud-functions, firestore, pwa, ios-auth, beforeUserCreated]
status: partial — stopped at Task 5 checkpoint:human-verify

dependency_graph:
  requires:
    - phase: "01-01"
      provides: "Vite scaffold, service worker skeleton, firebase.json, firestore.rules, .env.example"
  provides:
    - shared-reveal/src/firebase/config.ts (initializeApp, auth, db with persistentLocalCache, emulator wiring)
    - shared-reveal/src/services/auth.ts (signInWithGoogle, completeRedirect, signOutUser)
    - shared-reveal/src/hooks/useAuth.ts (onAuthStateChanged + completeRedirect on mount)
    - shared-reveal/src/types/index.ts (UserDoc interface)
    - shared-reveal/src/pages/LandingPage.tsx (sign-in button)
    - shared-reveal/src/pages/HomePage.tsx (identity display + user doc read + sign-out)
    - shared-reveal/src/App.tsx (auth-gated routing)
    - shared-reveal/functions/src/index.ts (createUserDoc via beforeUserCreated v2)
  affects:
    - "01-03 (pair management — consumes auth uid, UserDoc type)"
    - "01-04 (E2E — depends on auth flow, useAuth hook)"

tech_stack:
  added:
    - "firebase-functions@7.3.2 (v2, supports firebase-admin@14)"
    - "firebase-admin@14.3.0 (in functions/)"
  patterns:
    - "SEC-08: authDomain from VITE_FIREBASE_AUTH_DOMAIN env var — never hardcoded"
    - "signInWithRedirect-only auth (no signInWithPopup) for iOS standalone compatibility"
    - "completeRedirect() called on app load in useAuth to capture post-redirect result"
    - "server-side user doc creation via beforeUserCreated Cloud Function (avoids token race)"
    - "useAuth loading gate in App.tsx prevents sign-in page flash for persisted sessions"

key_files:
  created:
    - shared-reveal/src/types/index.ts
    - shared-reveal/src/firebase/config.ts
    - shared-reveal/src/services/auth.ts
    - shared-reveal/src/hooks/useAuth.ts
    - shared-reveal/functions/src/index.ts
    - shared-reveal/functions/package.json
    - shared-reveal/functions/tsconfig.json
  modified:
    - shared-reveal/src/pages/LandingPage.tsx (was stub, now real sign-in UI)
    - shared-reveal/src/pages/HomePage.tsx (was stub, now reads user doc + sign-out)
    - shared-reveal/src/App.tsx (auth-gated routing with loading state)

key_decisions:
  - "Auth trigger variant: v2 beforeUserCreated (firebase-functions/v2/identity) — confirmed available in firebase-functions@7.3.2; resolves Open Question 2 / Assumption A4"
  - "firebase-functions upgraded from planned ^6.4.0 to ^7.3.2 — v6 peer dep requires firebase-admin@^11-13; v7 added ^14 support"
  - "Compiled functions/lib/ gitignored — not committed; only source files committed"

patterns-established:
  - "useAuth hook is the single source of truth for auth state — all route guards consume it"
  - "App-level loading gate (useAuth.loading) prevents flash-of-wrong-route"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, SEC-08]

duration: 15min
completed: "2026-08-31"
---

# Phase 01 Plan 02: Google Sign-In Vertical Slice Summary

**Firebase client config (custom authDomain, persistentLocalCache), auth service (signInWithRedirect), useAuth hook, LandingPage + HomePage routes, and Auth onCreate Cloud Function (beforeUserCreated v2) — pending Task 5 human verification on real device.**

## Performance

- **Duration:** ~15 min (Tasks 2-4; Task 1 was human-action gate)
- **Started:** 2026-08-31
- **Completed:** 2026-08-31 (Tasks 2-4; Task 5 pending human verify)
- **Tasks:** 3 of 5 auto tasks complete (stopped at Task 5 checkpoint:human-verify)
- **Files modified:** 10

## Accomplishments

- Firebase client config with SEC-08 compliant authDomain (custom domain, not default subdomain)
- Google Sign-In via `signInWithRedirect` only — popup-free, iOS standalone safe
- `useAuth` hook with `completeRedirect()` on mount + `onAuthStateChanged` subscription
- Auth-gated routing in App.tsx with loading spinner to prevent flash
- Auth onCreate Cloud Function (`createUserDoc` via `beforeUserCreated` v2) creates `users/{uid}` server-side
- `npm run build` exits 0; TypeScript type-checks pass; bundle + `sw.js` emitted

## Task Commits

1. **Task 1: Firebase project setup** — Human action (no commit — gate cleared by user)
2. **Task 2: Firebase config, auth service, useAuth hook, types** — `26436bd` (feat)
3. **Task 3: Auth onCreate Cloud Function** — `1f850e7` (feat)
4. **Task 4: LandingPage, HomePage, App routing** — `72f0b34` (feat)
5. **Task 5: End-to-end verification** — PENDING (checkpoint:human-verify)

## Files Created/Modified

- `shared-reveal/src/types/index.ts` — UserDoc interface (Firestore Timestamp types)
- `shared-reveal/src/firebase/config.ts` — initializeApp, auth, db (persistentLocalCache), emulator wiring
- `shared-reveal/src/services/auth.ts` — signInWithGoogle, completeRedirect, signOutUser
- `shared-reveal/src/hooks/useAuth.ts` — onAuthStateChanged + completeRedirect on mount, loading flag
- `shared-reveal/src/pages/LandingPage.tsx` — "Sign in with Google" button (replaced stub)
- `shared-reveal/src/pages/HomePage.tsx` — identity display + users/{uid} read + sign-out (replaced stub)
- `shared-reveal/src/App.tsx` — auth-gated routing with loading state (replaced skeleton)
- `shared-reveal/functions/src/index.ts` — createUserDoc via beforeUserCreated v2
- `shared-reveal/functions/package.json` — firebase-functions@7.3.2, firebase-admin@14.3.0
- `shared-reveal/functions/tsconfig.json` — commonjs/ES2022/strict

## Decisions Made

**Auth trigger variant (Open Question 2 resolved):** Used `beforeUserCreated` from `firebase-functions/v2/identity`. This is confirmed available in `firebase-functions@7.3.2`. The v2 identity module is exported at `firebase-functions/v2/identity` and `firebase-functions/identity` in the package's exports map.

**firebase-functions version (auto-fix, Rule 3):** Upgraded from planned `^6.4.0` to `^7.3.2`. The `v6` series has a peer dependency on `firebase-admin@^11-13`, which conflicts with `firebase-admin@14.3.0` used across the project. `v7.3.2` added `firebase-admin@^14.0.0` to its peer dep range.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] firebase-functions upgraded from ^6.4.0 to ^7.3.2**
- **Found during:** Task 3 (functions npm install)
- **Issue:** `firebase-functions@6.6.0` peer dep: `firebase-admin@^11-13`; project uses `firebase-admin@14.3.0` — ERESOLVE
- **Fix:** Updated `functions/package.json` to use `firebase-functions@^7.3.2` which accepts `firebase-admin@^14`
- **Files modified:** shared-reveal/functions/package.json
- **Verification:** `npm install` exits 0; `npm run build` exits 0; `functions/lib/index.js` produced
- **Committed in:** `1f850e7`

---

**Total deviations:** 1 auto-fixed (1 blocking — version incompatibility)
**Impact on plan:** Minor version bump within the same major firebase-functions series; no API changes affect the functions code; beforeUserCreated is available in both v6 and v7.

## Issues Encountered

None beyond the auto-fixed version incompatibility.

## Checkpoint: Task 5 — Human Verification Required

**What to verify:**

**Option A (against the real project):**
1. With `shared-reveal/.env.local` populated, run `npm run dev` inside `shared-reveal/`
2. Open desktop Chrome, navigate to `http://localhost:5173`
3. Click "Sign in with Google", complete the Google OAuth flow
4. Confirm you land on `/home` showing your name, email, and a loaded user doc with `pairId: null`
5. In Firebase Console → Firestore, confirm `users/{your-uid}` doc exists with correct shape
6. Click "Sign out" → returns to `/` landing page
7. Refresh while signed in → stays on `/home` (AUTH-03 persistence check)

**Option B (against emulators):**
1. Run `firebase emulators:start --only auth,firestore,functions` in `shared-reveal/`
2. Run `npm run dev` in `shared-reveal/`
3. Navigate to the emulator UI and verify the same flow with emulator sign-in

**REQUIRED — iOS Safari standalone (AUTH-01 / SEC-08 not done without this):**
- On a real iPhone (not Simulator), open the app URL in Safari
- Tap Share → Add to Home Screen
- Launch from Home Screen icon
- Tap "Sign in with Google"
- Confirm sign-in completes and returns to `/home` WITHOUT opening a bare Safari tab
- This verifies the custom `authDomain` (birds-eye-c09ff.web.app) fix works in iOS standalone

**Resume signal:** Type "approved" if all five checks pass, or describe what failed.

## Known Stubs

None — all stubs from plan 01-01 were resolved in this plan. LandingPage and HomePage are no longer stubs.

## Threat Surface Scan

All surfaces are within the plan's threat model:
- OAuth redirect via custom authDomain (T-01-03: mitigated by authDomain config + OAuth allowlist)
- Client reads users/{uid} in HomePage (T-01-04: mitigated by firestore.rules pairId write block)
- createUserDoc writes users/{uid} via Admin SDK (T-01-05: server-side only, no client race)
- Admin SDK confined to functions/ — no compat imports in src/ (T-01-06: enforced by code structure)

No new surfaces beyond the plan's threat model.

## Self-Check

- shared-reveal/src/firebase/config.ts: FOUND
- shared-reveal/src/services/auth.ts: FOUND
- shared-reveal/src/hooks/useAuth.ts: FOUND
- shared-reveal/src/types/index.ts: FOUND
- shared-reveal/src/pages/LandingPage.tsx: FOUND (real, not stub)
- shared-reveal/src/pages/HomePage.tsx: FOUND (real, not stub)
- shared-reveal/src/App.tsx: FOUND (auth-gated)
- shared-reveal/functions/src/index.ts: FOUND
- Commit 26436bd: Task 2
- Commit 1f850e7: Task 3
- Commit 72f0b34: Task 4

## Self-Check: PASSED

---
*Phase: 01-foundation*
*Completed: 2026-08-31 (Tasks 2-4; Task 5 awaiting human verification)*
