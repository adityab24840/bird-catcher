/**
 * Firebase client configuration.
 *
 * SEC-08: authDomain MUST be the custom Firebase Hosting domain read from
 * VITE_FIREBASE_AUTH_DOMAIN (e.g., birds-eye-c09ff.web.app). Using the
 * default project subdomain breaks signInWithRedirect in iOS Safari
 * standalone mode — Safari blocks the cross-origin iframe used for
 * redirect auth state bridging.
 *
 * Emulator wiring: when VITE_FIREBASE_AUTH_EMULATOR_HOST is set (local dev),
 * traffic is routed to the local emulator suite instead of production Firebase.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  connectFirestoreEmulator,
} from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'
// App Check disabled until Phase 6 security hardening (reCAPTCHA site key not yet configured)
// import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // CRITICAL (SEC-08): custom Hosting domain from env — read VITE_FIREBASE_AUTH_DOMAIN
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// AUTH-03: persistentLocalCache uses IndexedDB for offline persistence and
// restores the session across page refreshes and PWA reinstalls.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({}),
})


export const functions = getFunctions(app)

export const storage = getStorage(app)

// FCM messaging — not available in all environments (Node.js, old browsers).
// Returns null when unsupported; callers must handle null.
let _messaging: Messaging | null = null
export async function getMessagingInstance(): Promise<Messaging | null> {
  if (_messaging) return _messaging
  const supported = await isSupported()
  if (!supported) return null
  _messaging = getMessaging(app)
  return _messaging
}

// Connect to local emulators when the env var is set.
// VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
// VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST) {
  connectAuthEmulator(
    auth,
    `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`,
    { disableWarnings: true }
  )
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}
