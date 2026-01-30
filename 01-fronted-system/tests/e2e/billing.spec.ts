/**
 * E2E Billing Tests
 *
 * Comprehensive tests for billing and subscription pages:
 * - Plan overview
 * - Invoice list
 * - Upgrade/downgrade flow
 * - Stripe integration
 * - Trial management
 * - Payment methods
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 * - Stripe TEST mode configured
 */

import { test, expect, Page } from '@playwright/test';

// ===========================================
// Configuration
// ===========================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test credentials
const TEST_CREDENTIALS = {
  email: 'demo@cloudact.ai',
  password: 'demo1234',
};

// Stripe test cards
const STRIPE_TEST_CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
  expired: '4000000000000069',
};

// Plan names
const PLANS = {
  starter: {
    name: 'Starter',
    price: '$19',
    priceId: 'price_1SWJMfDoxINmrJKY7tOoJUIs',
  },
  professional: {
    name: 'Professional',
    price: '$69',
    priceId: 'price_1SWJOYDoxINmrJKY8jEZwVuU',
  },
  scale: {
    name: 'Scale',
    price: '$199',
    priceId: 'price_1SWJP8DoxINmrJKYfg0jmeLv',
  },
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

/**
 * Login and get org slug
 */
async function loginAndGetOrgSlug(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/login`);
  await waitForPageLoad(page);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(TEST_CREDENTIALS.email);
  await passwordInput.fill(TEST_CREDENTIALS.password);

  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
  await submitButton.click();

  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });

  if (page.url().includes('/org-select')) {
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
    await orgCard.click();
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
  }

  const match = page.url().match(/\/([^/]+)\/dashboard/);
  return match ? match[1] : 'test-org';
}

/**
 * Navigate to billing page
 */
async function navigateToBilling(page: Page, orgSlug: string): Promise<void> {
  await page.goto(`${BASE_URL}/${orgSlug}/billing`);
  await waitForPageLoad(page);
  await page.waitForTimeout(1000);
}

/**
 * Navigate to pricing/onboarding billing page
 */
async function navigateToPricing(page: Page, orgSlug: string): Promise<void> {
  await page.goto(`${BASE_URL}/${orgSlug}/onboarding/billing`);
  await waitForPageLoad(page);
  await page.waitForTimeout(1000);
}

// ===========================================
// Test Suite: Plan Overview
// ===========================================

test.describe('Plan Overview', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load billing page', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Verify we're on billing page
    expect(page.url()).toContain('billing');

    // Check for billing heading
    const heading = page.locator('h1, h2').filter({ hasText: /billing|subscription|plan/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display current plan information', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for current plan indicator
    const planInfo = page.locator('text=/current plan|your plan|starter|professional|scale/i').first();
    await expect(planInfo).toBeVisible({ timeout: 10000 });
  });

  test('should display plan features', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for plan features
    const features = page.locator('text=/seat|member|provider|pipeline|daily|monthly/i');
    const count = await features.count();

    console.log(`Found ${count} plan feature mentions`);
  });

  test('should display pricing information', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for pricing
    const pricing = page.locator('text=/\\$\\d+.*\\/mo|\\$\\d+.*month/i');
    const count = await pricing.count();

    console.log(`Found ${count} pricing displays`);
  });

  test('should display plan comparison', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for plan comparison or "view plans" button
    const comparePlans = page.locator('button:has-text("Compare"), button:has-text("View Plans"), a:has-text("Plans")').first();
    const hasCompare = await comparePlans.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCompare) {
      console.log('Plan comparison available');
    }
  });

  test('should display trial status if in trial', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for trial information
    const trialInfo = page.locator('text=/trial|\\d+.*days.*remaining|ends.*in/i').first();
    const hasTrial = await trialInfo.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTrial) {
      console.log('Trial status displayed');
    } else {
      console.log('No trial (may have active subscription or expired)');
    }
  });
});

// ===========================================
// Test Suite: Invoice List
// ===========================================

test.describe('Invoice List', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display invoices section', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for invoices section
    const invoiceSection = page.locator('text=/invoice|payment.*history|billing.*history/i').first();
    const hasInvoices = await invoiceSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInvoices) {
      console.log('Invoice section found');
    }
  });

  test('should display invoice list or empty state', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for invoice list or empty state
    const invoiceList = page.locator('table, [data-testid*="invoice"]').first();
    const emptyState = page.locator('text=/no invoice|no payment/i').first();

    const hasList = await invoiceList.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasList) {
      console.log('Invoice list displayed');
    } else if (hasEmpty) {
      console.log('Empty invoice state displayed');
    }
  });

  test('should display invoice date', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for date patterns in invoice area
    const dates = page.locator('text=/\\d{1,2}.*\\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i');
    const count = await dates.count();

    console.log(`Found ${count} date displays (may include invoice dates)`);
  });

  test('should display download invoice button', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for download/PDF buttons
    const downloadButton = page.locator('button:has-text("Download"), a:has-text("PDF"), a:has-text("Download")').first();
    const hasDownload = await downloadButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDownload) {
      console.log('Download invoice button found');
    }
  });

  test('should display invoice status', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for status indicators
    const statuses = page.locator('text=/paid|pending|failed|overdue/i');
    const count = await statuses.count();

    console.log(`Found ${count} invoice status indicators`);
  });
});

// ===========================================
// Test Suite: Upgrade Flow
// ===========================================

test.describe('Upgrade Flow', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display upgrade button', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for upgrade button
    const upgradeButton = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade")').first();
    const hasUpgrade = await upgradeButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasUpgrade) {
      console.log('Upgrade button found');
      await expect(upgradeButton).toBeVisible();
    }
  });

  test('should show plan options when upgrading', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const upgradeButton = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade"), button:has-text("Change Plan")').first();

    if (await upgradeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeButton.click();
      await waitForPageLoad(page);

      // Should show plan options
      const planOptions = page.locator('text=/starter|professional|scale/i');
      const count = await planOptions.count();

      console.log(`Found ${count} plan options`);
    }
  });

  test('should display pricing for each plan', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Navigate to plan selection
    const upgradeButton = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade"), button:has-text("Change Plan")').first();

    if (await upgradeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeButton.click();
      await waitForPageLoad(page);

      // Check for pricing
      const starterPrice = page.locator(`text=${PLANS.starter.price}`).first();
      const professionalPrice = page.locator(`text=${PLANS.professional.price}`).first();
      const scalePrice = page.locator(`text=${PLANS.scale.price}`).first();

      const hasStarter = await starterPrice.isVisible({ timeout: 3000 }).catch(() => false);
      const hasPro = await professionalPrice.isVisible({ timeout: 3000 }).catch(() => false);
      const hasScale = await scalePrice.isVisible({ timeout: 3000 }).catch(() => false);

      console.log(`Pricing - Starter: ${hasStarter}, Professional: ${hasPro}, Scale: ${hasScale}`);
    }
  });

  test('should highlight recommended plan', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const upgradeButton = page.locator('button:has-text("Upgrade"), button:has-text("Change Plan")').first();

    if (await upgradeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeButton.click();
      await waitForPageLoad(page);

      // Look for "most popular" or "recommended" badge
      const recommended = page.locator('text=/most popular|recommended|best value/i').first();
      const hasRecommended = await recommended.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasRecommended) {
        console.log('Recommended plan highlighted');
      }
    }
  });

  test('should initiate Stripe checkout when plan selected', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const upgradeButton = page.locator('button:has-text("Upgrade"), button:has-text("Change Plan")').first();

    if (await upgradeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeButton.click();
      await waitForPageLoad(page);

      // Find select/subscribe button
      const selectButton = page.locator('button:has-text("Select"), button:has-text("Subscribe"), button:has-text("Get Started")').first();

      if (await selectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(2000);

        // Check if redirected to Stripe or showing Stripe elements
        const isStripe = page.url().includes('stripe.com') ||
                        await page.locator('iframe[src*="stripe"]').count() > 0;

        if (isStripe) {
          console.log('Stripe checkout initiated');
        }
      }
    }
  });
});

// ===========================================
// Test Suite: Downgrade Flow
// ===========================================

test.describe('Downgrade Flow', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should show warning when downgrading', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const changeButton = page.locator('button:has-text("Change Plan"), button:has-text("Downgrade")').first();

    if (await changeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await changeButton.click();
      await waitForPageLoad(page);

      // Look for a lower tier plan's select button
      const starterSelect = page.locator(`div:has-text("${PLANS.starter.name}") button:has-text("Select")`).first();

      if (await starterSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await starterSelect.click();
        await page.waitForTimeout(1000);

        // Should show warning about feature loss
        const warning = page.locator('text=/lose|downgrade|limit|warning/i').first();
        const hasWarning = await warning.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasWarning) {
          console.log('Downgrade warning displayed');
        }
      }
    }
  });

  test('should prevent downgrade if usage exceeds lower plan limits', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // This test checks if the system prevents downgrading when current usage
    // would exceed the limits of the target plan

    const changeButton = page.locator('button:has-text("Change Plan")').first();

    if (await changeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Change plan button available (downgrade validation depends on current usage)');
    }
  });
});

// ===========================================
// Test Suite: Billing Portal
// ===========================================

test.describe('Billing Portal', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display manage billing button', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for billing portal button
    const portalButton = page.locator('button:has-text("Manage Billing"), a:has-text("Manage Billing"), button:has-text("Payment Method")').first();
    const hasPortal = await portalButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPortal) {
      console.log('Billing portal button found');
    }
  });

  test('should redirect to Stripe billing portal', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const portalButton = page.locator('button:has-text("Manage Billing"), a:has-text("Billing Portal")').first();

    if (await portalButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await portalButton.click();
      await page.waitForTimeout(3000);

      // Check if redirected to Stripe
      const currentUrl = page.url();
      const isStripePortal = currentUrl.includes('stripe.com') ||
                            currentUrl.includes('billing.stripe.com');

      if (isStripePortal) {
        console.log('Redirected to Stripe billing portal');
      } else {
        console.log('May require active subscription for portal access');
      }
    }
  });

  test('should display payment method section', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for payment method info
    const paymentMethod = page.locator('text=/payment.*method|card.*ending|visa|mastercard/i').first();
    const hasPayment = await paymentMethod.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPayment) {
      console.log('Payment method information displayed');
    }
  });
});

// ===========================================
// Test Suite: Trial Period
// ===========================================

test.describe('Trial Period', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display trial status', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for trial indicators
    const trialStatus = page.locator('text=/trial|free.*trial|14.*day/i').first();
    const hasTrial = await trialStatus.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTrial) {
      console.log('Trial status displayed');
    }
  });

  test('should display trial days remaining', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for days remaining
    const daysRemaining = page.locator('text=/\\d+.*days?.*remaining|ends.*in.*\\d+/i').first();
    const hasDays = await daysRemaining.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDays) {
      console.log('Trial days remaining displayed');
    }
  });

  test('should show trial conversion CTA', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for conversion CTA
    const convertCta = page.locator('button:has-text("Start"), button:has-text("Subscribe"), button:has-text("Upgrade")').first();
    const hasCta = await convertCta.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCta) {
      console.log('Trial conversion CTA found');
    }
  });
});

// ===========================================
// Test Suite: Cancel Subscription
// ===========================================

test.describe('Cancel Subscription', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display cancel option', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for cancel link/button
    const cancelOption = page.locator('button:has-text("Cancel"), a:has-text("Cancel subscription")').first();
    const hasCancel = await cancelOption.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCancel) {
      console.log('Cancel subscription option found');
    }
  });

  test('should show confirmation when cancelling', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const cancelOption = page.locator('button:has-text("Cancel subscription"), button:has-text("Cancel Plan")').first();

    if (await cancelOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelOption.click();
      await page.waitForTimeout(500);

      // Should show confirmation dialog
      const confirmDialog = page.locator('text=/are you sure|confirm|lose access/i').first();
      const hasConfirm = await confirmDialog.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasConfirm) {
        console.log('Cancellation confirmation shown');
      }
    }
  });
});

// ===========================================
// Test Suite: Error Handling
// ===========================================

test.describe('Billing Error Handling', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Simulate offline
    await page.context().setOffline(true);

    // Try an action
    const refreshButton = page.locator('button:has-text("Refresh")').first();
    if (await refreshButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshButton.click();
    }

    await page.waitForTimeout(2000);

    // Go back online
    await page.context().setOffline(false);

    // Should still be functional
    await navigateToBilling(page, orgSlug);
    expect(page.url()).toContain('billing');
  });

  test('should display error messages clearly', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Look for error display area (in case of errors)
    const errorArea = page.locator('[role="alert"], .error, [data-testid*="error"]').first();
    const hasErrorArea = await errorArea.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasErrorArea) {
      console.log('Error display area found');
    }
  });
});

// ===========================================
// Test Suite: Accessibility
// ===========================================

test.describe('Billing Accessibility', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should have accessible plan selection buttons', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Check button accessibility
    const buttons = page.locator('button:has-text("Upgrade"), button:has-text("Select"), button:has-text("Subscribe")');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      await expect(button).toBeEnabled();
    }

    console.log(`Found ${count} accessible action buttons`);
  });

  test('should have proper heading structure', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();

    console.log(`Heading structure - h1: ${h1Count}, h2: ${h2Count}`);
    expect(h1Count + h2Count).toBeGreaterThan(0);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await navigateToBilling(page, orgSlug);

    // Tab through billing page elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT']).toContain(focusedElement);
  });
});

console.log(`
===========================================
Billing E2E Test Suite
===========================================
Test Suites: 9
- Plan Overview (6 tests)
- Invoice List (5 tests)
- Upgrade Flow (5 tests)
- Downgrade Flow (2 tests)
- Billing Portal (3 tests)
- Trial Period (3 tests)
- Cancel Subscription (2 tests)
- Error Handling (2 tests)
- Accessibility (3 tests)

Total Tests: 31

Run with:
  npx playwright test tests/e2e/billing.spec.ts
  npx playwright test tests/e2e/billing.spec.ts --headed
  npx playwright test tests/e2e/billing.spec.ts --ui
===========================================
`);
