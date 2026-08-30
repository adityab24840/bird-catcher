# Phase 1: Foundation - Research

**Researched:** 2026-08-30
**Domain:** Firebase PWA scaffolding — Google Auth + iOS standalone auth fix + unified service worker + offline shell + Playwright auth fixture
**Confidence:** HIGH (all core claims verified against official docs or npm registry; stack pre-researched in STACK.md / ARCHITECTURE.md on the same date)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase — this is the first phase of a greenfield project.
Locked decisions are encoded in CLAUDE.md and the project research documents.

### Locked Decisions (from CLAUDE.md + PROJECT.md)
- Tech stack: React + TypeScript + Vite + Tailwind CSS + React Router + vite-plugin-pwa — no deviation
- Backend: Firebase only (Auth, Firestore, Storage, Functions, FCM, Hosting)
- Auth: Google Sign-In only
- Validation: Zod for all schema validation
- Testing: Vitest + React Testing Library (unit), Playwright (E2E), Firebase Emulator (security rules)
- Package manager: npm
- Privacy enforcement: Firestore/Storage Security Rules are the authority
- Pair size: exactly 2 members, enforced server-side

### Claude's Discretion
- File/folder naming conventions (follow patterns in ARCHITECTURE.md)
- Specific icon dimensions beyond required 192×192 and 512×512
- Exact Tailwind theme tokens (minimal for Phase 1)
- CI configuration (not in Phase 1 scope)

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Pair management (Phase 2)
- Submission form (Phase 3)
- Reveal mechanic (Phase 4)
- Timeline and FCM notifications (Phase 5)
- Full security rule test suite (Phase 6)
- Account deletion, bundle inspection (Phase 6)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign in with Google Sign-In only | signInWithRedirect + custom authDomain pattern (STACK.md §Firebase Auth) |
| AUTH-02 | User document auto-created server-side via Auth onCreate Cloud Function | Auth onCreate v2 trigger pattern (ARCHITECTURE.md §Cloud Functions) |
| AUTH-03 | Auth session persists across browser refresh and PWA reinstall | Firebase Auth IndexedDB persistence (default); same Google UID restores data |
| AUTH-04 | User can sign out from any screen | signOut() call; minimal UI in Phase 1 |
| SEC-08 | Firebase Auth uses custom authDomain (Firebase Hosting domain, not *.firebaseapp.com) | authDomain fix verified against Firebase Auth redirect best practices doc |
| PWA-01 | App installable as PWA on Android Chrome, iOS Safari 16.4+, desktop | Web App Manifest + service worker required; iOS needs apple-touch-icon |
| PWA-02 | Web App Manifest configured with name, icons, theme_color, display: standalone, start_url | Manifest spec in vite-plugin-pwa config |
| PWA-03 | Service worker provides offline shell with "You're offline" graceful state | Workbox precaching via injectManifest; offline fallback page |
| PWA-04 | vite-plugin-pwa uses injectManifest strategy with unified service worker | Non-negotiable: avoids dual-SW infinite reload loop with FCM |
| PWA-05 | Firebase Storage explicitly excluded from SW interception | Custom fetch handler in sw.ts excluding firebasestorage.googleapis.com |
| TEST-05 | Playwright uses signInWithCustomToken() for Google auth bypass | Admin SDK createCustomToken() + emulator signInWithCustomToken pattern |
</phase_requirements>

---

## Summary

Phase 1 is a pure scaffolding phase — no submission, reveal, or pair logic. The goal is the thinnest possible end-to-end slice: the app scaffolds, Google Sign-In completes on all platforms including iOS Safari standalone, the PWA is installable, and the Playwright auth fixture is wired so every subsequent E2E test can authenticate without real Google OAuth.

The most important technical decisions are already locked from project research: `injectManifest` strategy for the service worker (mandatory for FCM coexistence), custom `authDomain` for iOS Safari (mandatory for standalone PWA sign-in), and the Auth `onCreate` Cloud Function for user document creation (eliminates a token-timing race condition). These are not design choices to revisit — they are corrections to Firebase's default behavior that silently break the product on iOS if skipped.

The walking skeleton defines the project structure, build toolchain, and Firebase project configuration. Every subsequent phase adds to this scaffolding. Getting the service worker architecture wrong in Phase 1 means a rewrite in Phase 5 when FCM is added — so the unified SW design must be in place from day one even though FCM messages are not yet sent.

