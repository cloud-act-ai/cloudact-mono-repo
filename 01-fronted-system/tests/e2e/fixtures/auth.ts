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
  await page.waitForLoadState('domcontentloaded')

  // Wait for page to load - email input should be visible
  await page.waitForSelector('input[type="email"], input[placeholder*="email"]', { timeout: 15000 })

  // Small wait for page to stabilize
  await page.waitForTimeout(500)

  // Fill in credentials - use type instead of fill for more reliable input
  const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()

  await emailInput.clear()
  await emailInput.type(TEST_USER.email)
  await passwordInput.clear()
  await passwordInput.type(TEST_USER.password)

  // Wait a moment for any validation
  await page.waitForTimeout(300)

  // Click sign in button
  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first()
  await submitButton.click()

  // Wait for redirect to dashboard or org selector
  try {
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 45000 })
  } catch {
    // If redirect didn't happen, check if there's an error or we're still on login
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      // Try clicking submit again
      await page.waitForTimeout(1000)
      const errorText = await page.locator('[role="alert"], .error, text=Invalid').isVisible()
      if (errorText) {
        throw new Error('Login failed - invalid credentials or error shown')
      }
      await submitButton.click()
      await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 })
    }
  }

  // Handle org selector if present
  const currentUrl = page.url()
  if (currentUrl.includes('/org-select')) {
    // Wait for org cards to load
    await page.waitForTimeout(1000)
    // Select the first organization
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first()
    await orgCard.click()
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
  // Wait for any loading spinners to disappear
  await waitForLoadingToComplete(page)
}

/**
 * Helper to wait for loading states to complete
 */
export async function waitForLoadingToComplete(page: Page, timeout = 30000) {
  try {
    // Wait for any loading text that contains "Loading" to disappear
    const loadingLocator = page.locator('text=/Loading.*/')
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const isLoading = await loadingLocator.isVisible({ timeout: 1000 }).catch(() => false)
      if (!isLoading) {
        break
      }
      // Wait a bit before checking again
      await page.waitForTimeout(500)
    }
  } catch {
    // No loading state found or timeout, continue
  }
  // Give the content a moment to render
  await page.waitForTimeout(2000)
}

/**
 * Helper to wait for provider cards to load
 */
export async function waitForProviderCards(page: Page, timeout = 60000) {
  try {
    // First wait for loading to complete
    await waitForLoadingToComplete(page, timeout)

    // Then wait for provider cards or links to appear
    await page.waitForSelector('a[href*="/genai/"], a[href*="/cloud-providers/"], a[href*="/subscriptions/"]', {
      timeout,
      state: 'visible'
    })
  } catch {
    // Cards may not exist if no providers configured
    console.log('Provider cards not found, may be empty state')
  }
}
