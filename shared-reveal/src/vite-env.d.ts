/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Vite build-time constants injected via the `define` block in vite.config.ts.
// These replace import.meta.env in service worker scope (import.meta.env is undefined in SW).
declare const __FIREBASE_API_KEY__: string
declare const __FIREBASE_AUTH_DOMAIN__: string
declare const __FIREBASE_PROJECT_ID__: string
declare const __FIREBASE_STORAGE_BUCKET__: string
declare const __FIREBASE_MESSAGING_SENDER_ID__: string
declare const __FIREBASE_APP_ID__: string