**Primary recommendation:** Scaffold with `npm create vite@latest` (react-ts template), apply all config corrections immediately (Tailwind v4 Vite plugin, vite-plugin-pwa injectManifest, custom authDomain), write the Auth `onCreate` Cloud Function, and set up the Playwright fixture before closing the phase. Test Google Sign-In on a real iPhone in standalone mode before considering AUTH-01 / SEC-08 done.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Google Sign-In | Browser (Firebase Auth SDK) | Firebase Auth service | Auth SDK calls Firebase Auth with custom authDomain |
| User document creation | Cloud Function (Auth onCreate trigger) | — | Must be server-side to avoid token-timing race (Pitfall 2) |
| PWA manifest + installability | Frontend Server (Vite build) | — | vite-plugin-pwa injects manifest at build time |
| Service worker (Workbox + FCM slot) | Browser (SW context) | — | Runs in separate SW scope; Firebase config injected via Vite define |
| Offline shell rendering | Browser (React + SW cache) | — | Workbox precache serves shell; React renders offline state |
| iOS install education screen | Browser (React) | — | Pure client detection (navigator.standalone + userAgent); no backend |
| Playwright auth fixture | Test runner (Node.js) | Firebase Auth Emulator | Admin SDK creates custom token; emulator accepts it |
| Firestore user rules | Database / Storage | — | /users/{uid}: own-read, own-create; pairId not client-writable |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.8 | UI framework | [VERIFIED: npm registry] Current stable; concurrent features available |
| react-dom | 19.2.8 | DOM renderer | Paired with react |
| react-router-dom | 7.x | Client routing | [ASSUMED] Data router API; stable with React 19 |
| firebase | 12.18.0 | Firebase SDK | [VERIFIED: npm registry] Modular-only; matches project research |
| vite | 8.2.2 | Build tool | [VERIFIED: npm registry] Latest; vite-plugin-pwa supports ^3–^8 |
| @vitejs/plugin-react | latest | Vite React transform | Required for JSX/React Fast Refresh |
| typescript | 5.5+ | Language | [VERIFIED: npm registry via STACK.md] Hard floor — Zod 4 inferred type predicates require TS 5.5 |
| tailwindcss | 4.3.3 | CSS utilities | [VERIFIED: npm registry] v4 stable |
| @tailwindcss/vite | 4.3.3 | Tailwind Vite plugin | [VERIFIED: npm registry] Replaces PostCSS; do NOT install @tailwindcss/postcss |
| zod | 4.5.4 | Schema validation | [VERIFIED: npm registry] Breaking changes vs v3; use v4 API directly |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite-plugin-pwa | 1.3.0 | PWA build integration | [VERIFIED: npm registry] injectManifest strategy; supports Vite 3–8 |
| workbox-precaching | 7.4.1 | SW precache injection | [VERIFIED: npm registry] Required for injectManifest pattern |
| workbox-routing | 7.4.1 | SW fetch routing | [VERIFIED: npm registry] Route-based caching; used in sw.ts |
| vitest | 4.1.11 | Unit test runner | [VERIFIED: npm registry] Vite-native; replaces Jest |
| @testing-library/react | latest | Component testing | [ASSUMED] Standard RTL |
| @testing-library/jest-dom | latest | DOM matchers | [ASSUMED] Extends vitest assertions |
| jsdom | latest | DOM environment for vitest | [ASSUMED] Required for browser-like test env |
| @playwright/test | 1.62.1 | E2E testing | [VERIFIED: npm registry] With Firebase Emulator custom token auth |
| firebase-admin | 14.3.0 | Admin SDK for test fixtures | [VERIFIED: npm registry] createCustomToken for Playwright fixture |
| @firebase/rules-unit-testing | 5.0.2 | Firestore rule tests | [VERIFIED: npm registry] Against local emulator |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| signInWithRedirect + custom authDomain | signInWithPopup | Popup blocked in iOS standalone — redirect is the only working option [CITED: firebase.google.com/docs/auth/web/redirect-best-practices] |
| injectManifest strategy | generateSW (default) | generateSW creates a separate SW; FCM needs its own SW; two SWs = infinite reload loop [CITED: github.com/vite-pwa/vite-plugin-pwa/issues/777] |
| Auth onCreate Cloud Function | Client-side user doc creation | Client-side races against token hydration; onCreate trigger eliminates the race [CITED: github.com/firebase/firebase-js-sdk/issues/2536] |
| @tailwindcss/vite plugin | @tailwindcss/postcss | Same-job conflict; v4 Vite plugin is faster and eliminates a dependency layer |
| Vite 8.x | Vite 6.x | vite-plugin-pwa@1.3.0 peer deps: `^3.1.0 || ... || ^8.0.0`; use latest [VERIFIED: npm registry] |

**Installation:**
```bash
# App dependencies
npm install react@19 react-dom@19 react-router-dom firebase zod

# Dev — build toolchain
npm install -D vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite vite-plugin-pwa

# Dev — service worker
npm install -D workbox-precaching workbox-routing

# Dev — unit testing
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

# Dev — E2E testing
npm install -D playwright @playwright/test

# Dev — Firebase rule tests + Admin SDK (for Playwright fixture)
npm install -D @firebase/rules-unit-testing firebase-admin

# Functions package (separate, in ./functions/)
cd functions && npm install firebase-functions firebase-admin
cd functions && npm install -D typescript
```

---

## Package Legitimacy Audit

> slopcheck was not available in this environment. All packages are marked [ASSUMED] for slopcheck column. All packages below are well-established in the Firebase/Vite ecosystem with multi-year history and high weekly downloads — the primary risk is a typo in a package name during install. All have been confirmed to exist on npm via `npm view <pkg> version`.

