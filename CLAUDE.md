<!-- GSD:project-start source:PROJECT.md -->
## Project

**Reveal**

Reveal is a private PWA for exactly two people. Each person independently submits something — a photo, text, or both — that reminded them of the other person that day. Their submission stays private until both have submitted (auto-reveal) or one person triggers "Reveal Anyway." Revealed entries form a permanent shared timeline they can browse together.

**Core Value:** Submission privacy enforced at the database layer — neither person can read the other's entry until the reveal condition is satisfied, regardless of frontend state.

### Constraints

- **Tech Stack**: React + TypeScript + Vite + Tailwind CSS + React Router + vite-plugin-pwa — decided upfront; no deviation
- **Backend**: Firebase only (Auth, Firestore, Storage, Functions, FCM, Hosting) — no other backend
- **Auth**: Google Sign-In only — no email/password, no other providers
- **Validation**: Zod for all schema validation
- **Testing**: Vitest + React Testing Library (unit), Playwright (E2E), Firebase Emulator (security rules)
- **Package manager**: npm
- **Privacy enforcement**: Firestore/Storage Security Rules are the authority — never rely on frontend to hide submissions
- **Pair size**: Exactly 2 members, enforced server-side via Cloud Functions
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack — Quick Reference
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| UI Framework | React | 19.x | Stable; concurrent features available |
| Build Tool | Vite | 6.x | Required by vite-plugin-pwa 1.x |
| Language | TypeScript | 5.5+ | Required minimum — Zod 4 breaks below 5.5 |
| Styling | Tailwind CSS | 4.x | Use `@tailwindcss/vite` plugin, not PostCSS |
| Routing | React Router | 7.x | Supports data router; stable with React 19 |
| PWA | vite-plugin-pwa | 1.3.0 | Latest stable (April 2026) |
| Firebase SDK | firebase | 12.18.0 | Modular-only; no compat layer |
| Validation | Zod | 4.x | 14x faster; requires TS 5.5+ |
| Unit Testing | Vitest + RTL | latest | Near-identical to Jest + RTL |
| E2E Testing | Playwright | latest | With Firebase Emulator + custom token auth |
| Cloud Functions | Cloud Functions v2 | — | Runs on Cloud Run; recommended for all new functions |
## Core Framework
### React 19
### Vite 6
### TypeScript 5.5+
## Styling
### Tailwind CSS v4 + `@tailwindcss/vite`
## PWA
### vite-plugin-pwa 1.3.0
- Service worker cache expires after 7 days if the app is not opened. Design the shell to re-fetch gracefully.
- IndexedDB/Cache storage capped at 50MB. Keep image uploads client-side compressed before storing.
- Push notifications require iOS 16.4+. Users in EU regions on iOS 17.4+ cannot receive PWA push notifications (Apple DMA compliance restriction — nothing you can do about it).
- Background Sync, Periodic Background Sync, and Background Fetch are all unavailable on iOS. Sync-on-open only.
## Firebase
### Firebase JS SDK — firebase@12.18.0
### Firebase Auth — Google Sign-In on Mobile Safari
- `signInWithRedirect` fails because Safari 16.1+ blocks the cross-origin iframe that Firebase uses to bridge state across the redirect. This became mandatory-to-fix on June 24 2024.
- `signInWithPopup` fails in standalone PWA mode because the popup opens in a new Safari session that does not return to the app.
### Firebase Cloud Functions — Use v2 Exclusively
- Pair-join validation (enforce exactly 2 members) → callable onCall v2 function with concurrency = 1 or Firestore transaction; the 1000 concurrent requests per instance behaviour is fine here.
- Reveal state transitions (auto-reveal, reveal-anyway) → callable onCall v2 function.
- Firestore triggers (auto-reveal when second submission lands) → onDocumentWritten v2 trigger.
## Validation
### Zod 4
| v3 | v4 |
|----|----|
| `z.string().email()` | `z.email()` |
| `z.string().url()` | `z.url()` |
| Multiple error params | Single `error` param |
| `schema.flatten()` | `z.flattenError(schema)` |
## Testing
### Vitest + React Testing Library
### Playwright E2E + Firebase Emulator
## Package Manager
## Installation — Full Dependency Manifest
# App dependencies
# Dev — build
# Dev — PWA service worker
# Dev — testing (unit)
# Dev — testing (E2E)
# Dev — Firebase security rules testing
## Conflicts and Gotchas
### 1. Two Service Workers Will Destroy Your PWA
### 2. `import.meta.env` Is Undefined in Service Workers
### 3. Firebase Auth Redirect Broken on iOS Safari Standalone
### 4. Tailwind v4 PostCSS Conflict
### 5. Zod 4 Requires TypeScript 5.5+
### 6. iOS 7-Day Cache Expiry Breaks Offline Mode
### 7. vite-plugin-pwa devOptions
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite 6 | Create React App | CRA is unmaintained |
| CSS | Tailwind v4 + Vite plugin | Tailwind v3 + PostCSS | v3 is in maintenance mode; v4 plugin is simpler and faster |
| Validation | Zod 4 | Zod 3 | No reason to start new project on v3; v4 is 14x faster |
| Auth popup/redirect | `signInWithRedirect` + custom authDomain | `signInWithPopup` | Popup unreliable in iOS standalone; redirect works with correct authDomain |
| Functions | Cloud Functions v2 | Cloud Functions v1 | v1 has no advantages for this use case; v2 is Google's stated recommendation for new projects |
| Service worker strategy | `injectManifest` | `generateSW` | `generateSW` cannot be combined with FCM without causing reload loops |
| E2E auth | `signInWithCustomToken` via Admin SDK | Mock Google OAuth | Mocking OAuth is fragile; custom token with emulator is the Firebase-native approach |
## Sources
- [Firebase JS SDK Release Notes](https://firebase.google.com/support/release-notes/js) — v12.18.0 confirmed latest
- [Firebase Auth Redirect Best Practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) — authDomain / third-party storage fix
- [Firebase Cloud Functions Version Comparison](https://firebase.google.com/docs/functions/version-comparison) — v2 recommendation
- [vite-plugin-pwa npm](https://www.npmjs.com/package/vite-plugin-pwa) — v1.3.0 current
- [vite-plugin-pwa injectManifest docs](https://vite-pwa-org.netlify.app/workbox/inject-manifest) — FCM + injectManifest pattern
- [Tailwind CSS v4 Vite Installation](https://tailwindcss.com/docs/installation/using-vite) — `@tailwindcss/vite` plugin
- [Zod v4 Release Notes](https://zod.dev/v4) — breaking changes, TS 5.5 requirement
- [nearform/playwright-firebase](https://nearform.com/insights/developing-a-playwright-firebase-plugin-to-enable-rapid-test-suite-authentication/) — custom token E2E auth pattern
- [Firebase Auth Emulator — Connect Auth](https://firebase.google.com/docs/emulator-suite/connect_auth) — `signInWithCustomToken` in emulator
- [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 7-day cache, 50MB limit, EU push restriction
- [vite-pwa/vite-plugin-pwa GitHub Issue #777](https://github.com/vite-pwa/vite-plugin-pwa/issues/777) — dual service worker reload loop
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
