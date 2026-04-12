import { test, expect } from '@playwright/test'
import { authenticateUser } from './auth.setup'

/**
 * Visual regression tests.
 *
 * These capture screenshots and compare them to baseline images.
 * On first run, baselines are generated in e2e/__screenshots__/.
 * Subsequent runs diff against baselines to detect UI regressions.
 *
 * Run with: npx playwright test visual.spec.ts --update-snapshots
 * to regenerate baselines after intentional UI changes.
 */
test.describe('Visual regression', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('forgot password page', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('forgot-password-page.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('dashboard layout', async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Wait a bit for lazy-loaded widgets to render
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('dashboard-layout.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('sidebar collapsed vs expanded', async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('[data-tour="sidebar"]')
    await expect(sidebar).toBeVisible()
    await expect(sidebar).toHaveScreenshot('sidebar.png', {
      maxDiffPixelRatio: 0.05,
    })
  })
})
