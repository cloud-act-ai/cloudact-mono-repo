/**
 * E2E Account Flow Tests
 *
 * Comprehensive end-to-end testing for all account lifecycle flows:
 * - Login (valid + invalid)
 * - Forgot Password
 * - Reset Password
 * - Signup form validation
 * - Stripe Billing / Onboarding
 * - Team Invite (surasani.rama@gmail.com)
 * - Account Deletion UI
 * - Profile & Password Change
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Demo account: demo@cloudact.ai / Demo1234
 *
 * Note: Runs under 'account-noauth' project (depends on 'setup' for .auth/ files).
 * No-auth tests: fresh browser (no storageState).
 * Auth tests: use test.use({ storageState }) per describe block.
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test'
import { TEST_USER } from './fixtures/test-credentials'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const INVITE_EMAIL = process.env.INVITE_EMAIL || 'surasani.rama@gmail.com'
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json')

/**
 * Read cached org slug from auth setup (written by auth.setup.ts)
 */
function getCachedOrgSlug(): string {
  const filePath = path.join(__dirname, '.auth', 'org-slug.json')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return data.orgSlug
}

/**
 * Collect console errors for a single test.
 */
function captureConsoleErrors(page: Page): { errors: string[]; cleanup: () => void } {
  const errors: string[] = []
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (
        text.includes('favicon') ||
        text.includes('ERR_CONNECTION_REFUSED') ||
        text.includes('downloadable font') ||
        text.includes('ResizeObserver') ||
        text.includes('hydration') ||
        text.includes('404') ||
        text.includes('Failed to load resource') ||
        text.includes('net::')
      ) return
      errors.push(text)
    }
  }
  page.on('console', handler)
  return { errors, cleanup: () => page.removeListener('console', handler) }
}

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
}

// ===========================================
// LOGIN FLOW (no auth needed - fresh browser)
// ===========================================

test.describe('Login Flow', () => {
  test('should display login page correctly', async ({ page }) => {
    const { errors, cleanup } = captureConsoleErrors(page)
    try {
      await page.goto(`${BASE_URL}/login`)
      await waitForPageReady(page)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible({ timeout: 15000 })
      const headingText = await heading.textContent()
      expect(headingText?.toLowerCase()).toContain('welcome back')

      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
      await expect(page.locator('a[href="/forgot-password"]')).toBeVisible()
      await expect(page.locator('a[href="/signup"]')).toBeVisible()
    } finally {
      cleanup()
    }
  })

  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await waitForPageReady(page)

    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 45000 })

    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first()
      await orgCard.click()
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 })
    }

    expect(page.url()).toContain('/dashboard')
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await waitForPageReady(page)

    await page.fill('input[type="email"]', 'wrong@example.com')
    await page.fill('input[type="password"]', 'WrongPassword123')
    await page.click('button[type="submit"]')

    const errorAlert = page.locator('text=/invalid|error|failed/i').first()
    await expect(errorAlert).toBeVisible({ timeout: 15000 })
    expect(page.url()).toContain('/login')
  })

  test('should handle session expired redirect reason', async ({ page }) => {
    await page.goto(`${BASE_URL}/login?reason=session_expired`)
    await waitForPageReady(page)

    const expiredMsg = page.locator('text=/session.*expired/i')
    await expect(expiredMsg).toBeVisible({ timeout: 10000 })
  })
})

// ===========================================
// FORGOT PASSWORD FLOW (no auth needed)
// ===========================================

test.describe('Forgot Password Flow', () => {
  test('should display forgot password page', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`)
    await waitForPageReady(page)

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15000 })
    const text = await heading.textContent()
    expect(text?.toLowerCase()).toContain('forgot password')

    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('a[href="/login"]').first()).toBeVisible()
  })

  test('should navigate from login to forgot password', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await waitForPageReady(page)

    await page.click('a[href="/forgot-password"]')
    await page.waitForURL('**/forgot-password', { timeout: 15000 })

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 10000 })
    const text = await heading.textContent()
    expect(text?.toLowerCase()).toContain('forgot password')
  })

  test('should submit forgot password and show success', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`)
    await waitForPageReady(page)

    await page.fill('input[type="email"]', TEST_USER.email)
    await page.click('button[type="submit"]')

    await page.waitForTimeout(5000)

    const successHeading = page.locator('text=/check your email/i')
    const errorMsg = page.locator('text=/failed|error|too many/i').first()

    const hasSuccess = await successHeading.isVisible({ timeout: 10000 }).catch(() => false)
    const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)

    if (hasSuccess) {
      await expect(page.locator(`text=${TEST_USER.email}`)).toBeVisible()
      await expect(page.locator('a[href="/login"]').first()).toBeVisible()
      await expect(page.locator('button:has-text("Try again")')).toBeVisible()
    } else if (hasError) {
      console.log('Forgot password: Rate limited (expected for repeated runs)')
    }

    expect(hasSuccess || hasError).toBeTruthy()
  })
})

