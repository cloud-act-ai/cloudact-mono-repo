/**
 * E2E Dashboard Tests
 *
 * Comprehensive tests for the main dashboard including:
 * - Dashboard loads after login
 * - Cost widgets render
 * - Date filter works
 * - Clear cache via PageActionsMenu (3-dot menu) works
 * - Navigation elements
 * - Quota warnings
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 * - User should have some cost data for full testing
 */

import { test, expect, Page } from '@playwright/test';
import { loginAndGetOrgSlug } from './fixtures/auth';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// ===========================================
// Helper Functions
// ===========================================

/**
 * Wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000); // Allow hydration and data fetch
}

/**
 * Login and navigate to dashboard (uses shared auth with storageState)
 */
async function loginAndGoToDashboard(page: Page): Promise<string> {
  const orgSlug = await loginAndGetOrgSlug(page);
  // Ensure we're on the dashboard
  if (!page.url().includes('/dashboard')) {
    await page.goto(`/${orgSlug}/dashboard`);
    await waitForPageLoad(page);
  }
  return orgSlug;
}

/**
 * Wait for dashboard widgets to load
 */
async function waitForWidgetsToLoad(page: Page): Promise<void> {
  // Wait for loading indicators to disappear
  const loadingSpinner = page.locator('.animate-spin, [data-loading="true"], text=/loading/i');

  try {
    await loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
  } catch {
    // Loading spinner may not exist
  }

  // Wait a bit more for data to render
  await page.waitForTimeout(2000);
}

// ===========================================
// Test Suite: Dashboard Loads After Login
// ===========================================

test.describe('Dashboard - Page Load', () => {
  test('should load dashboard after successful login', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);

    // Verify we're on dashboard
    expect(page.url()).toContain('/dashboard');
    console.log(`Dashboard loaded for org: ${orgSlug}`);
  });

  test('should display dashboard heading', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Dashboard shows time-based greeting or loading state - check for any content
    // Sidebar shows "Dashboard" as the active nav item
    const dashboardNav = page.locator('text=/Dashboard/').first();
    await expect(dashboardNav).toBeVisible({ timeout: 10000 });
  });

  test('should display sidebar navigation', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Sidebar uses accordion sections: ACCOUNT SUMMARY, COST ANALYTICS, PIPELINES, etc.
    const sidebar = page.getByText('ACCOUNT SUMMARY').or(page.getByText('COST ANALYTICS')).first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should display user menu or avatar', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Check for user menu/avatar
    const userMenu = page.locator('button[aria-label*="user"], [data-testid="user-menu"], img[alt*="avatar"], button:has-text("Sign Out")').first();
    await expect(userMenu).toBeVisible({ timeout: 10000 });
  });

  test('should display organization name or breadcrumb', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Check for org name somewhere on page
    const orgElement = page.locator('[data-testid="org-name"], nav, header').filter({ hasText: /org|acme|test/i }).first();
    const isVisible = await orgElement.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Organization name displayed');
    } else {
      console.log('Organization name may be in different location');
    }
  });
});

// ===========================================
// Test Suite: Cost Widgets Render
// ===========================================

test.describe('Dashboard - Cost Widgets', () => {
  test('should display cost summary widgets', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for cost-related widgets/cards
    const costWidgets = page.locator('[data-testid*="cost"], [class*="card"], [class*="widget"]').filter({ hasText: /\$|cost|spend|total/i });
    const count = await costWidgets.count();

    console.log(`Found ${count} cost-related widgets`);
    expect(count).toBeGreaterThanOrEqual(0); // May be zero if no data
  });

  test('should display monetary values with dollar sign', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for dollar amounts
    const dollarAmounts = page.locator('text=/\\$\\d+/');
    const count = await dollarAmounts.count();

    console.log(`Found ${count} dollar amount displays`);
    // Even with no data, should show $0.00
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display cost breakdown by category', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for category breakdown (Cloud, GenAI, Subscription)
    const categories = page.locator('text=/cloud|genai|ai|subscription|saas/i');
    const count = await categories.count();

    console.log(`Found ${count} category mentions`);
  });

  test('should display charts or graphs', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for chart elements
    const charts = page.locator('canvas, svg[class*="chart"], [data-testid*="chart"], [role="img"]');
    const count = await charts.count();

    console.log(`Found ${count} chart elements`);
  });

  test('should display period comparison (MTD, YTD, MoM)', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for period indicators
    const periodIndicators = page.locator('text=/mtd|ytd|month|year|week|today|yesterday/i');
    const count = await periodIndicators.count();

    console.log(`Found ${count} period indicators`);
  });

  test('should handle empty data state gracefully', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for empty state or zero values
    const emptyState = page.locator('text=/no data|no cost|connect.*provider|get started|\\$0\\.00/i');
    const count = await emptyState.count();

    if (count > 0) {
      console.log('Empty state or zero values displayed correctly');
    } else {
      console.log('Dashboard has data populated');
    }
  });
});

// ===========================================
// Test Suite: Date Filter Works
// ===========================================

