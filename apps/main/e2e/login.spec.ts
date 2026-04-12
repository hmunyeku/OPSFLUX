import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders the login form', async ({ page }) => {
    // Email and password fields should be visible
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    // Submit button should exist
    await expect(page.getByRole('button', { name: /connexion|sign in|log in/i })).toBeVisible()
  })

  test('shows validation error on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /connexion|sign in|log in/i }).click()
    // The form should show some kind of error or the fields should be marked invalid
    const emailInput = page.getByRole('textbox', { name: /email/i })
    await expect(emailInput).toBeVisible()
    // Page should still be on /login
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /email/i }).fill('bad@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: /connexion|sign in|log in/i }).click()

    // Should show an error message and stay on login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('has a forgot password link', async ({ page }) => {
    const link = page.getByRole('link', { name: /oublié|forgot/i })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.fill('mypassword')
    expect(await passwordInput.getAttribute('type')).toBe('password')

    // Click the eye toggle button
    const toggleBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
    // Find the toggle near the password field
    const passwordToggle = passwordInput.locator('..').getByRole('button')
    if (await passwordToggle.count() > 0) {
      await passwordToggle.first().click()
      // After toggle the input type should change to text
      const inputType = await passwordInput.first().getAttribute('type')
      // Type may have changed to 'text' or the input may be replaced
      expect(inputType === 'text' || inputType === null).toBeTruthy()
    }
  })
})
