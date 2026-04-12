import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for OpsFlux.
 *
 * - Runs against Vite dev server on port 5173
 * - Backend API is expected at localhost:8000 (proxied by Vite)
 * - CI uses the built preview server instead
 *
 * Cross-browser: Chromium, Firefox, and WebKit (Safari) are all tested.
 * Mobile viewport is also covered via Mobile Chrome.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* Start a local server before running tests.
     - Local dev: Vite dev server on port 5173
     - CI: Vite preview (serves the built dist/) on port 4173 */
  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
  },
})
