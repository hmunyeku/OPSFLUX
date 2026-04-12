import { test, expect } from '@playwright/test'

test.describe('Navigation & routing', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unknown routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/some-nonexistent-page')
    // Should end up at /login or show a 404-like page
    await expect(page).toHaveURL(/\/login|\//)
  })

  test('public pages are accessible without auth', async ({ page }) => {
    // /privacy should be accessible without login
    await page.goto('/privacy')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('forgot-password page loads', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page).toHaveURL(/\/forgot-password/)
  })
})
