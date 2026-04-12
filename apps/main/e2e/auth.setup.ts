/**
 * Authentication helper for E2E tests.
 *
 * Usage: import and call `authenticateUser(page)` in tests
 * that need an authenticated session.
 *
 * This mocks the auth state in localStorage/zustand so tests
 * don't depend on a running backend for basic UI tests.
 */
import { Page } from '@playwright/test'

/**
 * Inject a fake auth session into the app so protected routes
 * can be tested without a real backend.
 *
 * The tokens below are dummy values — they only need to look
 * plausible enough for the Zustand auth store to consider the
 * user "authenticated".
 */
export async function authenticateUser(page: Page) {
  // Navigate to the app first so we can set localStorage on the correct origin
  await page.goto('/login')

  // Inject a mock auth state matching the Zustand authStore shape
  await page.evaluate(() => {
    const mockAuthState = {
      state: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0QG9wc2ZsdXguY29tIiwiZXhwIjoxOTk5OTk5OTk5fQ.mock',
        refreshToken: 'mock-refresh-token',
        user: {
          id: 'test-user-id',
          email: 'test@opsflux.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'admin',
          is_active: true,
          entity_id: 'test-entity',
        },
        isAuthenticated: true,
        mfaPending: false,
      },
      version: 0,
    }
    localStorage.setItem('auth-storage', JSON.stringify(mockAuthState))
  })
}
