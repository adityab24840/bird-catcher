import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import App from './App'
import { auth } from './firebase/config'
import { signInWithCustomToken } from 'firebase/auth'

// E2E test hook — dev-only, never shipped to production
if (import.meta.env.DEV) {
  ;(window as any).__testSignIn = (token: string) => signInWithCustomToken(auth, token)
}

// Register service worker with immediate activation.
// vite-plugin-pwa injectManifest strategy emits the compiled sw.ts as sw.js.
// devOptions.enabled is false so this is a no-op during `npm run dev`.
registerSW({ immediate: true })

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
