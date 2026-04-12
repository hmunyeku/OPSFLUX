/**
 * Authentication helper for E2E tests.
 *
 * The OpsFlux auth store checks `localStorage.getItem('access_token')`
 * on init to decide isAuthenticated. API calls that happen after load
 * (fetchUser, /me/entities) are intercepted by route-mocking so the
 * app thinks it's talking to a real backend.
 */
import { Page } from '@playwright/test'

/** Fake user object matching the backend User model. */
const MOCK_USER = {
  id: 'e2e-user-id',
  email: 'e2e@opsflux.com',
  first_name: 'E2E',
  last_name: 'Tester',
  role: 'admin',
  is_active: true,
  default_entity_id: 'e2e-entity',
  language: 'fr',
  permissions: [
    'dashboard:read',
    'assets:read',
    'tiers:read',
    'projects:read',
    'planner:read',
    'conformite:read',
    'settings:read',
    'users:read',
    'files:read',
    'imputations:read',
    'packlog:read',
    'paxlog:read',
    'travelwiz:read',
    'papyrus:read',
    'workflow:read',
  ],
}

const MOCK_ENTITY = {
  id: 'e2e-entity',
  name: 'E2E Test Entity',
  slug: 'e2e-test',
}

/**
 * Inject a fake auth session and mock the critical API endpoints
 * so protected routes can be tested without a running backend.
 */
export async function authenticateUser(page: Page) {
  // Mock API responses BEFORE navigating so the app never hits a real server
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }),
  )
  await page.route('**/api/v1/auth/me/entities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_ENTITY]) }),
  )
  await page.route('**/api/v1/modules', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { slug: 'assets', enabled: true },
        { slug: 'tiers', enabled: true },
        { slug: 'projects', enabled: true },
        { slug: 'planner', enabled: true },
        { slug: 'conformite', enabled: true },
        { slug: 'paxlog', enabled: true },
        { slug: 'travelwiz', enabled: true },
        { slug: 'packlog', enabled: true },
        { slug: 'imputations', enabled: true },
        { slug: 'papyrus', enabled: true },
        { slug: 'pid-pfd', enabled: true },
        { slug: 'workflow', enabled: true },
        { slug: 'files', enabled: true },
      ]),
    }),
  )
  // Catch-all for other API calls to prevent network errors
  await page.route('**/api/v1/**', (route) => {
    // Only intercept if not already handled above
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // Go to login page to set localStorage on the correct origin
  await page.goto('/login')

  // Inject tokens that the auth store reads on init
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlMmVAb3BzZmx1eC5jb20iLCJleHAiOjE5OTk5OTk5OTl9.fake')
    localStorage.setItem('refresh_token', 'e2e-mock-refresh-token')
    localStorage.setItem('entity_id', 'e2e-entity')
    localStorage.setItem('acting_context', 'own')
  })
}