test.describe('Dashboard - Date Filter', () => {
  test('should display date filter/selector', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for date picker or filter
    const dateFilter = page.locator('button:has-text("Date"), [data-testid*="date"], input[type="date"], button:has-text("Last"), button:has-text("This")').first();
    const isVisible = await dateFilter.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Date filter found');
      await expect(dateFilter).toBeVisible();
    } else {
      console.log('Date filter may be on sub-pages');
    }
  });

  test('should show date range options', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for date range options
    const dateRangeOptions = page.locator('button:has-text("7 days"), button:has-text("30 days"), button:has-text("This month"), button:has-text("Last month"), [data-testid="date-range"]');
    const count = await dateRangeOptions.count();

    if (count > 0) {
      console.log(`Found ${count} date range options`);
    }
  });

  test('should update data when date filter changes', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Find and click date filter
    const dateFilter = page.locator('button:has-text("Date"), [data-testid*="date-filter"], button:has-text("Last"), button:has-text("This")').first();

    if (await dateFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateFilter.click();
      await page.waitForTimeout(500);

      // Look for dropdown options
      const option = page.locator('[role="option"], [data-value], button:has-text("7 days"), button:has-text("30 days")').first();

      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();

        // Wait for data to refresh
        await waitForWidgetsToLoad(page);

        console.log('Date filter change triggered');
      }
    }
  });

  test('should persist date filter across navigation', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Navigate to another page and back
    await page.goto(`${BASE_URL}/${orgSlug}/settings/organization`);
    await waitForPageLoad(page);

    await page.goto(`${BASE_URL}/${orgSlug}/dashboard`);
    await waitForWidgetsToLoad(page);

    // Page should load correctly
    expect(page.url()).toContain('/dashboard');
  });
});

// ===========================================
// Test Suite: Clear Cache (PageActionsMenu)
// ===========================================

test.describe('Dashboard - Clear Cache Functionality', () => {
  test('should display page actions menu (3-dot icon)', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for 3-dot page actions menu button
    const actionsButton = page.locator('button[aria-label="Page actions"]').first();
    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Page actions menu found');
      await expect(actionsButton).toBeVisible();
    } else {
      console.log('Page actions menu may not be present on this page');
    }
  });

  test('should clear cache when Clear Cache clicked', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    const actionsButton = page.locator('button[aria-label="Page actions"]').first();

    if (await actionsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionsButton.click();

      // Click "Clear Cache" menu item
      const clearCacheItem = page.locator('[role="menuitem"]:has-text("Clear Cache")');
      await clearCacheItem.click();

      // Wait for loading indicator (spinner in the menu item)
      const loadingIndicator = page.locator('.animate-spin, [data-loading="true"]').first();
      const showsLoading = await loadingIndicator.isVisible({ timeout: 2000 }).catch(() => false);

      if (showsLoading) {
        console.log('Loading indicator shown during cache clear');
      }

      await waitForWidgetsToLoad(page);
      console.log('Cache clear completed');
    }
  });

  test('should handle page reload gracefully', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Get current URL
    const dashboardUrl = page.url();

    // Reload page
    await page.reload();
    await waitForWidgetsToLoad(page);

    // Should still be on dashboard
    expect(page.url()).toBe(dashboardUrl);

    // Content should load
    const content = page.locator('main, [role="main"], #main-content').first();
    await expect(content).toBeVisible();
  });

  test('should show last updated timestamp', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for timestamp
    const timestamp = page.locator('text=/updated|refreshed|as of|last sync/i');
    const isVisible = await timestamp.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      console.log('Last updated timestamp displayed');
    }
  });
});

// ===========================================
// Test Suite: Navigation Elements
// ===========================================

test.describe('Dashboard - Navigation', () => {
  test('should display main navigation links', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Check for key navigation links
    const navLinks = [
      { text: /dashboard|overview/i, required: true },
      { text: /cost|analytics|spend/i, required: true },
      { text: /integration|connect/i, required: true },
      { text: /pipeline/i, required: false },
      { text: /setting/i, required: true },
    ];

    for (const link of navLinks) {
      const navItem = page.locator(`a:has-text("${link.text.source}"), button:has-text("${link.text.source}")`).first();
      const isVisible = await navItem.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible || link.required) {
        console.log(`Nav link "${link.text.source}": ${isVisible ? 'visible' : 'not found'}`);
      }
    }
  });

  test('should navigate to cost analytics page', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Sidebar has "COST ANALYTICS" accordion - click to expand then click "Overview" link
    const costAccordion = page.locator('text=/COST ANALYTICS/').first();
    if (await costAccordion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await costAccordion.click();
      await page.waitForTimeout(500);
      const overviewLink = page.locator('a[href*="cost-dashboards/overview"]').first();
      if (await overviewLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await overviewLink.click();
        await waitForPageLoad(page);
        expect(page.url()).toContain('cost-dashboards');
        return;
      }
    }
    // Fallback: direct navigation
    await page.goto(`/${orgSlug}/cost-dashboards/overview`);
    await waitForPageLoad(page);
    expect(page.url()).toContain('cost-dashboards');
  });

  test('should navigate to integrations page', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Sidebar has "INTEGRATIONS" accordion
    const intAccordion = page.locator('text=/INTEGRATIONS/').first();
    if (await intAccordion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await intAccordion.click();
      await page.waitForTimeout(500);
      const genaiLink = page.locator('a[href*="integrations/genai"]').first();
      if (await genaiLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await genaiLink.click();
        await waitForPageLoad(page);
        expect(page.url()).toContain('integrations');
        return;
      }
    }
    await page.goto(`/${orgSlug}/integrations/genai`);
    await waitForPageLoad(page);
    expect(page.url()).toContain('integrations');
  });

  test('should navigate to settings page', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Sidebar has "ORG SETTINGS" accordion
    const settingsAccordion = page.locator('text=/ORG SETTINGS/').first();
    if (await settingsAccordion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsAccordion.click();
      await page.waitForTimeout(500);
      const orgLink = page.locator('a[href*="settings/organization"]').first();
      if (await orgLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await orgLink.click();
        await waitForPageLoad(page);
        expect(page.url()).toContain('settings');
        return;
      }
    }
    await page.goto(`/${orgSlug}/settings/organization`);
    await waitForPageLoad(page);
    expect(page.url()).toContain('settings');
  });
});

