import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // ONLY the Vite plugin — do NOT install @tailwindcss/postcss
    VitePWA({
      registerType: 'autoUpdate',
      // REQUIRED: injectManifest prevents the dual-SW FCM infinite reload loop.
      // generateSW + firebase-messaging-sw.js = two SWs on same scope = reload loop.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      devOptions: {
        enabled: false, // Enable only when actively debugging the service worker
      },
      manifest: {
        name: 'Reveal',
        short_name: 'Reveal',
        description: 'Share what reminded you of them today',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  // Firebase config injected as build-time constants.
  // CRITICAL: import.meta.env is undefined in service worker scope.
  // These __FIREBASE_*__ literals are substituted at build time so sw.ts can
  // access Firebase config without import.meta.env (RESEARCH.md Pitfall 2).
  define: {
    __FIREBASE_API_KEY__: JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
    __FIREBASE_AUTH_DOMAIN__: JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    __FIREBASE_PROJECT_ID__: JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
    __FIREBASE_STORAGE_BUCKET__: JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    ),
    __FIREBASE_APP_ID__: JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
  },
})
