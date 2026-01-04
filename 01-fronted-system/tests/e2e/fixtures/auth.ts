/**
 * Authentication Fixture for E2E Tests
 *
 * Provides authenticated browser context for tests
 */

import { test as base, expect, Page } from '@playwright/test'
import { TEST_USER } from './test-credentials'

// Extend the base test with authenticated page
export const test = base.extend<{ authenticatedPage: Page; orgSlug: string }>({
  // Provide authenticated page context
  authenticatedPage: async ({ page }, use) => {
    // Login
    await page.goto('/login')

    // Wait for page to load
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })

    // Fill in credentials
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)

    // Click sign in button
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard or org selector
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 })

    // Handle org selector if present
    const currentUrl = page.url()
    if (currentUrl.includes('/org-select')) {
      // Select the first organization
      await page.click('[data-testid="org-card"]:first-child')
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
    }

    // Provide the authenticated page to tests
    await use(page)
  },

  // Extract org slug from URL
  orgSlug: async ({ authenticatedPage }, use) => {
    const url = authenticatedPage.url()
    const match = url.match(/\/([^/]+)\/dashboard/)
    const slug = match ? match[1] : 'test_org'
    await use(slug)
  },
})

export { expect }

/**
 * Helper to login and get the org slug
 */
export async function loginAndGetOrgSlug(page: Page): Promise<string> {
  // Login
  await page.goto('/login')

  // Wait for page to load
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  // Fill in credentials
  await page.fill('input[type="email"]', TEST_USER.email)
  await page.fill('input[type="password"]', TEST_USER.password)

  // Click sign in button
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard or org selector
  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 })

  // Handle org selector if present
  const currentUrl = page.url()
  if (currentUrl.includes('/org-select')) {
    // Select the first organization
    await page.click('[data-testid="org-card"]:first-child')
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
  }

  // Extract org slug from URL
  const url = page.url()
  const match = url.match(/\/([^/]+)\/dashboard/)
  return match ? match[1] : 'test_org'
}

/**
 * Helper to wait for a success message
 */
export async function waitForSuccessMessage(page: Page, timeout = 10000) {
  await page.waitForSelector('[class*="bg-"][class*="90FCA6"], [class*="success"], [role="alert"]:has-text("Success")', {
    timeout,
  })
}

/**
 * Helper to wait for an error message
 */
export async function waitForErrorMessage(page: Page, timeout = 10000) {
  await page.waitForSelector('[class*="bg-"][class*="FF6C5E"], [class*="error"], [class*="destructive"], [role="alert"]:has-text("Error")', {
    timeout,
  })
}

/**
 * Helper to navigate to integrations page
 */
export async function navigateToIntegrations(page: Page, orgSlug: string, type: 'genai' | 'cloud-providers' | 'subscriptions') {
  await page.goto(`/${orgSlug}/integrations/${type}`)
  // Use domcontentloaded instead of networkidle for Next.js apps with WebSocket connections
  await page.waitForLoadState('domcontentloaded')
  // Give the page a moment to hydrate
  await page.waitForTimeout(2000)
}
