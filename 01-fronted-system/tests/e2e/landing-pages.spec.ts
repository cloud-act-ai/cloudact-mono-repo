/**
 * E2E Tests for CloudAct Landing Pages
 *
 * Tests all public-facing pages for:
 * - Proper rendering of key sections
 * - Navigation functionality
 * - Responsive elements
 * - SEO requirements
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

// ============================================
// HOME PAGE TESTS
// ============================================

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render hero section with all key elements', async ({ page }) => {
    // Hero headline should be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/stop overpaying/i)).toBeVisible()

    // Primary CTA buttons
    await expect(page.getByRole('link', { name: /start free trial/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /watch demo|schedule demo/i }).first()).toBeVisible()

    // Google Data & AI badge
    await expect(page.getByText(/google data & ai/i)).toBeVisible()
  })

  test('should render logo cloud with provider logos', async ({ page }) => {
    // Provider integrations section
    await expect(page.getByText(/integrates with/i)).toBeVisible()

    // Check for provider logo images (at least AWS and GCP should be present)
    const providerLogos = page.locator('img[alt*="AWS"], img[alt*="Google Cloud"], img[alt*="Azure"]')
    await expect(providerLogos.first()).toBeVisible()
  })

  test('should render platform pillars section', async ({ page }) => {
    // Three pillars: Cloud, GenAI, SaaS
    await expect(page.getByText(/cloud costs/i).first()).toBeVisible()
    await expect(page.getByText(/genai costs/i).first()).toBeVisible()
    await expect(page.getByText(/saas costs/i).first()).toBeVisible()

    // Section header
    await expect(page.getByText(/all your costs.*one view/i)).toBeVisible()
  })

  test('should render why CloudAct section with differentiators', async ({ page }) => {
    // Differentiators
    await expect(page.getByText(/ai anomaly detection/i)).toBeVisible()
    await expect(page.getByText(/100% cost allocation/i)).toBeVisible()
    await expect(page.getByText(/enterprise ready/i)).toBeVisible()
    await expect(page.getByText(/unit economics/i)).toBeVisible()
  })

  test('should render customer segments section', async ({ page }) => {
    // Customer segments
    await expect(page.getByText(/individuals.*freelancers/i)).toBeVisible()
    await expect(page.getByText(/startups/i).first()).toBeVisible()
    await expect(page.getByText(/enterprise/i).first()).toBeVisible()
  })

  test('should render testimonials section', async ({ page }) => {
    await expect(page.getByText(/customer stories|loved by/i)).toBeVisible()
  })

  test('should render final CTA section', async ({ page }) => {
    // Final CTA at bottom
    const finalCta = page.getByText(/ready to cut your.*cloud costs/i)
    await expect(finalCta).toBeVisible()

    // No credit card messaging
    await expect(page.getByText(/no credit card/i).first()).toBeVisible()
  })

  test('should have working primary CTA links', async ({ page }) => {
    // Click "Start Free Trial" should navigate to signup
    const signupLink = page.getByRole('link', { name: /start free trial/i }).first()
    await expect(signupLink).toHaveAttribute('href', '/signup')

    // Click demo link
    const demoLink = page.getByRole('link', { name: /watch demo|schedule demo/i }).first()
    await expect(demoLink).toHaveAttribute('href', '/demo')
  })
})

// ============================================
// PRICING PAGE TESTS
// ============================================

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`)
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render pricing hero with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /pricing/i })).toBeVisible()
    await expect(page.getByText(/simple.*transparent.*pricing/i)).toBeVisible()
  })

  test('should have billing period toggle (monthly/annual)', async ({ page }) => {
    // Billing toggle buttons
    const monthlyBtn = page.getByRole('tab', { name: /monthly/i })
    const annualBtn = page.getByRole('tab', { name: /annual/i })

    await expect(monthlyBtn).toBeVisible()
    await expect(annualBtn).toBeVisible()

    // Should have "Save 20%" badge on annual
    await expect(page.getByText(/save 20%/i)).toBeVisible()
  })

  test('should display pricing plans when loaded', async ({ page }) => {
    // Wait for plans to load (either loading spinner gone or plan cards visible)
    await page.waitForSelector('.ca-pricing-card-premium, .ca-pricing-loading', { timeout: 10000 })

    // Check if plans loaded (not in loading state)
    const loadingElement = page.locator('.ca-pricing-loading')
    const isLoading = await loadingElement.isVisible().catch(() => false)

    if (!isLoading) {
      // Plans should be visible
      const planCards = page.locator('.ca-pricing-card-premium')
      const count = await planCards.count()
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('should always display Enterprise plan card', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(2000)

    // Enterprise card should always be visible (static)
    await expect(page.getByText(/enterprise/i).first()).toBeVisible()
    await expect(page.getByText(/custom solutions/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /contact sales/i }).first()).toBeVisible()
  })

  test('should display trust badges', async ({ page }) => {
    await expect(page.getByText(/256-bit ssl encryption/i)).toBeVisible()
    await expect(page.getByText(/30-day money-back guarantee/i)).toBeVisible()
    await expect(page.getByText(/gdpr.*soc 2/i)).toBeVisible()
  })

  test('should have FAQ section with accordion', async ({ page }) => {
    await expect(page.getByText(/frequently asked questions/i)).toBeVisible()

    // FAQ items should be clickable
    const faqQuestion = page.getByText(/is there a free trial/i)
    await expect(faqQuestion).toBeVisible()

    // Click to expand
    await faqQuestion.click()
    await expect(page.getByText(/14-day free trial/i)).toBeVisible()
  })

  test('should have final CTA section', async ({ page }) => {
    await expect(page.getByText(/ready to optimize your cloud costs/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /start free trial/i }).last()).toBeVisible()
  })
})

// ============================================
// FEATURES PAGE TESTS
// ============================================

test.describe('Features Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/features`)
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render features hero section', async ({ page }) => {
    await expect(page.getByText(/platform features/i)).toBeVisible()
    await expect(page.getByText(/every feature you need/i)).toBeVisible()
  })

  test('should display three core pillars', async ({ page }) => {
    // GenAI pillar
    await expect(page.getByText(/genai cost intelligence/i)).toBeVisible()
    await expect(page.getByText(/token-level tracking/i)).toBeVisible()

    // Cloud pillar
    await expect(page.getByText(/multi-cloud management/i)).toBeVisible()
    await expect(page.getByText(/cross-cloud dashboards/i)).toBeVisible()

    // SaaS pillar
    await expect(page.getByText(/saas subscription tracking/i)).toBeVisible()
    await expect(page.getByText(/auto-discovery/i)).toBeVisible()
  })

  test('should display feature grid', async ({ page }) => {
    await expect(page.getByText(/real-time dashboards/i)).toBeVisible()
    await expect(page.getByText(/ai recommendations/i)).toBeVisible()
    await expect(page.getByText(/smart alerts/i)).toBeVisible()
    await expect(page.getByText(/budget controls/i)).toBeVisible()
    await expect(page.getByText(/cost allocation/i)).toBeVisible()
    await expect(page.getByText(/forecasting/i)).toBeVisible()
  })

  test('should display how it works section', async ({ page }) => {
    await expect(page.getByText(/how it works/i)).toBeVisible()
    await expect(page.getByText(/connect your providers/i)).toBeVisible()
    await expect(page.getByText(/automatic data sync/i)).toBeVisible()
    await expect(page.getByText(/get instant insights/i)).toBeVisible()
  })

  test('should display enterprise features', async ({ page }) => {
    await expect(page.getByText(/enterprise ready/i)).toBeVisible()
    await expect(page.getByText(/enterprise security/i)).toBeVisible()
    await expect(page.getByText(/soc 2 type ii/i).first()).toBeVisible()
  })

  test('should display integrations section', async ({ page }) => {
    await expect(page.getByText(/connect your entire stack/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /view all integrations/i })).toBeVisible()
  })
})

// ============================================
// ABOUT PAGE TESTS
// ============================================

test.describe('About Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/about`)
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render about hero section', async ({ page }) => {
    await expect(page.getByText(/about us/i)).toBeVisible()
    await expect(page.getByText(/democratizing cost intelligence/i)).toBeVisible()
  })

  test('should display company story', async ({ page }) => {
    await expect(page.getByText(/the beginning|how cloudact.*started/i)).toBeVisible()
  })

  test('should display platform stats', async ({ page }) => {
    await expect(page.getByText(/50\+/i).first()).toBeVisible()
    await expect(page.getByText(/real-time/i).first()).toBeVisible()
    await expect(page.getByText(/ai-powered/i).first()).toBeVisible()
  })

  test('should display team section', async ({ page }) => {
    await expect(page.getByText(/our team/i)).toBeVisible()
    await expect(page.getByText(/our expertise/i)).toBeVisible()
  })

  test('should display company values', async ({ page }) => {
    await expect(page.getByText(/core values/i)).toBeVisible()
    await expect(page.getByText(/customer obsessed/i)).toBeVisible()
    await expect(page.getByText(/trust.*transparency/i)).toBeVisible()
  })

  test('should display office information', async ({ page }) => {
    await expect(page.getByText(/sunnyvale, ca/i)).toBeVisible()
    await expect(page.getByText(/850.*988.*7471/i)).toBeVisible()
  })

  test('should have careers CTA', async ({ page }) => {
    await expect(page.getByText(/we're hiring/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /view open positions/i })).toBeVisible()
  })
})

// ============================================
// CONTACT PAGE TESTS
// ============================================

test.describe('Contact Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/contact`)
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render contact hero section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /contact us/i })).toBeVisible()
  })

  test('should display contact cards', async ({ page }) => {
    await expect(page.getByText(/sales/i).first()).toBeVisible()
    await expect(page.getByText(/schedule a demo/i)).toBeVisible()
    await expect(page.getByText(/technical support/i)).toBeVisible()
    await expect(page.getByText(/partnerships/i)).toBeVisible()
  })

  test('should display contact form', async ({ page }) => {
    await expect(page.getByText(/send us a message/i)).toBeVisible()

    // Form fields
    await expect(page.getByLabel(/first name/i)).toBeVisible()
    await expect(page.getByLabel(/last name/i)).toBeVisible()
    await expect(page.getByLabel(/email address/i)).toBeVisible()
    await expect(page.getByLabel(/company/i)).toBeVisible()
    await expect(page.getByLabel(/what can we help you with/i)).toBeVisible()
    await expect(page.getByLabel(/message/i)).toBeVisible()

    // Submit button
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible()
  })

  test('should display office location', async ({ page }) => {
    await expect(page.getByText(/headquarters/i)).toBeVisible()
    await expect(page.getByText(/cloudact inc/i)).toBeVisible()
    await expect(page.getByText(/100 s murphy ave/i)).toBeVisible()
  })

  test('should have help center link', async ({ page }) => {
    await expect(page.getByText(/looking for self-service help/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /visit help center/i })).toBeVisible()
  })
})

// ============================================
// PRIVACY PAGE TESTS
// ============================================

test.describe('Privacy Page', () => {
  test('should render privacy policy page', async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy`)
    await page.waitForLoadState('domcontentloaded')

    // Should have privacy policy content
    await expect(page.getByText(/privacy/i).first()).toBeVisible()
  })
})

// ============================================
// TERMS PAGE TESTS
// ============================================

test.describe('Terms Page', () => {
  test('should render terms of service page', async ({ page }) => {
    await page.goto(`${BASE_URL}/terms`)
    await page.waitForLoadState('domcontentloaded')

    // Should have terms content
    await expect(page.getByText(/terms/i).first()).toBeVisible()
  })
})

// ============================================
// SECURITY PAGE TESTS
// ============================================

test.describe('Security Page', () => {
  test('should render security page', async ({ page }) => {
    await page.goto(`${BASE_URL}/security`)
    await page.waitForLoadState('domcontentloaded')

    // Should have security content
    await expect(page.getByText(/security/i).first()).toBeVisible()
  })
})

// ============================================
// COMPLIANCE PAGE TESTS
// ============================================

test.describe('Compliance Page', () => {
  test('should render compliance page', async ({ page }) => {
    await page.goto(`${BASE_URL}/compliance`)
    await page.waitForLoadState('domcontentloaded')

    // Should have compliance content
    await expect(page.getByText(/compliance/i).first()).toBeVisible()
  })
})

// ============================================
// 404 PAGE TESTS
// ============================================

test.describe('404 Not Found Page', () => {
  test('should display 404 page for non-existent routes', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist-12345`)
    await page.waitForLoadState('domcontentloaded')

    // Should show 404 content
    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText(/page not found/i)).toBeVisible()
  })

  test('should have navigation options on 404 page', async ({ page }) => {
    await page.goto(`${BASE_URL}/non-existent-page`)
    await page.waitForLoadState('domcontentloaded')

    // Go home button
    await expect(page.getByRole('link', { name: /go home/i })).toBeVisible()

    // Go back button
    await expect(page.getByRole('button', { name: /go back/i })).toBeVisible()

    // Support contact
    await expect(page.getByText(/need help.*contact/i)).toBeVisible()
  })

  test('should navigate to home page from 404', async ({ page }) => {
    await page.goto(`${BASE_URL}/non-existent-page`)
    await page.waitForLoadState('domcontentloaded')

    // Click go home
    await page.getByRole('link', { name: /go home/i }).click()
    await page.waitForURL(BASE_URL)

    // Should be on home page
    expect(page.url()).toBe(`${BASE_URL}/`)
  })
})

// ============================================
// NAVIGATION TESTS
// ============================================

test.describe('Navigation Links', () => {
  test('should navigate from home to pricing', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')

    // Find and click pricing link in navigation
    const pricingLink = page.getByRole('link', { name: /pricing/i }).first()
    await pricingLink.click()

    await page.waitForURL(`${BASE_URL}/pricing`)
    await expect(page.getByText(/simple.*transparent.*pricing/i)).toBeVisible()
  })

  test('should navigate from home to features', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')

    // Find and click features link
    const featuresLink = page.getByRole('link', { name: /features/i }).first()
    await featuresLink.click()

    await page.waitForURL(`${BASE_URL}/features`)
    await expect(page.getByText(/platform features/i)).toBeVisible()
  })

  test('should navigate from pricing to signup', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for plans to load
    await page.waitForTimeout(2000)

    // Find and click a signup CTA
    const signupLink = page.getByRole('link', { name: /start.*trial|get started/i }).first()
    await signupLink.click()

    await page.waitForURL(/\/signup/)
    await expect(page.getByText(/create your account/i)).toBeVisible()
  })

  test('should navigate from about to contact', async ({ page }) => {
    await page.goto(`${BASE_URL}/about`)
    await page.waitForLoadState('domcontentloaded')

    // Find contact link
    const contactLink = page.getByRole('link', { name: /get in touch|contact/i }).first()
    await contactLink.click()

    await page.waitForURL(`${BASE_URL}/contact`)
    await expect(page.getByRole('heading', { name: /contact us/i })).toBeVisible()
  })

  test('should have working footer links', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    // Check footer links exist (Privacy, Terms, etc.)
    const privacyLink = page.getByRole('link', { name: /privacy/i }).first()
    const termsLink = page.getByRole('link', { name: /terms/i }).first()

    // At least one should be visible
    const privacyVisible = await privacyLink.isVisible().catch(() => false)
    const termsVisible = await termsLink.isVisible().catch(() => false)

    expect(privacyVisible || termsVisible).toBeTruthy()
  })
})

// ============================================
// RESPONSIVE TESTS
// ============================================

test.describe('Responsive Design', () => {
  test('should render mobile viewport correctly', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')

    // Hero should still be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // CTAs should be accessible
    const signupCta = page.getByRole('link', { name: /start free trial/i }).first()
    await expect(signupCta).toBeVisible()
  })

  test('should render tablet viewport correctly', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')

    // Core content should be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/cloud costs/i).first()).toBeVisible()
  })
})
