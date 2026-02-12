/**
 * Playwright Auth Setup
 *
 * Runs ONCE before all tests to:
 * 1. Check if an existing session is still valid (reuse if so)
 * 2. Login with test credentials if no valid session
 * 3. Save browser session (cookies + localStorage) to .auth/user.json
 * 4. Save org slug to .auth/org-slug.json
 *
 * All tests reuse this session - NO repeated logins, NO rate limiting.
 */

import { test as setup, expect } from '@playwright/test'
import { TEST_USER } from './fixtures/test-credentials'
import * as fs from 'fs'
import * as path from 'path'

const authDir = path.join(__dirname, '.auth')
const authFile = path.join(authDir, 'user.json')
const orgSlugFile = path.join(authDir, 'org-slug.json')

setup('authenticate', async ({ page }) => {
  // Ensure .auth directory exists
  fs.mkdirSync(authDir, { recursive: true })

  // Check if we already have a valid cached session
  const cachedSlug = getCachedOrgSlug()
  if (cachedSlug && fs.existsSync(authFile)) {
    // Load existing session and check if it's still valid
    const storageState = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
    await page.context().addCookies(storageState.cookies || [])

    await page.goto(`/${cachedSlug}/dashboard`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // If we're NOT on the login page, session is still valid - reuse it
    if (!page.url().includes('/login')) {
      // Re-save the session state (refreshes expiry)
      await page.context().storageState({ path: authFile })
      return
    }
  }

  // Session invalid or missing - perform fresh login
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

  // Check for lockout error before waiting for redirect
  await page.waitForTimeout(2000)
  const lockoutError = page.locator('text=/temporarily locked|rate limit|too many/i')
  if (await lockoutError.isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error('Account is temporarily locked from rate limiting. Wait a few minutes and try again.')
  }

  // Wait for redirect to dashboard or org selector
  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 45000 })

  // Handle org selector if present
  if (page.url().includes('/org-select')) {
    await page.waitForTimeout(1000)
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first()
    await orgCard.click()
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
  }

  // Extract org slug
  const match = page.url().match(/\/([^/]+)\/dashboard/)
  const orgSlug = match ? match[1] : 'test_org'

  // Save org slug for tests to read
  fs.writeFileSync(orgSlugFile, JSON.stringify({ orgSlug }))

  // Save authenticated session state
  await page.context().storageState({ path: authFile })
})

function getCachedOrgSlug(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(orgSlugFile, 'utf-8'))
    return data.orgSlug || null
  } catch {
    return null
  }
}