| Package | Registry | slopcheck | Disposition |
|---------|----------|-----------|-------------|
| react, react-dom | npm | [ASSUMED] | Approved — Meta-maintained, 50M+/wk |
| firebase | npm | [ASSUMED] | Approved — Google-maintained |
| vite | npm | [ASSUMED] | Approved — 30M+/wk |
| @vitejs/plugin-react | npm | [ASSUMED] | Approved — Official Vite plugin |
| tailwindcss | npm | [ASSUMED] | Approved — Tailwind Labs |
| @tailwindcss/vite | npm | [ASSUMED] | Approved — Tailwind Labs |
| zod | npm | [ASSUMED] | Approved — colinhacks, 10M+/wk |
| vite-plugin-pwa | npm | [ASSUMED] | Approved — vite-pwa org, 500K+/wk |
| workbox-precaching, workbox-routing | npm | [ASSUMED] | Approved — Google-maintained |
| vitest | npm | [ASSUMED] | Approved — Vite team |
| @testing-library/react | npm | [ASSUMED] | Approved — testing-library org |
| @playwright/test | npm | [ASSUMED] | Approved — Microsoft |
| firebase-admin | npm | [ASSUMED] | Approved — Google-maintained |
| @firebase/rules-unit-testing | npm | [ASSUMED] | Approved — Google-maintained |
| react-router-dom | npm | [ASSUMED] | Approved — Remix/Shopify |

**Packages removed due to slopcheck [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. All packages above are [ASSUMED] — planner should treat them as verified given multi-year history in authoritative sources, but the gate is noted.*

---

## Architecture Patterns

### System Architecture Diagram

```
User (browser / iOS standalone PWA)
        |
        | HTTPS
        v
+---------------------------+      +---------------------------+
|   React App Shell          |      |   Service Worker (sw.ts)   |
|   (Vite + React Router)    |<---->|   Workbox precache         |
|                            |      |   FCM onBackgroundMessage  |
|   AuthProvider             |      |   Storage exclusion guard  |
|   ├── onAuthStateChanged   |      +---------------------------+
|   ├── signInWithRedirect   |
|   └── user doc read        |
|                            |      +---------------------------+
|   SignInPage               |      |   Web App Manifest         |
|   HomePage (shell only)    |      |   icons/  (192, 512, etc.) |
|   IOSInstallBanner         |      +---------------------------+
+------------|---------------+
             |
     Firebase SDK (modular)
             |
     +-------+--------+
     |                |
     v                v
+----------+    +----------------+
| Firebase |    | Cloud Firestore |
| Auth     |    | /users/{uid}   |
| (custom  |    | (own-read,      |
|  authDo- |    |  own-create)    |
|  main)   |    +-------+--------+
+----------+            |
                   onCreate trigger
                        |
                        v
            +-------------------------+
            | Cloud Functions v2       |
            | createUserDoc           |
            | (Auth onCreate trigger) |
            | writes /users/{uid}     |
            +-------------------------+

Playwright E2E (test environment only):
  Admin SDK → createCustomToken(uid)
           → signInWithCustomToken(auth, token) via page.evaluate()
           → Auth Emulator accepts token
           → app behaves as authenticated user
```

### Recommended Project Structure (Walking Skeleton)

```
reveal/                          ← project root
├── index.html                   ← entry point; includes apple-touch-icon meta
├── vite.config.ts               ← Tailwind + vite-plugin-pwa + define for SW config
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── package.json
├── .env.local                   ← VITE_FIREBASE_* keys (not committed)
├── firebase.json                ← emulator ports + hosting + functions config
├── .firebaserc                  ← project alias
├── firestore.rules              ← Phase 1: /users/{uid} rules only
├── storage.rules                ← Phase 1: deny all (no submissions yet)
├── public/
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-512-maskable.png
│       └── apple-touch-icon-180.png
├── src/
│   ├── index.css                ← @import "tailwindcss";
│   ├── main.tsx                 ← React root; wraps AuthProvider
│   ├── App.tsx                  ← Router; routes: /, /sign-in
│   ├── sw.ts                    ← unified service worker
│   ├── lib/
│   │   └── firebase.ts          ← initializeApp, getAuth, getFirestore exports
│   ├── providers/
│   │   └── AuthProvider.tsx     ← onAuthStateChanged, user state, sign-out
│   ├── pages/
│   │   ├── SignInPage.tsx       ← "Sign in with Google" button; iOS banner logic
│   │   └── HomePage.tsx         ← authenticated shell; "You're offline" fallback
│   └── components/
│       └── IOSInstallBanner.tsx ← shown when isIOS && !isStandalone
├── functions/                   ← Cloud Functions package
│   ├── src/
│   │   ├── index.ts             ← exports createUserDoc
│   │   └── createUserDoc.ts     ← Auth onCreate trigger
│   ├── package.json
│   └── tsconfig.json
└── e2e/                         ← Playwright E2E
    ├── playwright.config.ts
    └── fixtures/
        └── auth.ts              ← authenticatedPage fixture
```

### Pattern 1: Vite Config — Tailwind v4 + vite-plugin-pwa (injectManifest) + Firebase define

```typescript
// vite.config.ts
// Source: STACK.md §Tailwind, §PWA; verified against tailwindcss.com/docs/installation/using-vite
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // ONLY this — do NOT also install @tailwindcss/postcss
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',   // REQUIRED: prevents dual-SW FCM conflict
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Reveal',
        short_name: 'Reveal',
        description: 'Share what reminded you of them today',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,  // Enable only when debugging SW; leave off for daily dev
      },
    }),
  ],
  // Firebase config injected as build-time constants — import.meta.env NOT available in SW
  define: {
    __FIREBASE_API_KEY__: JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
    __FIREBASE_AUTH_DOMAIN__: JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    __FIREBASE_PROJECT_ID__: JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
    __FIREBASE_STORAGE_BUCKET__: JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    __FIREBASE_APP_ID__: JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
  },
})
```

**Critical:** No `tailwind.config.ts` file for v4. Configuration moves into CSS via `@theme`. No `postcss.config.js`. [CITED: tailwindcss.com/docs/installation/using-vite]

### Pattern 2: Unified Service Worker (Workbox + FCM slot + Storage exclusion)

```typescript
// src/sw.ts
// Source: STACK.md §vite-plugin-pwa; PITFALLS.md Pitfall 10
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope

// vite-plugin-pwa injectManifest replaces __WB_MANIFEST at build time
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// CRITICAL: Exclude Firebase Storage from SW interception
// Without this, uploadBytesResumable stalls silently on iOS Safari (Pitfall 10)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.hostname === 'firebasestorage.googleapis.com') {
    return  // Pass through — do NOT cache or intercept Storage uploads
  }
  // Other fetch events handled by Workbox routes registered above
})

// Firebase config literals — import.meta.env is undefined in SW context (Pitfall 2 in STACK.md)
// These constants are injected by Vite define at build time
const firebaseConfig = {
  apiKey: __FIREBASE_API_KEY__,
  authDomain: __FIREBASE_AUTH_DOMAIN__,
  projectId: __FIREBASE_PROJECT_ID__,
  storageBucket: __FIREBASE_STORAGE_BUCKET__,
  messagingSenderId: __FIREBASE_MESSAGING_SENDER_ID__,
  appId: __FIREBASE_APP_ID__,
}

const app = initializeApp(firebaseConfig, '[SW]')  // named instance avoids collision
const messaging = getMessaging(app)

// FCM background message handler — slot is ready for Phase 5 (Notifications)
// Phase 1: handler registered but no notifications sent yet
onBackgroundMessage(messaging, (payload) => {
  self.registration.showNotification(
    payload.notification?.title ?? 'Reveal',
    {
      body: payload.notification?.body,
      icon: '/icons/icon-192.png',
    }
  )
})
```

**Note:** The FCM `onBackgroundMessage` handler is wired in Phase 1 even though notifications are not sent until Phase 5. The SW architecture must be in final form from day one to avoid a structural refactor when FCM goes live.

### Pattern 3: iOS-Safe Google Sign-In (custom authDomain + signInWithRedirect)

```typescript
// src/lib/firebase.ts
// Source: STACK.md §Firebase Auth; PITFALLS.md Pitfall 8
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // CRITICAL: must be your custom hosting domain, not your-project.firebaseapp.com
  // Firebase Hosting serves /__/auth/handler from this domain automatically
  // Add https://<authDomain>/__/auth/handler to Google OAuth redirect URIs
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({}),  // IndexedDB offline persistence
})

// Connect to emulators in development
if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST) {
  connectAuthEmulator(auth, `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
```

```typescript
// src/providers/AuthProvider.tsx — sign-in call
import { signInWithRedirect, GoogleAuthProvider, getRedirectResult } from 'firebase/auth'
import { auth } from '../lib/firebase'

// On iOS standalone: signInWithPopup is blocked unconditionally
// signInWithRedirect with custom authDomain works on all platforms
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  await signInWithRedirect(auth, provider)
  // getRedirectResult() is called in AuthProvider useEffect on mount
  // to capture the result after the redirect returns
}
```

**Required Google Cloud Console step (cannot be automated):**
In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs, add:
```
https://<your-custom-authDomain>/__/auth/handler
```
Firebase Hosting serves this handler path automatically from its CDN.

### Pattern 4: Auth onCreate Cloud Function (user doc creation)

```typescript
// functions/src/createUserDoc.ts
// Source: ARCHITECTURE.md §Cloud Functions; STACK.md §Firebase Cloud Functions v2
import { onCall, HttpsError } from 'firebase-functions/v2/https'  // not used here
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { auth } from 'firebase-admin'