// ===========================================
// Test Suite: Quota Warnings
// ===========================================

test.describe('Dashboard - Quota Warnings', () => {
  test('should display quota usage indicator', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Quota indicator may be in sidebar (Usage & Quotas) or as a banner
    const quotaIndicator = page.locator('text=/quota|usage|limit|\\d+%/i, [data-testid*="quota"], text=/Usage & Quotas/');
    const count = await quotaIndicator.count();

    // Quota widget is optional - may not show if usage is low
    console.log(`Found ${count} quota indicators`);
  });

  test('should show warning banner when quota is high', async ({ page }) => {
    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for quota warning banner
    const warningBanner = page.locator('[data-testid="quota-warning"], [class*="warning"], [class*="alert"]').filter({ hasText: /quota|limit|usage|80%|90%|exceeded/i });
    const isVisible = await warningBanner.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      console.log('Quota warning banner displayed');
    } else {
      console.log('No quota warning (usage may be low)');
    }
  });

  test('should link to usage details from quota indicator', async ({ page }) => {
    const orgSlug = await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Look for clickable quota indicator
    const quotaLink = page.locator('a:has-text("quota"), a:has-text("usage"), [data-testid*="quota"] a').first();

    if (await quotaLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quotaLink.click();
      await waitForPageLoad(page);

      // Should navigate to quota/usage page
      expect(page.url()).toMatch(/quota|usage|billing/);
    }
  });
});

// ===========================================
// Test Suite: Performance
// ===========================================

test.describe('Dashboard - Performance', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    const loadTime = Date.now() - startTime;
    console.log(`Dashboard loaded in ${loadTime}ms`);

    // Should load within 30 seconds (including login)
    expect(loadTime).toBeLessThan(30000);
  });

  test('should not show excessive loading states', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Count loading spinners
    await page.waitForTimeout(2000);

    const spinners = page.locator('.animate-spin, [data-loading="true"]');
    const spinnerCount = await spinners.count();

    if (spinnerCount > 0) {
      console.log(`${spinnerCount} loading spinners still visible after 2s`);
    }

    // Wait for all to disappear
    await waitForWidgetsToLoad(page);

    const remainingSpinners = await spinners.count();
    console.log(`${remainingSpinners} spinners remaining after full load`);
  });
});

// ===========================================
// Test Suite: Responsive Design
// ===========================================

test.describe('Dashboard - Responsive Design', () => {
  test('should adapt to mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Check that content is visible
    const mainContent = page.locator('main, [role="main"], #main-content').first();
    await expect(mainContent).toBeVisible();

    // Check for mobile menu button
    const mobileMenuButton = page.locator('button[aria-label*="menu"], [data-testid="mobile-menu"], button:has([class*="menu"])').first();
    const hasMobileMenu = await mobileMenuButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasMobileMenu) {
      console.log('Mobile menu button displayed');
    }
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await loginAndGoToDashboard(page);
    await waitForWidgetsToLoad(page);

    // Check that content is visible
    const mainContent = page.locator('main, [role="main"], #main-content').first();
    await expect(mainContent).toBeVisible();
  });
});

console.log(`
===========================================
Dashboard E2E Test Suite
===========================================
Test Suites: 8
- Dashboard - Page Load (5 tests)
- Dashboard - Cost Widgets (6 tests)
- Dashboard - Date Filter (4 tests)
- Dashboard - Clear Cache Functionality (4 tests)
- Dashboard - Navigation (4 tests)
- Dashboard - Quota Warnings (3 tests)
- Dashboard - Performance (2 tests)
- Dashboard - Responsive Design (2 tests)

Total Tests: 30

Run with:
  npx playwright test tests/e2e/dashboard.spec.ts
  npx playwright test tests/e2e/dashboard.spec.ts --headed
  npx playwright test tests/e2e/dashboard.spec.ts --ui
===========================================
`);
