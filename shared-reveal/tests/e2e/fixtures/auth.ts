import { test as base, type Page } from '@playwright/test'
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? 'birds-eye-c09ff'
const AUTH_EMULATOR = `http://${process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`
export const TEST_UID_01 = 'e2e-test-user-01'
export const TEST_UID_02 = 'e2e-test-user-02'

async function signInAsTestUser(page: Page, uid = TEST_UID_01): Promise<void> {
  // Initialize Admin SDK pointed at the Auth emulator.
  const existing = getApps().find((a) => a.name === '[E2E]')
  if (existing) await deleteApp(existing)

  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
  const adminApp = initializeApp({ projectId: PROJECT_ID }, '[E2E]')
  const customToken = await getAuth(adminApp).createCustomToken(uid)
  await deleteApp(adminApp)

  // Navigate to app root so Firebase client SDK is loaded.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Use the dev-only window.__testSignIn hook (wired in main.tsx).
  // The app's auth instance is already emulator-connected via VITE_FIREBASE_AUTH_EMULATOR_HOST,
  // so no extra emulator wiring is needed here.
  await page.evaluate((token: string) => (window as any).__testSignIn(token), customToken)

  // Wait for React router to land on an authenticated screen.
  // After Phase 2 route guard: unpaired users land on /pair-setup, paired on /home.
  await page.waitForURL(/\/(pair-setup|home)/, { timeout: 10_000 })
}

export const test = base.extend<{ authenticatedPage: Page; secondAuthenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await signInAsTestUser(page)
    await use(page)
  },
  secondAuthenticatedPage: async ({ browser }, use) => {
    const page = await browser.newPage()
    await signInAsTestUser(page, TEST_UID_02)
    await use(page)
    await page.close()
  },
})

export { expect } from '@playwright/test'