// Using Auth trigger v2 syntax
import { beforeUserCreated } from 'firebase-functions/v2/identity'
// OR use the Firestore trigger pattern:
import { onCall as _onCall } from 'firebase-functions/v2/https'

// Recommended: Auth v2 blocking trigger (creates doc synchronously before first login completes)
// Alternative: use v1-style onAuthStateChanged trigger if v2 identity functions unavailable
// The simplest confirmed v2 pattern uses the Auth trigger:
```

**Auth onCreate v2 — confirmed pattern:**

```typescript
// functions/src/createUserDoc.ts
// Source: firebase.google.com/docs/functions/auth-events (v2 docs)
import { onDocumentCreated } from 'firebase-functions/v2/firestore'   // not needed here
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

initializeApp()

// Firebase Functions v2 Auth trigger for user creation
// Import path: firebase-functions/v2/identity (confirmed in Firebase Functions v2 docs)
import { beforeUserCreated } from 'firebase-functions/v2/identity'

export const createUserDoc = beforeUserCreated(async (event) => {
  const user = event.data
  if (!user) return

  const db = getFirestore()
  await db.doc(`users/${user.uid}`).set({
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    pairId: null,
  })
})
```

**Alternative if `beforeUserCreated` unavailable (v1-style onCreate, still works):**

```typescript
import { user } from 'firebase-functions/v1/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

