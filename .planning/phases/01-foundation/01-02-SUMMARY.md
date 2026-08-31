---
phase: "01"
plan: "02"
subsystem: auth
tags: [firebase, google-auth, signInWithRedirect, cloud-functions, firestore, pwa, ios-auth]
status: partial — blocked on human-action checkpoint (Task 1)

dependency_graph:
  requires:
    - phase: "01-01"
      provides: "Vite scaffold, service worker skeleton, firebase.json, firestore.rules, .env.example"
  provides: []
  affects:
    - "01-03 (pair management — needs auth uid)"
    - "01-04 (E2E — needs auth flow)"

tech_stack:
  added: []
  patterns: []

key_files:
  created: []
  modified: []

key_decisions: []

requirements-completed: []

duration: 0min
completed: ""
---

# Phase 01 Plan 02: Google Sign-In Vertical Slice — PARTIAL (Blocked at Task 1)

**No code written yet — blocked on Task 1 human-action gate: Firebase project, Google Sign-In provider, and custom authDomain must be configured by the user in the Firebase Console before implementation can proceed.**

## Performance

- **Duration:** < 1 min (stopped at first task)
- **Started:** 2026-08-31
- **Completed:** N/A — pending human action
- **Tasks:** 0 of 5 (stopped at human-action checkpoint before Task 2)
- **Files modified:** 0

## Accomplishments

None — blocked before implementation began.

## Task Commits

No code commits. This SUMMARY.md is the only commit in this partial execution.

## Files Created/Modified

None.

## Decisions Made

None yet — deferred until human-action gate clears and implementation proceeds.

## Checkpoint Reached

**Task 1** is a `checkpoint:human-action` gate that requires the Firebase Console setup to be completed before any code in Tasks 2-4 can be meaningfully tested. The code itself (firebase/config.ts, auth service, useAuth hook, Cloud Function) can be authored without live credentials, but the plan structure gates on this task completing first.

**Required human steps:**
1. Create (or select) Firebase project in the Firebase Console — note the Project ID.
2. Enable Authentication > Sign-in method > Google.
3. Activate Firebase Hosting — note the custom domain (NOT `*.firebaseapp.com` — required for iOS standalone auth, SEC-08).
4. In Google Cloud Console > Credentials > OAuth 2.0 Client > add `https://<custom-authDomain>/__/auth/handler` to Authorized redirect URIs.
5. Copy Web app config values into `shared-reveal/.env.local`:
   - VITE_FIREBASE_API_KEY
   - VITE_FIREBASE_AUTH_DOMAIN (set to the custom Hosting domain — critical for iOS)
   - VITE_FIREBASE_PROJECT_ID
   - VITE_FIREBASE_STORAGE_BUCKET
   - VITE_FIREBASE_MESSAGING_SENDER_ID
   - VITE_FIREBASE_APP_ID
   - VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   - VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
6. Update `shared-reveal/.firebaserc` `default` to the real Project ID.

**Resume signal:** Once `.env.local` is populated and the OAuth redirect URI is added, type "done" to resume.

## Deviations from Plan

None — stopped at first task before any code was written.

## Issues Encountered

None.

## User Setup Required

See plan frontmatter `user_setup` section and Task 1 `how-to-verify` for the complete Firebase Console setup checklist. All six `VITE_FIREBASE_*` env vars and the OAuth redirect URI registration are required before the implementation tasks can be tested.

## Next Phase Readiness

Not ready — pending Task 1 human-action completion. After `.env.local` is populated, a continuation agent should:
- Resume from Task 2: Firebase client config, auth service, useAuth hook, types
- Then Task 3: Auth onCreate Cloud Function
- Then Task 4: LandingPage, HomePage, route wiring
- Then Task 5: human-verify end-to-end sign-in

---
*Phase: 01-foundation*
*Status: partial — awaiting human-action gate*
