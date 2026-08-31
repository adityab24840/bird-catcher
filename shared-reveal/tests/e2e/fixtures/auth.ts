import { test as base, type Page } from '@playwright/test'
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'birds-eye-c09ff'
const AUTH_EMULATOR = 'http://127.0.0.1:9099'
const TEST_UID = 'e2e-test-user-01'

async function signInAsTestUser(page: Page): Promise<void> {
  // Initialize Admin SDK pointed at the Auth emulator.
  const existing = getApps().find((a) => a.name === '[E2E]')
  if (existing) await deleteApp(existing)

  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  const adminApp = initializeApp({ projectId: PROJECT_ID }, '[E2E]')
  const customToken = await getAuth(adminApp).createCustomToken(TEST_UID)
  await deleteApp(adminApp)

  // Navigate to app root so Firebase client SDK is loaded.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Inject signInWithCustomToken into the page context.
  // The app already connects the Auth client to the emulator when
  // VITE_FIREBASE_AUTH_EMULATOR_HOST is set (checked in firebase/config.ts).
  await page.evaluate(
    async ({ token, emulatorUrl }) => {
      const { initializeApp, getApps } = await import('firebase/app')
      const { getAuth, connectAuthEmulator, signInWithCustomToken } = await import('firebase/auth')

      // Re-use the existing Firebase app if already initialized by the page.
      const app = getApps()[0] ?? initializeApp({ projectId: 'birds-eye-c09ff' })
      const auth = getAuth(app)

      // Connect to emulator only if not already connected.
      if (!(auth as any)._delegate?.emulatorConfig) {
        connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true })
      }

      await signInWithCustomToken(auth, token)
    },
    { token: customToken, emulatorUrl: AUTH_EMULATOR },
  )

  // Wait for React router to land on /home after auth state resolves.
  await page.waitForURL('**/home', { timeout: 10_000 })
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await signInAsTestUser(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