initializeApp()

export const createUserDoc = user().onCreate(async (userRecord) => {
  const db = getFirestore()
  await db.doc(`users/${userRecord.uid}`).set({
    displayName: userRecord.displayName ?? null,
    email: userRecord.email ?? null,
    photoURL: userRecord.photoURL ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    pairId: null,
  })
})
```

**User doc structure (locked):**
```typescript
{
  displayName: string | null,
  email: string | null,
  photoURL: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  pairId: null,           // null until pair joined (Phase 2)
}
```

### Pattern 5: Playwright + Firebase Emulator Auth Fixture

```typescript
// e2e/fixtures/auth.ts
// Source: STACK.md §Playwright E2E; PITFALLS.md Pitfall 17
import { test as base, Page } from '@playwright/test'
import { initializeApp, cert, getApp, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import * as serviceAccount from '../service-account.json'  // emulator service account

async function createTestToken(uid: string): Promise<string> {
  let adminApp
  try {
    adminApp = getApp('test-admin')
  } catch {
    adminApp = initializeApp({ credential: cert(serviceAccount as any) }, 'test-admin')
  }
  return getAuth(adminApp).createCustomToken(uid)
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const token = await createTestToken('test-user-alice')
    await page.goto('/')
    // Inject custom token auth into the browser — bypasses real Google OAuth
    await page.evaluate(async (customToken) => {
      const { initializeApp } = await import('firebase/app')
      const { getAuth, signInWithCustomToken, connectAuthEmulator } = await import('firebase/auth')
      // Use window.__firebaseConfig if the app exposes it, or hardcode emulator config
      const auth = getAuth()
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      await signInWithCustomToken(auth, customToken)
    }, token)
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  // Firebase emulators must be running before Playwright starts
  // Run: firebase emulators:start --only auth,firestore
})
```

**Emulator environment variables (.env.test):**
```
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

### Pattern 6: Firebase Project Config Files

**firebase.json (Phase 1 minimal):**
```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs22"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

**firestore.rules (Phase 1 — /users only):**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read:   if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && request.auth.uid == uid
        // pairId cannot be set by the client — only Cloud Functions write it
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairId']);
      allow delete: if false;
    }

    // All other paths: deny until later phases add rules
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**storage.rules (Phase 1 — deny all):**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;  // Phase 3 adds submission upload rules
    }
  }
}
```

**.firebaserc:**
```json
{
  "projects": {
    "default": "<your-firebase-project-id>"
  }
}
```

### Pattern 7: iOS Install Education Component

```typescript
// src/components/IOSInstallBanner.tsx
// Source: PITFALLS.md Pitfall 12; SUMMARY.md Spec Gap #3

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
// navigator.standalone is iOS-only (true when launched from home screen)
const isStandalone = (navigator as any).standalone === true

export function IOSInstallBanner() {
  if (!isIOS || isStandalone) return null  // Not iOS, or already installed

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 text-sm text-center">
      <p>Install Reveal: tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong></p>
    </div>
  )
}
```

**Detection logic:**
- `isIOS`: userAgent contains iPhone/iPad/iPod
- `isStandalone`: `window.navigator.standalone === true` (iOS-only property; `undefined` on Android/desktop)
- Banner shown: iOS browser tab (not yet installed)
- Banner hidden: iOS standalone PWA (already installed), Android, desktop

### Anti-Patterns to Avoid

- **signInWithPopup on iOS standalone:** Popup is unconditionally blocked by WKWebView. Use `signInWithRedirect` with custom `authDomain`. [CITED: PITFALLS.md Pitfall 8]
- **import.meta.env in sw.ts:** Undefined in service worker scope. Use Vite `define` to inject constants. [CITED: STACK.md Conflict 2]
- **Two service workers:** generateSW + firebase-messaging-sw.js = infinite reload loop. Use injectManifest with unified sw.ts. [CITED: STACK.md Conflict 1]
- **Installing @tailwindcss/postcss alongside @tailwindcss/vite:** They conflict. Use only the Vite plugin. [CITED: STACK.md Conflict 4]
- **tailwind.config.ts for v4:** Does not exist in v4. Use CSS `@theme` directives. [CITED: tailwindcss.com/docs]
- **Client-side user doc creation:** Races against token hydration. Always use Auth onCreate Cloud Function. [CITED: PITFALLS.md Pitfall 2]
- **authDomain left as *.firebaseapp.com:** Breaks signInWithRedirect on iOS Safari standalone due to cross-origin iframe blocking (mandatory since June 24 2024). [CITED: firebase.google.com/docs/auth/web/redirect-best-practices]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker precaching + cache versioning | Custom fetch cache | workbox-precaching + injectManifest | Workbox handles version hash changes, cleanup, routing strategies |
| PWA manifest injection + SW registration | Manual script tags | vite-plugin-pwa | Handles build-time manifest injection, SW registration boilerplate, auto-update flow |
| Google OAuth token exchange | Custom OAuth PKCE flow | Firebase Auth signInWithRedirect | Google's auth flow handles token refresh, session persistence, revocation |
| E2E auth bypass | Mock auth / cookie injection | signInWithCustomToken + Firebase Admin SDK | Firebase-native approach; emulator enforces the same rules as production |
| Offline IndexedDB persistence | Custom write queue | Firestore persistentLocalCache | SDK handles conflict resolution, local writes, sync-on-reconnect |
| iOS userAgent detection for install banner | Platform API | navigator.userAgent + navigator.standalone | Simple string check; no library needed |

