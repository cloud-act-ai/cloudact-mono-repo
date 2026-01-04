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

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
