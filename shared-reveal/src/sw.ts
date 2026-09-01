/**
 * Unified service worker for Reveal.
 *
 * This is the single service worker that handles:
 *   1. Workbox precaching (all static assets injected by vite-plugin-pwa at build time)
 *   2. Firebase Storage fetch exclusion (uploads must bypass SW interception)
 *   3. [FCM slot] onBackgroundMessage handler — wired in Phase 5 (Notifications)
 *
 * Strategy: injectManifest (REQUIRED — generateSW + FCM would create two SWs on the
 * same scope, causing an infinite reload loop — RESEARCH.md Pitfall 3 / Pitfall 6).
 *
 * NOTE: import.meta.env is undefined in this context. Firebase config is received as
 * build-time constants via the Vite `define` block (__FIREBASE_*__ identifiers).
 */

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope
declare const __FIREBASE_API_KEY__: string
declare const __FIREBASE_AUTH_DOMAIN__: string
declare const __FIREBASE_PROJECT_ID__: string
declare const __FIREBASE_STORAGE_BUCKET__: string
declare const __FIREBASE_MESSAGING_SENDER_ID__: string
declare const __FIREBASE_APP_ID__: string

// vite-plugin-pwa injectManifest replaces __WB_MANIFEST at build time with
// the array of precache entries for the current build's hashed assets.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Skip waiting immediately so new SW takes control without requiring all tabs to close.
// Safe for this app — single-user PWA, no multi-tab coordination needed.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// CRITICAL: Exclude Firebase Storage from service worker interception.
// Without this guard, `uploadBytesResumable` stalls at 0% progress on iOS Safari
// because the SW intercepts the multipart upload protocol requests and breaks
// the upload state machine (RESEARCH.md Pitfall 6 / PWA-05).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.hostname === 'firebasestorage.googleapis.com') {
    return // Pass through to network — do NOT cache or intercept Storage uploads
  }
  // All other fetch events are handled by the Workbox routes registered above.
})

// FCM: initialize Firebase app in SW scope using build-time constants
// (__FIREBASE_*__ injected by Vite define block — import.meta.env unavailable in SW).
const firebaseApp = initializeApp(
  {
    apiKey: __FIREBASE_API_KEY__,
    authDomain: __FIREBASE_AUTH_DOMAIN__,
    projectId: __FIREBASE_PROJECT_ID__,
    storageBucket: __FIREBASE_STORAGE_BUCKET__,
    messagingSenderId: __FIREBASE_MESSAGING_SENDER_ID__,
    appId: __FIREBASE_APP_ID__,
  },
  '[SW]',
)

onBackgroundMessage(getMessaging(firebaseApp), (payload) => {
  self.registration.showNotification(payload.notification?.title ?? 'Bird Eye', {
    body: payload.notification?.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/home' },
  })
})

// Open / focus the app when the user taps a push notification.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetUrl: string = (event.notification.data?.url as string) ?? '/home'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return (client as WindowClient).focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