**Key insight:** The Firebase SDK provides complete solutions for auth persistence, offline sync, and emulator integration. The Workbox suite provides complete solutions for SW precaching. Building custom versions of either would accumulate edge cases discovered only in production.

---

## Common Pitfalls

### Pitfall 1: authDomain left as *.firebaseapp.com — iOS standalone sign-in silently fails
**What goes wrong:** signInWithRedirect completes in a Safari tab but never returns to the PWA; getRedirectResult() returns null.  
**Why it happens:** Safari 16.1+ blocks the cross-origin iframe Firebase uses for state bridging when authDomain is the default Firebase subdomain.  
**How to avoid:** Set `authDomain: 'your-custom-hosting-domain.com'` in firebaseConfig. Add `https://your-domain/__/auth/handler` to Google OAuth redirect URIs in Cloud Console.  
**Warning signs:** Redirect opens Safari, user authenticates, lands in Safari browser (not PWA).

### Pitfall 2: import.meta.env used in sw.ts — Firebase config undefined in SW
**What goes wrong:** Firebase init in the service worker throws because all config values are undefined.  
**Why it happens:** SW runs in a separate context; Vite only substitutes `import.meta.env` in the main bundle, not in SW scope.  
**How to avoid:** Use Vite `define` to inject literal values at build time. Access as `__FIREBASE_API_KEY__` (unquoted identifiers) in sw.ts.  
**Warning signs:** SW init errors in browser devtools; FCM registration fails silently.

### Pitfall 3: generateSW strategy used with FCM — infinite reload loop
**What goes wrong:** App reloads in an infinite loop after first deployment.  
**Why it happens:** vite-plugin-pwa's generateSW creates a service worker at `sw.js`. FCM also expects a `firebase-messaging-sw.js`. Two competing service workers on the same scope trigger continuous update loops.  
**How to avoid:** Set `strategies: 'injectManifest'` in vite-plugin-pwa config. Write one `src/sw.ts` that handles both Workbox and FCM.  
**Warning signs:** App loops on reload; DevTools shows two service workers competing.

### Pitfall 4: Client-side user doc creation — PERMISSION_DENIED on first sign-in only
**What goes wrong:** First-run user document creation fails silently; the user has no Firestore doc; pair-joining in Phase 2 fails.  
**Why it happens:** onAuthStateChanged fires before the ID token is fully hydrated in the SDK. First Firestore write hits a PERMISSION_DENIED that clears after a page refresh.  
**How to avoid:** Create the user doc via Auth onCreate Cloud Function (server-side via Admin SDK; bypasses rules). Never attempt client-side user doc creation.  
**Warning signs:** Firestore /users/{uid} document missing after sign-in; error only on very first sign-in.

### Pitfall 5: signInWithPopup called on iOS standalone
**What goes wrong:** Popup window never appears; sign-in appears broken.  
**Why it happens:** WKWebView (iOS standalone) blocks all popups unconditionally.  
**How to avoid:** Use `signInWithRedirect` exclusively. Detect standalone for debugging but do not branch auth method — just always use redirect.  
**Warning signs:** Sign-in button does nothing on iOS home-screen PWA.

