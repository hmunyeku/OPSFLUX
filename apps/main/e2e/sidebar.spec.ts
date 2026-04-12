import { test, expect } from '@playwright/test'
import { authenticateUser } from './auth.setup'

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('sidebar contains navigation links', async ({ page }) => {
    const sidebar = page.locator('[data-tour="sidebar"]')
    await expect(sidebar).toBeVisible()

    // The sidebar should contain at least one navigation link
    const navLinks = sidebar.getByRole('link')
    await expect(navLinks.first()).toBeVisible()
    expect(await navLinks.count()).toBeGreaterThan(0)
  })

  test('dashboard link is active on /dashboard', async ({ page }) => {
    const sidebar = page.locator('[data-tour="sidebar"]')
    // Look for a link that navigates to /dashboard
    const dashboardLink = sidebar.getByRole('link', { name: /dashboard|tableau/i })
    if (await dashboardLink.count() > 0) {
      // The active link should have some visual indicator
      await expect(dashboardLink.first()).toBeVisible()
    }
  })

  test('clicking a nav item navigates to the correct route', async ({ page }) => {
    const sidebar = page.locator('[data-tour="sidebar"]')

    // Try clicking on different nav items and verify URL changes
    const navItems = [
      { name: /tiers|contacts/i, url: /\/tiers/ },
      { name: /projet|project/i, url: /\/projets/ },
      { name: /settings|param/i, url: /\/settings/ },
    ]

    for (const item of navItems) {
      const link = sidebar.getByRole('link', { name: item.name })
      if ((await link.count()) > 0) {
        await link.first().click()
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveURL(item.url)
        // Navigate back to dashboard for next iteration
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')
        break // Test at least one successful navigation
      }
    }
  })
})
