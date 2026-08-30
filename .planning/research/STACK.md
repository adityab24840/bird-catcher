# Technology Stack

**Project:** Reveal (private two-person PWA)
**Researched:** 2026-08-30
**Confidence:** HIGH (all major decisions verified against official docs and current releases)

---

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

---

## Core Framework

### React 19

React 19 is the current stable release. No obstacles for this stack.

```bash
npm install react@19 react-dom@19
```

No action needed beyond standard Vite React template scaffolding:

```bash
npm create vite@latest reveal -- --template react-ts
```

### Vite 6

vite-plugin-pwa 1.x requires Vite 6. Vite 5 is unsupported by the current plugin version.

### TypeScript 5.5+

This is a hard floor set by Zod 4. TypeScript 5.5 introduced the inferred type predicate feature that Zod 4 depends on for its type inference engine. `npm create vite` scaffolds with TS 5.x by default — verify `"typescript": "^5.5.0"` in `package.json`.

---

## Styling

### Tailwind CSS v4 + `@tailwindcss/vite`

Tailwind v4 ships a dedicated Vite plugin that replaces PostCSS. Use it — it's faster and eliminates a dependency layer.

```bash
npm install tailwindcss @tailwindcss/vite
```

`vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

`src/index.css`:

```css
@import "tailwindcss";
```

No `tailwind.config.ts` is required for v4 — configuration moves into CSS via `@theme` directives. Do not install `@tailwindcss/postcss` alongside `@tailwindcss/vite`; they conflict.

---

## PWA

### vite-plugin-pwa 1.3.0

**CRITICAL CONSTRAINT:** Because this project uses Firebase Cloud Messaging (FCM) push notifications, you cannot use the default `generateSW` strategy. You must use `injectManifest` and write your own service worker. If you use `generateSW`, vite-plugin-pwa creates a service worker AND FCM requires its own `firebase-messaging-sw.js` — having two competing service workers causes a reload loop that is the most commonly reported breakage in this combination.

```bash
npm install -D vite-plugin-pwa
npm install workbox-precaching workbox-routing
```

`vite.config.ts` addition:

```typescript
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  strategies: 'injectManifest',    // REQUIRED for FCM
  srcDir: 'src',
  filename: 'sw.ts',               // your custom service worker
  manifest: {
    name: 'Reveal',
    short_name: 'Reveal',
    description: 'Share what reminded you of them today',
    theme_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  devOptions: {
    enabled: false,   // keep off in dev unless debugging SW behaviour
  },
})
```

`src/sw.ts` (your unified service worker):

```typescript
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Firebase config must be literal here — import.meta.env is NOT available in SW context
const firebaseConfig = {
  apiKey: '__FIREBASE_API_KEY__',      // use Vite define plugin to inject these
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

onBackgroundMessage(messaging, (payload) => {
  self.registration.showNotification(
    payload.notification?.title ?? 'Reveal',
    { body: payload.notification?.body, icon: '/icons/icon-192.png' }
  )
})
```

Inject Firebase config at build time using Vite's `define` in `vite.config.ts`:

```typescript
define: {
  '__FIREBASE_API_KEY__': JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
  // ... etc
}
```

**iOS Safari Requirements:**

The following must be present in `index.html` `<head>` or vite-plugin-pwa will not meet installability criteria on iOS:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#ffffff">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
<link rel="mask-icon" href="/icons/mask-icon.svg" color="#ffffff">
```

**iOS PWA Runtime Constraints (non-negotiable):**

- Service worker cache expires after 7 days if the app is not opened. Design the shell to re-fetch gracefully.
- IndexedDB/Cache storage capped at 50MB. Keep image uploads client-side compressed before storing.
- Push notifications require iOS 16.4+. Users in EU regions on iOS 17.4+ cannot receive PWA push notifications (Apple DMA compliance restriction — nothing you can do about it).
- Background Sync, Periodic Background Sync, and Background Fetch are all unavailable on iOS. Sync-on-open only.

---

## Firebase

### Firebase JS SDK — firebase@12.18.0

Use the modular (tree-shakable) import syntax everywhere. The compat layer (`firebase/compat/*`) was officially dropped in v10 and does not exist in v12. Do not install it. Bundle size with full compat is ~80% larger.

```bash
npm install firebase
```

Correct pattern:

```typescript
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { getAuth, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth'
```

Wrong pattern (do not use):

```typescript
import firebase from 'firebase/app'          // compat — does not exist in v12
import 'firebase/firestore'                   // namespace SDK — does not exist in v12
```

### Firebase Auth — Google Sign-In on Mobile Safari

This is the most dangerous gotcha in the entire stack for this project.

**The problem:** Both `signInWithPopup` and `signInWithRedirect` are broken in iOS Safari standalone PWA mode when `authDomain` is the default Firebase subdomain (`your-project.firebaseapp.com`).

- `signInWithRedirect` fails because Safari 16.1+ blocks the cross-origin iframe that Firebase uses to bridge state across the redirect. This became mandatory-to-fix on June 24 2024.
- `signInWithPopup` fails in standalone PWA mode because the popup opens in a new Safari session that does not return to the app.

**The fix (Option 1 — recommended since this project uses Firebase Hosting):**

Set `authDomain` in `firebaseConfig` to your actual custom domain:

```typescript
const firebaseConfig = {
  authDomain: 'app.yoursite.com',    // NOT your-project.firebaseapp.com
  // ...
}
```

Then in Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 client, add:

```
https://app.yoursite.com/__/auth/handler
```

as an authorized redirect URI. Firebase Hosting serves this handler from its CDN automatically.

With this configuration, `signInWithRedirect` works correctly on all platforms including iOS Safari standalone mode, because there is no longer a cross-origin mismatch — the auth handler is on the same origin as the app.

**Fallback (if custom domain is not yet configured):** Use Google Identity Services (GIS) to acquire a credential independently, then exchange it:

```typescript
// Using Google GIS library (loaded separately)
const idToken = await getGoogleIdToken()
const credential = GoogleAuthProvider.credential(idToken)
await signInWithCredential(auth, credential)
```

This avoids both popup and redirect entirely. Add as a fallback only — the custom authDomain approach is cleaner.

### Firebase Cloud Functions — Use v2 Exclusively

v2 (Cloud Run-backed) is the recommended default for all new functions as of 2024. Choose it for every function in this project.

**Why v2 for this project specifically:**

- Pair-join validation (enforce exactly 2 members) → callable onCall v2 function with concurrency = 1 or Firestore transaction; the 1000 concurrent requests per instance behaviour is fine here.
- Reveal state transitions (auto-reveal, reveal-anyway) → callable onCall v2 function.
- Firestore triggers (auto-reveal when second submission lands) → onDocumentWritten v2 trigger.

v1 is only still needed for Firebase Analytics triggers and basic (non-blocking) Auth triggers. Neither applies here.

**v2 function scaffold:**

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

export const joinPair = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  // ... pair join logic
})

