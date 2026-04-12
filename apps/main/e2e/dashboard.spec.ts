import { test, expect } from '@playwright/test'
import { authenticateUser } from './auth.setup'

test.describe('Dashboard (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('loads the dashboard page', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
    // Should NOT redirect to /login
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('sidebar is visible', async ({ page }) => {
    const sidebar = page.locator('[data-tour="sidebar"]')
    await expect(sidebar).toBeVisible()
  })

  test('topbar is visible', async ({ page }) => {
    const topbar = page.locator('[data-tour="topbar"]')
    await expect(topbar).toBeVisible()
  })

  test('main content area is present', async ({ page }) => {
    const main = page.locator('[data-tour="main-content"]')
    await expect(main).toBeVisible()
  })

  test('search bar is accessible', async ({ page }) => {
    const searchBar = page.locator('[data-tour="search-bar"]')
    if (await searchBar.isVisible()) {
      await expect(searchBar).toBeEnabled()
    }
  })
})