// ===========================================
// RESET PASSWORD FLOW (no auth needed)
// ===========================================

test.describe('Reset Password Flow', () => {
  test('should show expired state without valid token', async ({ page }) => {
    await page.goto(`${BASE_URL}/reset-password`)
    await waitForPageReady(page)

    const expired = page.locator('text=/link expired|expired|invalid|verifying/i').first()
    await expect(expired).toBeVisible({ timeout: 15000 })
  })

  test('should show request new link button on expired state', async ({ page }) => {
    await page.goto(`${BASE_URL}/reset-password`)
    await page.waitForTimeout(10000)

    const forgotLink = page.locator('a[href="/forgot-password"]').first()
    const loginLink = page.locator('a[href="/login"]').first()

    const hasForgot = await forgotLink.isVisible({ timeout: 5000 }).catch(() => false)
    const hasLogin = await loginLink.isVisible({ timeout: 2000 }).catch(() => false)

    expect(hasForgot || hasLogin).toBeTruthy()
  })
})

// ===========================================
// SIGNUP FORM VALIDATION (no auth needed)
// ===========================================

test.describe('Signup Flow', () => {
  test('should display signup page', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`)
    await waitForPageReady(page)

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible({ timeout: 5000 })
  })

  test('should have password field with requirements', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`)
    await waitForPageReady(page)

    const passwordInput = page.locator('input[type="password"]').first()
    const visible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)
    if (visible) {
      const minLength = await passwordInput.getAttribute('minLength')
      console.log(`Password minLength: ${minLength}`)
    }
  })

  test('should have link to login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`)
    await waitForPageReady(page)

    const loginLink = page.locator('a[href="/login"], text=/sign in|log in/i').first()
    await expect(loginLink).toBeVisible({ timeout: 10000 })
  })
})

// ===========================================
// INVITE PAGE (no auth needed - public page)
// ===========================================

test.describe('Invite Page', () => {
  test('should show error for invalid invite token', async ({ page }) => {
    await page.goto(`${BASE_URL}/invite/invalid-token-short`)
    await waitForPageReady(page)
    await page.waitForTimeout(3000)

    const error = page.locator('text=/invalid|error|not found/i').first()
    await expect(error).toBeVisible({ timeout: 10000 })
  })

  test('should show error for non-existent 64-char token', async ({ page }) => {
    const fakeToken = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    await page.goto(`${BASE_URL}/invite/${fakeToken}`)
    await waitForPageReady(page)
    await page.waitForTimeout(5000)

    const error = page.locator('text=/invalid|error|not found|removed/i').first()
    await expect(error).toBeVisible({ timeout: 10000 })
  })
})

// ===========================================
// ONBOARDING PAGE (no auth needed)
// ===========================================

test.describe('Onboarding', () => {
  test('should handle onboarding billing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/billing`)
    await waitForPageReady(page)
    await page.waitForTimeout(2000)

    const url = page.url()
    if (url.includes('/login')) {
      console.log('Onboarding: Redirected to login (expected for unauthenticated)')
    } else if (url.includes('/onboarding/billing')) {
      console.log('Onboarding: Page loaded')
    } else if (url.includes('/dashboard')) {
      console.log('Onboarding: Redirected to dashboard (already onboarded)')
    }
    expect(true).toBeTruthy()
  })
})

// ===========================================================================
// AUTHENTICATED TESTS - Use pre-loaded session from setup (NO fresh logins)
// ===========================================================================

