import { test, expect } from './fixtures/auth'

test('authenticated fixture lands on /home', async ({ authenticatedPage: page }) => {
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('Bird Eye')).toBeVisible()
})