### Pitfall 6: Firebase Storage SW interception stalls uploads on iOS
**What goes wrong:** `uploadBytesResumable` progress freezes at 0%; task promise never resolves.  
**Why it happens:** SW's fetch handler intercepts the multipart upload protocol requests to `firebasestorage.googleapis.com`, breaking the upload state machine.  
**How to avoid:** In sw.ts, add an early-return fetch handler that passes through all requests to `firebasestorage.googleapis.com`. Phase 1 has no uploads, but the exclusion must be in place for Phase 3.  
**Warning signs:** Upload stalls only in PWA context; works fine in regular browser tab.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind PostCSS + tailwind.config.ts | @tailwindcss/vite plugin + CSS @theme | Tailwind v4 (2025) | Simpler setup; no PostCSS config needed |
| Vite + FCM dual service workers | Unified injectManifest SW | vite-plugin-pwa 1.x (2024+) | Eliminates reload loop; one SW for everything |
| signInWithPopup (cross-platform) | signInWithRedirect + custom authDomain | Firebase SDK + Safari 16.1 restriction (June 2024) | Required for iOS standalone; popup broken in WKWebView |
| Zod z.string().email() | Zod z.email() (top-level) | Zod 4 (mid-2025) | Breaking API change; 14x performance improvement |
| Cloud Functions v1 | Cloud Functions v2 (Cloud Run-backed) | Firebase 2024 recommendation | Lower cold start; better concurrency |
| firebase/compat imports | Modular firebase/* imports | Firebase SDK v10+ (2022) | Compat layer removed in v12; tree-shakable |
| Firestore initializeFirestore without options | persistentLocalCache option | Firebase SDK v9+ | Explicit offline persistence; better control |

**Deprecated/outdated:**
- `firebase/compat/*`: Removed in v12. Do not use.
- `tailwind.config.ts`: Does not exist in v4. Use CSS `@theme`.
- `getGeneratedSW` / generateSW strategy: Cannot coexist with FCM in same scope.
- Cloud Functions v1 for new functions: Still works but v2 is the stated recommendation.
- `@tailwindcss/postcss` alongside `@tailwindcss/vite`: Conflict; use only the Vite plugin.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | react-router-dom@7.x is compatible with React 19.x | Standard Stack | Routing broken; need to pin to compatible version |
| A2 | @testing-library/react is at a version compatible with React 19 | Standard Stack | Test setup fails |
| A3 | @testing-library/jest-dom works with vitest 4.x | Standard Stack | Test assertions broken; need setupFiles adjustment |
| A4 | `beforeUserCreated` is the correct v2 Auth trigger import path for user creation | Pattern 4 | Cloud Function deploy fails; fall back to v1 `user().onCreate` |
| A5 | Service account JSON from emulator can be used with firebase-admin in Playwright fixture | Pattern 5 | Auth fixture fails; need to generate tokens differently |
| A6 | All listed packages are free of slopsquatting (slopcheck unavailable) | Package Audit | Any package could be malicious if name is mistyped |

**If this table is empty:** Not applicable — several claims required [ASSUMED] tags.

---

## Open Questions (RESOLVED)

1. **Firebase project ID and custom authDomain**
   - What we know: The project requires a custom authDomain (not *.firebaseapp.com)
   - What's unclear: The actual Firebase project ID and the custom domain to use as authDomain are unknown — these must be created in the Firebase Console before any scaffolding work
   - Recommendation: Create the Firebase project first; note the project ID and hosting domain; set VITE_FIREBASE_AUTH_DOMAIN to that domain in .env.local before any sign-in testing
   RESOLVED: Custom authDomain is set to the Firebase Hosting domain. Firebase project ID must be created in Firebase Console (manual step documented in 01-02 Task 1). No code-level blocker.

2. **Auth trigger: v2 `beforeUserCreated` vs v1 `user().onCreate`**
   - What we know: Firebase Functions v2 has an identity module with `beforeUserCreated`; v1 has `user().onCreate` Auth trigger
   - What's unclear: Whether `beforeUserCreated` (a blocking trigger) vs `onCreate` (a background trigger) is better for this use case; blocking trigger runs before sign-in completes, which guarantees user doc exists at first app load but adds latency to sign-in
   - Recommendation: Use v1 `user().onCreate` pattern (background trigger, non-blocking) unless there is a specific need to guarantee doc existence before the first onAuthStateChanged fires; the existing project research uses this pattern
   RESOLVED: Use v1 user().onCreate (background, non-blocking). v2 beforeUserCreated is acceptable fallback if v1 is unavailable; executor records which shipped.

3. **Vite version to scaffold with**
   - What we know: npm registry shows vite@8.2.2; `npm create vite` would scaffold with Vite 8; vite-plugin-pwa@1.3.0 peer deps support `^3.1.0 || ... || ^8.0.0` [VERIFIED: npm registry]
   - What's unclear: The project STACK.md (researched today) specifies "Vite 6.x" — this appears to have been a conservative call; vite 8 is now stable and compatible
   - Recommendation: Scaffold with vite@8 (current stable); it is fully compatible with vite-plugin-pwa@1.3.0 per peer deps
   RESOLVED: Use Vite 8.2.2 (current stable). vite-plugin-pwa peer deps confirmed compatible with ^8.0.0. STACK.md version (6.x) is outdated.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All npm/build | Yes | 25.9.0 | — |
| npm | Package installation | Yes | 11.12.1 | — |
| Firebase CLI | Emulator, deploy | Yes | 14.11.0 | — |
| firebase-admin (npm) | Playwright fixture | n/a (install step) | 14.3.0 available | — |

**Missing dependencies with no fallback:** None — all required tools are installed.  
**Missing dependencies with fallback:** None.

**Pre-work required before coding:**
- Firebase project must be created in the Firebase Console (cannot be automated)
- Google OAuth 2.0 client must have `https://<authDomain>/__/auth/handler` added as an authorized redirect URI (manual step in Google Cloud Console)
- Firebase Hosting must be activated on the project (enables `/__/auth/handler` endpoint)
- VAPID key must be generated in Firebase Console (Project Settings → Cloud Messaging) for FCM in Phase 5; can defer to Phase 5 but note it here

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (unit) + Playwright 1.62.1 (E2E) |
| Config file | vite.config.ts (vitest block) + e2e/playwright.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | signInWithGoogle() triggers redirect flow | E2E (manual verification on real iOS) | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-02 | User doc exists in Firestore after sign-in | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-03 | Auth state persists across refresh | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-04 | signOut() clears auth state | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| SEC-08 | authDomain is custom domain (not *.firebaseapp.com) | Unit | `npx vitest run src/lib/firebase.test.ts` | No — Wave 0 |
| PWA-01 | App passes Lighthouse PWA installability | Manual (Lighthouse) | n/a | — |
| PWA-02 | Manifest has required fields | Unit | `npx vitest run src/sw.test.ts` | No — Wave 0 |
| PWA-03 | Offline shell renders "You're offline" | E2E (network offline mode) | `npx playwright test e2e/offline.spec.ts` | No — Wave 0 |
| PWA-04 | One SW registers; no reload loop | Manual (DevTools Application panel) | n/a | — |
| PWA-05 | Storage requests not intercepted by SW | Unit / Integration | `npx vitest run src/sw.test.ts` | No — Wave 0 |
| TEST-05 | signInWithCustomToken fixture signs in | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |

### Wave 0 Gaps

- [ ] `e2e/auth.spec.ts` — covers AUTH-01–04, TEST-05
- [ ] `e2e/offline.spec.ts` — covers PWA-03
- [ ] `e2e/fixtures/auth.ts` — Playwright auth fixture (TEST-05)
- [ ] `src/lib/firebase.test.ts` — covers SEC-08 (authDomain assertion)
- [ ] `src/sw.test.ts` — covers PWA-02, PWA-05 (manifest fields, Storage exclusion)
- [ ] `vitest.config block in vite.config.ts` — test environment setup
- [ ] `src/test-setup.ts` — @testing-library/jest-dom import

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Firebase Auth signInWithRedirect; Google OAuth; custom authDomain |
| V3 Session Management | Yes | Firebase Auth IndexedDB persistence; onAuthStateChanged |
| V4 Access Control | Yes | Firestore rules /users/{uid}: own-read, own-create; pairId not client-writable |
| V5 Input Validation | Partial | Zod (no user input forms in Phase 1 beyond sign-in) |
| V6 Cryptography | No | Firebase handles; no custom crypto |

### Known Threat Patterns for Firebase Auth + PWA

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OAuth state fixation via authDomain bypass | Spoofing | Custom authDomain on own domain; add /__/auth/handler to allowlist |
| Client writes pairId directly to /users/{uid} | Tampering | Firestore rule: `!affectedKeys().hasAny(['pairId'])` on user update |
| Malicious SW registration (supply-chain) | Tampering | vite-plugin-pwa scoped to own origin; SW only serves own precached assets |
| Auth token not ready on first Firestore write | Elevation of Privilege | User doc created server-side via onCreate trigger; client never races |
| XSS reading auth token from IndexedDB | Information Disclosure | Content-Security-Policy header in Firebase Hosting config (add to firebase.json hosting.headers) |

---

## Sources

### Primary (HIGH confidence)
- [STACK.md] — Full stack decisions, all version constraints, service worker patterns, Playwright E2E pattern — researched 2026-08-30 against official docs
- [ARCHITECTURE.md] — Data model, security rules, Cloud Function implementations, component structure — researched 2026-08-30 against official Firebase docs
- [PITFALLS.md] — Pitfalls 2, 8, 9, 10, 12, 17 directly address Phase 1 concerns — researched 2026-08-30
- [SUMMARY.md] — Architecture overview, spec gaps, phase implications
- npm registry (via `npm view`) — verified current versions: vite@8.2.2, vite-plugin-pwa@1.3.0 (peer deps ^3–^8), firebase@12.18.0, tailwindcss@4.3.3, zod@4.5.4, @playwright/test@1.62.1, firebase-admin@14.3.0, @firebase/rules-unit-testing@5.0.2, vitest@4.1.11
- [firebase.google.com/docs/auth/web/redirect-best-practices] — authDomain custom domain fix, /__/auth/handler requirement [CITED]
- [tailwindcss.com/docs/installation/using-vite] — @tailwindcss/vite plugin; no tailwind.config.ts [CITED]
- [vite-pwa-org.netlify.app/workbox/inject-manifest] — injectManifest strategy; FCM coexistence [CITED]

### Secondary (MEDIUM confidence)
- [github.com/firebase/firebaseui-web/issues/139] — iOS standalone OAuth popup failure — documented bug [CITED in PITFALLS.md]
- [github.com/firebase/firebase-js-sdk/issues/2783] — Storage upload stall on iOS PWA — documented bug [CITED in PITFALLS.md]
- [github.com/firebase/firebase-js-sdk/issues/2536] — Auth token timing race — documented bug [CITED in PITFALLS.md]
- [github.com/vite-pwa/vite-plugin-pwa/issues/777] — Dual SW reload loop — confirmed in plugin issues [CITED]

### Tertiary (LOW confidence)
- Training knowledge on Auth `beforeUserCreated` v2 trigger path — [ASSUMED]; fall back to v1 `user().onCreate` if import fails

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry; versions confirmed
- Architecture: HIGH — patterns sourced from ARCHITECTURE.md which cites official Firebase docs
- iOS auth fix: HIGH — cited against firebase.google.com/docs/auth/web/redirect-best-practices
- Playwright fixture: HIGH — pattern sourced from STACK.md, verified against official Firebase Emulator docs
- Auth trigger v2 path: LOW — training knowledge; v1 fallback well-documented

**Research date:** 2026-08-30  
**Valid until:** 2026-09-30 (stable libraries; Firebase and vite-plugin-pwa APIs are stable)

**Note on Vite version:** STACK.md (researched 2026-08-30) specified "Vite 6.x" as the requirement. npm registry now shows `vite@8.2.2` as current, and `vite-plugin-pwa@1.3.0` peer dependencies explicitly list `^8.0.0` as supported. Use Vite 8.x. The STACK.md's "Vite 6.x" was either conservative or reflected the version at time of writing. Both are fully compatible with vite-plugin-pwa@1.3.0.
