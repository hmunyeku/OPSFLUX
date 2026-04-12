import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('app loads without crashing', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()
  })

  test('page has a title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/.+/)
  })

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/login')
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Filter out known acceptable errors (e.g. failed API calls when no backend)
    const criticalErrors = errors.filter(
      (e) => !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('Failed to fetch')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
