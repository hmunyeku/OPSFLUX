import { test, expect } from '@playwright/test'

/**
 * Visual regression tests.
 *
 * These capture screenshots and compare them to baseline images.
 * On first run, baselines are generated in e2e/__screenshots__/.
 * Subsequent runs diff against baselines to detect UI regressions.
 *
 * Run with: npx playwright test visual.spec.ts --update-snapshots
 * to regenerate baselines after intentional UI changes.
 *
 * Note: In CI, run with --ignore-snapshots since baselines are
 * platform-dependent and not committed to the repo.
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
})
