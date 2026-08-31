import { test, expect } from './fixtures/auth'

test('authenticated fixture lands on an authenticated screen', async ({ authenticatedPage: page }) => {
  await expect(page).toHaveURL(/\/(pair-setup|home)/)
})
