import { test, expect } from '@playwright/test'
import { authenticateUser } from './auth.setup'

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/dashboard')
  })

  test('authenticated user stays on dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page).not.toHaveURL(/\/login/)
  })
})
