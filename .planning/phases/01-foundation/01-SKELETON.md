# Walking Skeleton — Reveal

**Phase:** 1
**Generated:** 2026-08-30

## Capability Proven End-to-End

A first-time visitor can install Reveal as a PWA, tap "Sign in with Google," complete the redirect auth flow, land on an authenticated home screen, and — because the Auth `onCreate` Cloud Function fired — have a real `users/{uid}` document written to Firestore. Reloading with the network offline still renders a graceful "You're offline" shell instead of a blank page.

This single path exercises the full stack: Vite/React build → PWA manifest + service worker → Firebase Auth (custom authDomain redirect) → Cloud Functions (real Firestore write) → offline-capable UI.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React 19 + Vite 8 + TypeScript 5.5+ | Locked in CLAUDE.md; Vite 8 verified compatible with vite-plugin-pwa@1.3.0 peer deps (`^8.0.0`). TS 5.5 is a hard floor for Zod 4. |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | v4 CSS-first config (`@theme` in `global.css`); NO `tailwind.config.ts`, NO `@tailwindcss/postcss` (conflict). |
| Routing | react-router-dom 7.x | Data router; stable with React 19. Routes: `/` (landing/sign-in), `/home` (authenticated). |
| Auth | Firebase Auth, Google Sign-In only, `signInWithRedirect` + custom `authDomain` | Popup is blocked in iOS standalone WKWebView; redirect with a custom Hosting authDomain is the only flow that works on iOS Safari standalone (SEC-08). `getRedirectResult()` called on app load. |
| Data layer | Cloud Firestore (modular SDK v12) + `persistentLocalCache` | Offline persistence via IndexedDB. User doc created server-side by Auth `onCreate` Cloud Function to avoid the token-hydration race (never client-side). |
| Cloud Functions | Firebase Functions v2 (Node 22), `beforeUserCreated` with v1 `user().onCreate` fallback | v2 is Google's stated recommendation. Fallback documented because the v2 identity import path is [ASSUMED] in research. |
| PWA | vite-plugin-pwa `strategies: 'injectManifest'`, single `src/sw.ts` | Non-negotiable: `generateSW` + a separate FCM SW causes an infinite reload loop. One unified SW handles Workbox precache + FCM background messages + Firebase Storage exclusion. |
| SW config injection | Vite `define` build-time constants (`__FIREBASE_*__`) | `import.meta.env` is undefined in service-worker scope; config must be injected as literals at build time. |
| Testing | Vitest + RTL (unit), Playwright (E2E via `signInWithCustomToken`), Firebase Emulator | Real Google OAuth is blocked by headless detection; Playwright authenticates via Admin SDK custom token against the Auth emulator. |
| Package manager | npm | Locked in CLAUDE.md. |
| Directory layout | Feature-adjacent folders under `shared-reveal/src/*`; Functions in `shared-reveal/functions/`; E2E in `shared-reveal/tests/e2e/` | Matches the structure specified in the phase brief and ARCHITECTURE research. |
| Project root | `shared-reveal/` inside the repo | All app code, config, and Firebase project files live under this single root. |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + React + TS + Tailwind v4 + vite-plugin-pwa + Vitest/Playwright config)
- [x] Routing — real routes `/` and `/home` via react-router-dom
- [x] Database — one real read (`users/{uid}` read on home screen) AND one real write (Auth `onCreate` Cloud Function creates `users/{uid}`)
- [x] UI — real interactive element: "Sign in with Google" button wired to `signInWithRedirect`; "Sign out" button wired to `signOut`
- [x] Deployment — documented local full-stack run: `npm install` → `npm run dev` (app) + `firebase emulators:start` (Auth/Firestore/Functions); production build via `npm run build`

## Out of Scope (Deferred to Later Slices)

Explicitly NOT in the Phase 1 skeleton — do not re-litigate this minimalism in later phases:

- Pair creation, invite codes, join flow (Phase 2)
- Submission form, photo upload, HEIC handling, Storage upload rules (Phase 3)
- Reveal mechanic, auto-reveal transaction, "Reveal Anyway" (Phase 4)
- Timeline view, FCM notification *sends*, in-app badge fallback (Phase 5) — note: the FCM `onBackgroundMessage` handler *slot* is wired in Phase 1, but no notifications are sent
- Account deletion, bundle-secret audit, full security-rule test coverage (Phase 6)
- App Check (Phase 2), VAPID key generation (Phase 5)
- Any Firestore collection beyond `users/{uid}` (all other paths deny-all in Phase 1 rules)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2 — Pair Management:** two people connect via a one-time invite code; cap-of-2 enforced by `joinPair` Cloud Function transaction.
- **Phase 3 — Submissions + Privacy Layer:** each person submits photo/text; partner cannot read it — enforced at the Firestore rules layer, emulator-verified.
- **Phase 4 — Reveal Mechanic:** auto-reveal when both submit (race-safe transaction) + "Reveal Anyway" with confirm dialog + reveal metadata.
- **Phase 5 — Timeline + Notifications:** shared chronological timeline of revealed entries + FCM push for the three reveal-loop events + in-app badge fallback.
- **Phase 6 — Hardening + Production Deploy:** account deletion, bundle secrets audit, cross-platform install verification, full security-rule test coverage.
