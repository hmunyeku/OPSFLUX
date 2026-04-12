import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Dismiss cookie consent if present
    const acceptBtn = page.getByRole('button', { name: /accepter|accept/i })
    if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptBtn.click()
    }
  })

  test('renders the login form', async ({ page }) => {
    // Email field (by placeholder or label)
    await expect(page.getByPlaceholder(/email|user@/i)).toBeVisible()
    // Password field
    await expect(page.locator('input[type="password"]')).toBeVisible()
    // Submit button
    await expect(page.getByRole('button', { name: /sign in|connexion|log in/i })).toBeVisible()
  })

  test('stays on login page on empty submit', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /sign in|connexion|log in/i })
    // Button may be disabled when fields are empty
    if (await submitBtn.isDisabled()) {
      await expect(page).toHaveURL(/\/login/)
    } else {
      await submitBtn.click()
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('has a forgot password link', async ({ page }) => {
    const link = page.getByRole('link', { name: /forgot|oublié/i })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('password field accepts input', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.fill('testpassword')
    await expect(passwordInput).toHaveValue('testpassword')
  })
})
