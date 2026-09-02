// E2E stubs — marked test.fail() until Wave 3 (pair UI) is complete
import { test, expect } from './fixtures/auth'

test.fail('User A creates pair and receives 6-char invite code', async ({ authenticatedPage: page }) => {
  await page.waitForURL(/\/pair-setup/, { timeout: 10_000 })
  await page.getByRole('button', { name: /create a pair/i }).click()
  await expect(page.getByText(/[A-F0-9]{6}/)).toBeVisible()
})

test.fail(
  'User B joins pair and both users redirect to /home',
  async ({ authenticatedPage: pageA, secondAuthenticatedPage: pageB }) => {
    await pageA.waitForURL(/\/pair-setup/, { timeout: 10_000 })
    await pageA.getByRole('button', { name: /create a pair/i }).click()
    const codeEl = pageA.getByText(/[A-F0-9]{6}/)
    await expect(codeEl).toBeVisible()
    const code = await codeEl.textContent()

    await pageB.waitForURL(/\/pair-setup/, { timeout: 10_000 })
    await pageB.getByRole('textbox').fill(code ?? '')

    await expect(pageA).toHaveURL(/\/home/, { timeout: 15_000 })
    await expect(pageB).toHaveURL(/\/home/, { timeout: 15_000 })
  },
)

test.fail(
  'Third user is rejected when pair is full',
  async ({ authenticatedPage: pageA, secondAuthenticatedPage: pageB }) => {
    await pageA.waitForURL(/\/pair-setup/, { timeout: 10_000 })
    await pageA.getByRole('button', { name: /create a pair/i }).click()
    const codeEl = pageA.getByText(/[A-F0-9]{6}/)
    await expect(codeEl).toBeVisible()
    const code = await codeEl.textContent()

    await pageB.waitForURL(/\/pair-setup/, { timeout: 10_000 })
    await pageB.getByRole('textbox').fill(code ?? '')
    await expect(pageB).toHaveURL(/\/home/, { timeout: 15_000 })

    // Third user attempts the same code (PAIR-04)
    const TEST_UID_03 = 'e2e-test-user-03'
    const pageC = await pageA.context().browser()!.newPage()
    try {
      await pageC.goto('/')
      await pageC.waitForLoadState('networkidle')
      await pageC.evaluate(
        async ({ emulatorUrl }: { emulatorUrl: string }) => {
          const { initializeApp, getApps } = await import('firebase/app')
          const { getAuth, connectAuthEmulator } = await import('firebase/auth')
          const app = getApps()[0] ?? initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID })
          const auth = getAuth(app)
          if (!(auth as any)._delegate?.emulatorConfig) {
            connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true })
          }
        },
        { emulatorUrl: `http://${process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}` },
      )
      await pageC.waitForURL(/\/pair-setup/, { timeout: 10_000 })
      await pageC.getByRole('textbox').fill(code ?? '')
      await expect(pageC.getByText(/pair is full|already used|invalid/i)).toBeVisible()
    } finally {
      await pageC.close()
    }
  },
)