export const onEntryWritten = onDocumentWritten(
  'pairs/{pairId}/entries/{entryId}',
  async (event) => {
    // ... auto-reveal check
  }
)
```

---

## Validation

### Zod 4

Zod 4 is stable (released mid-2025). For a new project starting now, use v4 directly. The API is not backwards compatible with v3 in several places.

```bash
npm install zod
```

**Breaking changes vs Zod 3 to be aware of:**

| v3 | v4 |
|----|----|
| `z.string().email()` | `z.email()` |
| `z.string().url()` | `z.url()` |
| Multiple error params | Single `error` param |
| `schema.flatten()` | `z.flattenError(schema)` |

**Pattern for Firestore data:**

```typescript
import { z } from 'zod'
import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'

const EntrySchema = z.object({
  uid: z.string(),
  submittedAt: z.number(),           // Firestore Timestamp → toMillis() before storing
  photoPath: z.string().optional(),
  text: z.string().optional(),
  revealed: z.boolean(),
  revealedAt: z.number().optional(),
  revealedBy: z.string().optional(),
  revealReason: z.enum(['auto', 'manual']).optional(),
})

type Entry = z.infer<typeof EntrySchema>

async function getEntry(pairId: string, entryId: string): Promise<Entry> {
  const snap = await getDoc(doc(db, 'pairs', pairId, 'entries', entryId))
  if (!snap.exists()) throw new Error('Entry not found')
  return EntrySchema.parse(snap.data())    // throws ZodError if shape is wrong
}
```

**Important:** Firestore `Timestamp` objects should be converted to milliseconds (`ts.toMillis()`) before writing, so schemas stay JSON-serialisable and testable without the Firestore SDK.

---

## Testing

### Vitest + React Testing Library

Vitest is the natural choice for Vite projects — it shares the same config, supports `import.meta.env`, and has near-identical Jest API.

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

`vite.config.ts` test block:

```typescript
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
  },
}
```

`src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

`tsconfig.json` — add to compiler options:

```json
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

**For Firestore unit tests:** Use the `@firebase/rules-unit-testing` package against the Emulator, not mocks. Mocking Firestore is expensive to maintain and misses rule enforcement. Write unit tests against real emulated Firestore for data-layer logic.

### Playwright E2E + Firebase Emulator

Firebase Emulator handles auth, Firestore, Storage, and Functions. Start it before your E2E suite runs.

**Pattern for bypassing Google OAuth in E2E tests:**

The Firebase Auth Emulator accepts `signInWithCustomToken` with a token generated by the Admin SDK — no real Google account required.

```typescript
// playwright/global-setup.ts
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const adminApp = initializeApp({ credential: cert('./service-account.json') })

