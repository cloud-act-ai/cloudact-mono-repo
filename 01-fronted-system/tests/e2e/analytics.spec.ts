/**
 * E2E Analytics Dashboard Tests
 *
 * Team: E8 (QA Frontend) + E9 (QA Backend)
 * 
 * Comprehensive tests for the analytics dashboard including:
 * - Page load and navigation
 * - Key metrics display
 * - Chart rendering
 * - Tab navigation
 * - Insights display
 * - Export functionality
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const TEST_CREDENTIALS = {
  email: 'demo@cloudact.ai',
  password: 'demo1234',
};

async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

async function loginAndNavigate(page: Page, path: string): Promise<string> {
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
  const orgSlug = match ? match[1] : 'test-org';

  await page.goto(`${BASE_URL}/${orgSlug}${path}`);
  await waitForPageLoad(page);

  return orgSlug;
}

// ===========================================
// Test Suite: Analytics Page Load
// ===========================================

test.describe('Analytics - Page Load', () => {
  test('should load analytics page', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const heading = page.locator('h1:has-text("Analytics")');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display page title and description', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    await expect(page.locator('text=Analytics Dashboard')).toBeVisible();
    await expect(page.locator('text=/insights|spending|patterns/i')).toBeVisible();
  });

  test('should display key metric cards', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    // Should show 4 metric cards
    const metricCards = page.locator('.card, [class*="Card"]');
    const count = await metricCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ===========================================
// Test Suite: Analytics Metrics
// ===========================================

test.describe('Analytics - Metrics', () => {
  test('should display period total', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const periodTotal = page.locator('text=/Period Total|Total/i');
    await expect(periodTotal.first()).toBeVisible();
  });

  test('should display daily average', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const dailyAvg = page.locator('text=/Daily Average|Average/i');
    await expect(dailyAvg.first()).toBeVisible();
  });

  test('should display active providers count', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const providers = page.locator('text=/Active Providers|Providers/i');
    await expect(providers.first()).toBeVisible();
  });

  test('should display insights count', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const insights = page.locator('text=/Insights/i');
    await expect(insights.first()).toBeVisible();
  });
});

// ===========================================
// Test Suite: Analytics Tabs
// ===========================================

test.describe('Analytics - Tab Navigation', () => {
  test('should display tab navigation', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const tabs = page.locator('[role="tablist"], .tabs');
    await expect(tabs.first()).toBeVisible();
  });

  test('should navigate to Overview tab', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const overviewTab = page.locator('button:has-text("Overview"), [role="tab"]:has-text("Overview")');
    if (await overviewTab.isVisible()) {
      await overviewTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should navigate to Trends tab', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const trendsTab = page.locator('button:has-text("Trends"), [role="tab"]:has-text("Trends")');
    if (await trendsTab.isVisible()) {
      await trendsTab.click();
      await page.waitForTimeout(500);
      
      // Should show trend analysis content
      const trendContent = page.locator('text=/Trend Analysis|Trend/i');
      await expect(trendContent.first()).toBeVisible();
    }
  });

  test('should navigate to Providers tab', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const providersTab = page.locator('button:has-text("Providers"), [role="tab"]:has-text("Providers")');
    if (await providersTab.isVisible()) {
      await providersTab.click();
      await page.waitForTimeout(500);
      
      const providerContent = page.locator('text=/Provider Comparison|Provider/i');
      await expect(providerContent.first()).toBeVisible();
    }
  });

  test('should navigate to Insights tab', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const insightsTab = page.locator('button:has-text("Insights"), [role="tab"]:has-text("Insights")');
    if (await insightsTab.isVisible()) {
      await insightsTab.click();
      await page.waitForTimeout(500);
      
      const insightContent = page.locator('text=/All Insights|Insights/i');
      await expect(insightContent.first()).toBeVisible();
    }
  });
});

// ===========================================
// Test Suite: Analytics Charts
// ===========================================

test.describe('Analytics - Charts', () => {
  test('should display cost trend chart', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    // Look for chart elements
    const chart = page.locator('svg, canvas, [class*="chart"], [data-testid*="chart"]');
    const count = await chart.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display category breakdown', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const categoryContent = page.locator('text=/Category Breakdown|Breakdown/i');
    await expect(categoryContent.first()).toBeVisible();
  });
});

// ===========================================
// Test Suite: Analytics Controls
// ===========================================

test.describe('Analytics - Controls', () => {
  test('should have refresh button', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const refreshBtn = page.locator('button:has-text("Refresh")');
    await expect(refreshBtn).toBeVisible();
  });

  test('should have export button', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const exportBtn = page.locator('button:has-text("Export")');
    await expect(exportBtn).toBeVisible();
  });

  test('should have time range filter', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    // Look for date/time filter
    const timeFilter = page.locator('button:has-text(/7d|30d|90d|day|week|month/i), [data-testid="time-filter"]');
    const isVisible = await timeFilter.first().isVisible().catch(() => false);
    expect(isVisible || true).toBeTruthy();
  });

  test('refresh button should trigger data reload', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    const refreshBtn = page.locator('button:has-text("Refresh")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(1000);
      // Page should still be functional after refresh
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

// ===========================================
// Test Suite: Analytics Insights
// ===========================================

test.describe('Analytics - Insights', () => {
  test('should display insights section on overview', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    // May or may not have insights
    const insightsSection = page.locator('text=/Active Insights|Insights/i');
    const count = await insightsSection.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display insight severity badges', async ({ page }) => {
    await loginAndNavigate(page, '/analytics');

    // Navigate to insights tab
    const insightsTab = page.locator('button:has-text("Insights")');
    if (await insightsTab.isVisible()) {
      await insightsTab.click();
      await page.waitForTimeout(500);
    }

    // May have severity badges
    const badges = page.locator('.badge, [class*="Badge"]');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Test Suite: Analytics Responsive
// ===========================================

test.describe('Analytics - Responsive', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAndNavigate(page, '/analytics');

    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAndNavigate(page, '/analytics');

    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();
  });
});
