import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

/**
 * Playwright E2E Test Configuration
 *
 * Tests integration flows for:
 * - GenAI providers (OpenAI, Anthropic, Gemini)
 * - Cloud providers (GCP)
 * - Subscription providers (multiple SaaS tools)
 *
 * Auth: Single login via auth.setup.ts, session reused by all tests.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Run tests serially to avoid session conflicts
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry failed tests
  retries: 1,

  // Use single worker to avoid auth conflicts
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',

    // Default timeout for actions
    actionTimeout: 30000,

    // Navigation timeout
    navigationTimeout: 60000,
  },

  // Timeout for each test
  timeout: 120000,

  // Configure projects: setup runs first, then chromium uses saved auth
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Auth tests run WITHOUT pre-loaded session (they test login flows)
    {
      name: 'auth-tests',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Account flow tests: no global storageState (login/signup tests need fresh browser)
    // Auth-required tests use test.use({ storageState }) per describe block in the spec file
    {
      name: 'account-noauth',
      testMatch: /account-flows\.spec\.ts/,
      testIgnore: [],
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'], // Needs .auth/user.json + .auth/org-slug.json
    },
    // All other tests use pre-authenticated session
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse authenticated session from setup
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.spec\.ts/, /account-flows\.spec\.ts/, /.*\.setup\.ts/],
    },
  ],

  // Run local dev server before starting the tests
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