export async function createTestToken(uid: string): Promise<string> {
  return getAuth(adminApp).createCustomToken(uid)
}
```

```typescript
// playwright/fixtures.ts
import { test as base } from '@playwright/test'

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    const token = await createTestToken('test-user-alice')
    await page.goto('/')
    await page.evaluate(async (token) => {
      const { initializeApp } = await import('firebase/app')
      const { getAuth, signInWithCustomToken } = await import('firebase/auth')
      const auth = getAuth(initializeApp(window.__FIREBASE_CONFIG__))
      await signInWithCustomToken(auth, token)
    }, token)
    await use(page)
  },
})
```

Point the app at the emulator by setting environment variables before the Playwright process:

```
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

And in `firebase.ts`:

```typescript
if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST) {
  connectAuthEmulator(auth, `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
```

Alternatively, `@nearform/playwright-firebase` wraps this pattern into a plugin if you prefer less boilerplate.

---

## Package Manager

npm (per project constraint). No other package managers.

---

## Installation — Full Dependency Manifest

```bash
# App dependencies
npm install react@19 react-dom@19 react-router-dom firebase zod

# Dev — build
npm install -D vite@6 @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite vite-plugin-pwa

# Dev — PWA service worker
npm install -D workbox-precaching workbox-routing

# Dev — testing (unit)
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

# Dev — testing (E2E)
npm install -D playwright @playwright/test

# Dev — Firebase security rules testing
npm install -D @firebase/rules-unit-testing firebase-admin
```

---

## Conflicts and Gotchas

### 1. Two Service Workers Will Destroy Your PWA

**Symptom:** App reloads in an infinite loop after deployment.

**Cause:** vite-plugin-pwa's default `generateSW` strategy creates a service worker. FCM also requires a service worker. Two competing service workers on the same scope causes continuous update loops.

**Fix:** Use `strategies: 'injectManifest'` and write one service worker that handles both Workbox precaching and FCM background messages. This is non-negotiable.

### 2. `import.meta.env` Is Undefined in Service Workers

**Symptom:** Firebase initialisation in SW throws because config values are undefined.

**Cause:** Service workers run in a separate context — Vite's `import.meta.env` substitution does not apply.

**Fix:** Use `define` in `vite.config.ts` to inject literal values at build time. Do not attempt to read env vars in service worker code.

### 3. Firebase Auth Redirect Broken on iOS Safari Standalone

**Symptom:** `signInWithRedirect` silently fails or hangs; `signInWithPopup` opens a window that never returns to the PWA.

**Cause:** Safari 16.1+ blocks the cross-origin iframe Firebase uses for state bridging when `authDomain` is `*.firebaseapp.com`. iOS standalone mode isolates storage per-window, so the popup approach has no way to communicate back.

**Fix:** Set `authDomain` in your Firebase config to your own custom domain served via Firebase Hosting. Add `https://yourdomain/__/auth/handler` to Google OAuth redirect URIs. This is a configuration change, not a code change.

### 4. Tailwind v4 PostCSS Conflict

**Symptom:** Build errors or styles not applying when both `@tailwindcss/vite` and `@tailwindcss/postcss` are installed.

**Cause:** The v4 Vite plugin and PostCSS plugin do the same job by different mechanisms and conflict.

**Fix:** Install only `@tailwindcss/vite`. Do not install `@tailwindcss/postcss`, `postcss`, or `autoprefixer` — v4 Vite plugin needs none of them.

### 5. Zod 4 Requires TypeScript 5.5+

**Symptom:** Type errors on Zod schema inference.

**Cause:** Zod 4 uses inferred type predicates, a TS 5.5 feature.

**Fix:** Ensure `package.json` has `"typescript": ">=5.5.0"` and `tsconfig.json` targets `"lib": ["ES2022"]` or newer.

### 6. iOS 7-Day Cache Expiry Breaks Offline Mode

**Symptom:** App fails to load offline for users who haven't opened it in a week.

**Cause:** Safari aggressively evicts service worker caches after 7 days of non-use.

**Fix:** The offline shell is a best-effort convenience for active users. Document this constraint. Design the app to always show a meaningful "You're offline" state rather than a blank screen.

### 7. vite-plugin-pwa devOptions

**Symptom:** PWA features appear broken in development but work in production build.

**Cause:** vite-plugin-pwa only activates the service worker in production builds by default. `devOptions: { enabled: true }` enables it in dev but can cause confusing cache behaviour.

**Fix:** Leave `devOptions.enabled: false` for day-to-day development. Run `npm run build && npm run preview` to test actual PWA behaviour including service worker and FCM.

---

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

---

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