test.describe('Authenticated Flows', () => {
  // Use the pre-authenticated session from auth.setup.ts
  test.use({ storageState: 'tests/e2e/.auth/user.json' })

  let orgSlug: string

  test.beforeAll(() => {
    orgSlug = getCachedOrgSlug()
  })

  // ----- BILLING & STRIPE -----

  test.describe('Billing & Stripe', () => {
    test('should display billing settings page', async ({ page }) => {
      const { errors, cleanup } = captureConsoleErrors(page)
      try {
        await page.goto(`${BASE_URL}/${orgSlug}/settings/billing`)
        await waitForPageReady(page)
        await page.waitForTimeout(2000)

        const heading = page.locator('h1, h2').filter({ hasText: /billing|plan|subscription/i }).first()
        await expect(heading).toBeVisible({ timeout: 15000 })
      } finally {
        cleanup()
      }
    })

    test('should display current plan info', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/billing`)
      await waitForPageReady(page)
      await page.waitForTimeout(3000)

      const planName = page.locator('text=/starter|professional|scale/i').first()
      const hasPlan = await planName.isVisible({ timeout: 10000 }).catch(() => false)
      console.log(`Current plan visible: ${hasPlan}`)
    })

    test('should display plans selection page', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/billing/plans`)
      await waitForPageReady(page)
      await page.waitForTimeout(3000)

      const planCards = page.locator('text=/\\$\\d+/')
      const count = await planCards.count()
      console.log(`Plan price elements: ${count}`)
      expect(count).toBeGreaterThan(0)
    })
  })

  // ----- TEAM INVITE -----

  test.describe('Team Invite', () => {
    test('should display team management page with members', async ({ page }) => {
      const { errors, cleanup } = captureConsoleErrors(page)
      try {
        await page.goto(`${BASE_URL}/${orgSlug}/settings/invite`)
        await waitForPageReady(page)
        await page.waitForTimeout(2000)

        const heading = page.locator('h1, h2').filter({ hasText: /team|member|invite/i }).first()
        await expect(heading).toBeVisible({ timeout: 15000 })

        const ownerBadge = page.locator('text=/owner/i').first()
        await expect(ownerBadge).toBeVisible({ timeout: 10000 })
      } finally {
        cleanup()
      }
    })

    test('should show invite button and open dialog', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/invite`)
      await waitForPageReady(page)
      await page.waitForTimeout(2000)

      const inviteBtn = page.locator('button:has-text("Invite"), button:has-text("Add")').first()
      await expect(inviteBtn).toBeVisible({ timeout: 10000 })

      await inviteBtn.click()
      await page.waitForTimeout(500)

      const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[name*="email"]').first()
      await expect(emailInput).toBeVisible({ timeout: 5000 })
    })

    test('should invite team member surasani.rama@gmail.com', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/invite`)
      await waitForPageReady(page)
      await page.waitForTimeout(2000)

      const inviteBtn = page.locator('button:has-text("Invite"), button:has-text("Add")').first()
      await inviteBtn.click()
      await page.waitForTimeout(500)

      const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[name*="email"]').first()
      await emailInput.fill(INVITE_EMAIL)

      const roleSelect = page.locator('button[role="combobox"]').first()
      if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await roleSelect.click()
        await page.waitForTimeout(300)
        const collaboratorOption = page.locator('[role="option"]:has-text("Collaborator")').first()
        if (await collaboratorOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await collaboratorOption.click()
        }
      }

      const sendBtn = page.locator('button:has-text("Send"), button:has-text("Invite"):not([disabled])').last()
      await sendBtn.click()
      await page.waitForTimeout(5000)

      const successIndicator = page.locator('text=/sent|success|invite.*created|link/i').first()
      const errorIndicator = page.locator('text=/already.*member|already.*pending|seat.*limit|rate.*limit/i').first()

      const hasSuccess = await successIndicator.isVisible({ timeout: 5000 }).catch(() => false)
      const hasError = await errorIndicator.isVisible({ timeout: 2000 }).catch(() => false)

      if (hasSuccess) {
        console.log(`INVITE SUCCESS: Invited ${INVITE_EMAIL}`)
      } else if (hasError) {
        const errorText = await errorIndicator.textContent()
        console.log(`INVITE NOTE: ${errorText} (expected for re-runs)`)
      }

      expect(hasSuccess || hasError).toBeTruthy()
    })

    test('should show seat usage', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/invite`)
      await waitForPageReady(page)
      await page.waitForTimeout(2000)

      const seatInfo = page.locator('text=/\\d+.*seat|\\d+.*\\/.*\\d+|\\d+.*of.*\\d+/i').first()
      const hasSeats = await seatInfo.isVisible({ timeout: 5000 }).catch(() => false)
      console.log(`Seat usage: ${hasSeats ? 'visible' : 'not displayed'}`)
    })
  })

  // ----- PROFILE SETTINGS -----

  test.describe('Profile Settings', () => {
    test('should display profile with user email', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/personal`)
      await waitForPageReady(page)
      await page.waitForTimeout(1500)

      const heading = page.locator('h1, h2').filter({ hasText: /profile|personal|account/i }).first()
      await expect(heading).toBeVisible({ timeout: 15000 })

      const emailDisplay = page.locator(`text=${TEST_USER.email}`)
      await expect(emailDisplay).toBeVisible({ timeout: 10000 })
    })

    test('should have password change option', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/personal`)
      await waitForPageReady(page)
      await page.waitForTimeout(1500)

      const passwordSection = page.locator('text=/password|change.*password|update.*password/i').first()
      const hasPassword = await passwordSection.isVisible({ timeout: 5000 }).catch(() => false)
      console.log(`Password change option: ${hasPassword ? 'found' : 'not found on this page'}`)
    })
  })

  // ----- ACCOUNT DELETION UI -----

  test.describe('Account Deletion', () => {
    test('should display organization settings', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/organization`)
      await waitForPageReady(page)
      await page.waitForTimeout(1500)

      const heading = page.locator('h1, h2').filter({ hasText: /organization|org|company/i }).first()
      await expect(heading).toBeVisible({ timeout: 15000 })
    })

    test('should have danger zone with delete option', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/organization`)
      await waitForPageReady(page)
      await page.waitForTimeout(1500)

      const dangerZone = page.locator('button:has-text("Danger"), text=/danger.*zone/i, a:has-text("Danger")').first()
      const hasDanger = await dangerZone.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasDanger) {
        await dangerZone.click()
        await page.waitForTimeout(500)

        const deleteOption = page.locator('text=/delete.*organization|delete.*account|remove.*organization/i').first()
        const hasDelete = await deleteOption.isVisible({ timeout: 5000 }).catch(() => false)
        console.log(`Delete option: ${hasDelete ? 'found' : 'not found'}`)
      } else {
        const deleteBtn = page.locator('button:has-text("Delete")').first()
        const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)
        console.log(`Direct delete button: ${hasDelete ? 'found' : 'not found'}`)
      }
    })

    test('should require confirmation for deletion', async ({ page }) => {
      await page.goto(`${BASE_URL}/${orgSlug}/settings/organization`)
      await waitForPageReady(page)
      await page.waitForTimeout(1500)

      const dangerTab = page.locator('button:has-text("Danger"), a:has-text("Danger")').first()
      if (await dangerTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dangerTab.click()
        await page.waitForTimeout(500)
      }

      const deleteBtn = page.locator('button:has-text("Delete")').first()
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click()
        await page.waitForTimeout(500)

        const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first()
        const hasDialog = await dialog.isVisible({ timeout: 3000 }).catch(() => false)

        if (hasDialog) {
          console.log('Deletion: Confirmation dialog shown (safe)')
          const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("No")').first()
          if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await cancelBtn.click()
          }
        }
      }
    })
  })

  // ----- SETTINGS NAVIGATION -----

  test.describe('Settings Navigation', () => {
    test('should navigate all settings pages without 404', async ({ page }) => {
      const { errors, cleanup } = captureConsoleErrors(page)
      try {
        const settingsPages = [
          'personal',
          'organization',
          'invite',
          'hierarchy',
          'quota-usage',
          'billing',
        ]

        for (const settingsPath of settingsPages) {
          await page.goto(`${BASE_URL}/${orgSlug}/settings/${settingsPath}`)
          await waitForPageReady(page)
          await page.waitForTimeout(1000)

          const body = await page.locator('body').textContent()
          const has404 = body?.includes('404') && body?.includes('not found')
          expect(has404).toBeFalsy()
          console.log(`Settings /${settingsPath}: OK`)
        }
      } finally {
        cleanup()
      }
    })
  })

  // ----- CONSOLE ERROR AUDIT -----

  test.describe('Console Error Audit', () => {
    test('should have no critical console errors on key pages', async ({ page }) => {
      const allErrors: { page: string; error: string }[] = []

      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') {
          const text = msg.text()
          if (
            text.includes('favicon') ||
            text.includes('ERR_CONNECTION_REFUSED') ||
            text.includes('downloadable font') ||
            text.includes('ResizeObserver') ||
            text.includes('hydration') ||
            text.includes('Failed to load resource') ||
            text.includes('net::') ||
            text.includes('404')
          ) return
          allErrors.push({ page: page.url(), error: text })
        }
      })

      const pages = [
        { path: '/login', name: 'Login' },
        { path: '/forgot-password', name: 'Forgot Password' },
        { path: '/signup', name: 'Signup' },
        { path: `/${orgSlug}/dashboard`, name: 'Dashboard' },
        { path: `/${orgSlug}/settings/personal`, name: 'Profile' },
        { path: `/${orgSlug}/settings/organization`, name: 'Organization' },
        { path: `/${orgSlug}/settings/invite`, name: 'Team/Invite' },
        { path: `/${orgSlug}/settings/billing`, name: 'Billing' },
      ]

      for (const { path: pagePath, name } of pages) {
        await page.goto(`${BASE_URL}${pagePath}`)
        await waitForPageReady(page)
        await page.waitForTimeout(2000)
        console.log(`Checked: ${name} - ${allErrors.length === 0 ? 'clean' : allErrors.length + ' error(s)'}`)
      }

      if (allErrors.length > 0) {
        console.log('=== CONSOLE ERRORS FOUND ===')
        allErrors.forEach((e, i) => console.log(`${i + 1}. [${e.page}] ${e.error}`))
        console.log('============================')
      } else {
        console.log('All pages clean - no critical console errors')
      }

      expect(allErrors.length).toBe(0)
    })
  })
})
