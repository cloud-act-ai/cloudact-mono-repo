/**
 * Authentication Fixture for E2E Tests
 *
 * With the setup project (auth.setup.ts), tests start pre-authenticated.
 * loginAndGetOrgSlug reads the cached org slug and verifies the session,
 * only falling back to a full login if the session is invalid.
 */

import { test as base, expect, Page } from '@playwright/test'
import { TEST_USER } from './test-credentials'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Read cached org slug from auth setup
 */
function getCachedOrgSlug(): string | null {
  try {
    const filePath = path.join(__dirname, '..', '.auth', 'org-slug.json')
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return data.orgSlug || null
  } catch {
    return null
  }
}

// Extend the base test with authenticated page
export const test = base.extend<{ authenticatedPage: Page; orgSlug: string }>({
  // Provide authenticated page context (session already loaded via storageState)
  authenticatedPage: async ({ page }, use) => {
    const cachedSlug = getCachedOrgSlug()
    if (cachedSlug) {
      // Session pre-loaded via storageState - just navigate to dashboard
      await page.goto(`/${cachedSlug}/dashboard`)
      await page.waitForLoadState('domcontentloaded')

      // Verify we're on the dashboard (not redirected to login)
      if (!page.url().includes('/login')) {
        await use(page)
        return
      }
    }

    // Fallback: full login (session expired or no cached slug)
    await page.goto('/login')
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 })

    if (page.url().includes('/org-select')) {
      await page.click('[data-testid="org-card"]:first-child')
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
    }

    await use(page)
  },

  // Extract org slug from cached value or URL
  orgSlug: async ({ authenticatedPage }, use) => {
    const cached = getCachedOrgSlug()
    if (cached) {
      await use(cached)
      return
    }
    const url = authenticatedPage.url()
    const match = url.match(/\/([^/]+)\/dashboard/)
    const slug = match ? match[1] : 'test_org'
    await use(slug)
  },
})

export { expect }

/**
 * Helper to get org slug (pre-authenticated via storageState).
 * Navigates to dashboard to verify session, falls back to login if needed.
 */
export async function loginAndGetOrgSlug(page: Page): Promise<string> {
  // Try cached org slug first
  const cachedSlug = getCachedOrgSlug()
  if (cachedSlug) {
    // Navigate to dashboard - storageState should keep us authenticated
    await page.goto(`/${cachedSlug}/dashboard`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // If we're NOT on the login page, session is valid
    if (!page.url().includes('/login')) {
      return cachedSlug
    }
  }

  // Fallback: full login (only if session expired)
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('input[type="email"], input[placeholder*="email"]', { timeout: 15000 })
  await page.waitForTimeout(500)

  const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()

  await emailInput.clear()
  await emailInput.type(TEST_USER.email)
  await passwordInput.clear()
  await passwordInput.type(TEST_USER.password)

  await page.waitForTimeout(300)

  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first()
  await submitButton.click()

  try {
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 45000 })
  } catch {
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      await page.waitForTimeout(1000)
      const errorText = await page.locator('[role="alert"]').or(page.locator('.error')).or(page.locator('text=Invalid')).isVisible()
      if (errorText) {
        throw new Error('Login failed - invalid credentials or error shown')
      }
      await submitButton.click()
      await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 })
    }
  }

  if (page.url().includes('/org-select')) {
    await page.waitForTimeout(1000)
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first()
    await orgCard.click()
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
  }

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
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)
  await waitForLoadingToComplete(page)
}

/**
 * Helper to wait for loading states to complete
 */
export async function waitForLoadingToComplete(page: Page, timeout = 30000) {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const loadingVisible = await page.locator('text=/Loading|Rendering|Please wait/i').first().isVisible({ timeout: 500 })

      if (!loadingVisible) {
        break
      }

      await page.waitForTimeout(1000)
    } catch {
      break
    }
  }

  await page.waitForTimeout(1500)
}

/**
 * Helper to wait for provider cards to load
 */
export async function waitForProviderCards(page: Page, timeout = 60000) {
  try {
    await waitForLoadingToComplete(page, timeout)

    await page.waitForSelector('a[href*="/genai/"], a[href*="/cloud-providers/"], a[href*="/subscriptions/"]', {
      timeout,
      state: 'visible'
    })
  } catch {
    console.log('Provider cards not found, may be empty state')
  }
}
