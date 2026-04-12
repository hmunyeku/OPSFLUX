import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for OpsFlux.
 *
 * - Runs against Vite dev server on port 5173
 * - Backend API is expected at localhost:8000 (proxied by Vite)
 * - CI uses the built preview server instead
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start Vite dev server before running tests (local dev only).
     In CI the server is started separately. */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: true,
      },
})
