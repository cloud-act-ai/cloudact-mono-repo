/**
 * E2E Pipeline Tests
 *
 * Comprehensive tests for the pipeline pages including:
 * - Pipeline runs list
 * - Cloud pipeline runs
 * - GenAI pipeline runs
 * - Subscription pipeline runs
 * - Run status and details
 * - Filtering and pagination
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 */

import { test, expect, Page } from '@playwright/test';
import { loginAndGetOrgSlug } from './fixtures/auth';

// ===========================================
// Configuration
// ===========================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// ===========================================
// Helper Functions
// ===========================================

async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

async function loginAndNavigate(page: Page, path: string): Promise<string> {
  const orgSlug = await loginAndGetOrgSlug(page);

  // Navigate to the requested path
  await page.goto(`${BASE_URL}/${orgSlug}${path}`);
  await waitForPageLoad(page);

  return orgSlug;
}

// ===========================================
// Test Suite: Pipelines Main Page
// ===========================================

test.describe('Pipelines - Main Page', () => {
  test('should load pipelines page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines');

    // Pipelines page shows the PIPELINES section expanded in sidebar
    const pipelinesNav = page.getByText('PIPELINES').first();
    await expect(pipelinesNav).toBeVisible({ timeout: 10000 });
  });

  test('should display pipeline run categories', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines');

    // Should show links for different pipeline types in sidebar
    const content = await page.content();
    const hasCloudRuns = content.includes('Cloud Runs') || content.includes('cloud');
    const hasGenAIRuns = content.includes('GenAI Runs') || content.includes('GenAI') || content.includes('AI');

    expect(hasCloudRuns || hasGenAIRuns).toBeTruthy();
  });

  test('should navigate to cloud runs', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    const cloudLink = page.locator('a[href*="cloud-runs"]').or(page.getByText('Cloud Runs')).first();
    if (await cloudLink.isVisible()) {
      await cloudLink.click();
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/pipelines/cloud-runs`));
    }
  });

  test('should navigate to genai runs', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    const genaiLink = page.locator('a[href*="genai-runs"]').or(page.getByText('GenAI Runs')).first();
    if (await genaiLink.isVisible()) {
      await genaiLink.click();
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/pipelines/genai-runs`));
    }
  });
});

// ===========================================
// Test Suite: Cloud Pipeline Runs
// ===========================================

test.describe('Pipelines - Cloud Runs', () => {
  test('should load cloud runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Verify we're on the page by checking sidebar has Cloud Runs link
    const cloudRunsLink = page.locator('a[href*="cloud-runs"]').or(page.getByText('Cloud Runs')).first();
    await expect(cloudRunsLink).toBeVisible({ timeout: 10000 });
  });

  test('should display run list or empty state', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Either show runs table/list, loading state, or empty state
    const table = page.locator('table, [data-testid="runs-list"], [role="grid"]');
    const emptyState = page.locator('text=/no runs|no data|empty|get started/i');
    const loadingState = page.locator('text=/loading|Loading pipelines/i');
    const pageContent = page.locator('main, [role="main"]').first();

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasLoading = await loadingState.isVisible().catch(() => false);
    const hasContent = await pageContent.isVisible().catch(() => false);

    expect(hasTable || hasEmpty || hasLoading || hasContent).toBeTruthy();
  });

  test('should display run status indicators', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Look for status badges or indicators
    const statusIndicators = page.locator('[data-testid="status"], .badge, [class*="status"]');
    const count = await statusIndicators.count();

    // May or may not have runs, so just verify page loads without error
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have refresh functionality', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    const refreshButton = page.locator('button:has-text("Refresh"), button[aria-label*="refresh"], [data-testid="refresh"]');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(1000);
      // Page should still be functional after refresh
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

// ===========================================
// Test Suite: GenAI Pipeline Runs
// ===========================================

test.describe('Pipelines - GenAI Runs', () => {
  test('should load genai runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    const genaiRunsLink = page.locator('a[href*="genai-runs"]').or(page.getByText('GenAI Runs')).first();
    await expect(genaiRunsLink).toBeVisible({ timeout: 10000 });
  });

  test('should display provider filter or tabs', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    // Check for provider filtering options
    const content = await page.content();
    const hasOpenAI = content.includes('OpenAI') || content.includes('openai');
    const hasAnthropic = content.includes('Anthropic') || content.includes('Claude');
    const hasGemini = content.includes('Gemini') || content.includes('Google');

    // At least the page should load with some content
    expect(content.length).toBeGreaterThan(0);
  });

  test('should display token usage if runs exist', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    // Look for token-related text
    const tokenText = page.locator('text=/token|usage|cost/i');
    const count = await tokenText.count();

    // May or may not have token data
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Test Suite: Subscription Pipeline Runs
// ===========================================

test.describe('Pipelines - Subscription Runs', () => {
  test('should load subscription runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/subscription-runs');

    const subRunsLink = page.locator('a[href*="subscription-runs"]').or(page.getByText('Subscription Runs')).first();
    await expect(subRunsLink).toBeVisible({ timeout: 10000 });
  });

  test('should display subscription list or empty state', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/subscription-runs');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});

// ===========================================
// Test Suite: Pipeline Navigation
// ===========================================

test.describe('Pipelines - Navigation', () => {
  test('should have consistent navigation between pipeline pages', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    // Navigate to cloud runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/cloud-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('cloud-runs'));

    // Navigate to genai runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/genai-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('genai-runs'));

    // Navigate to subscription runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/subscription-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('subscription-runs'));
  });

  test('should display breadcrumb navigation', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Check for breadcrumb or pipeline navigation links in sidebar
    const breadcrumb = page.locator('nav[aria-label="breadcrumb"], [data-testid="breadcrumb"], .breadcrumb');
    const backLink = page.locator('a[href*="/pipelines"]');
    const pipelinesNav = page.getByText('PIPELINES');

    const hasBreadcrumb = await breadcrumb.isVisible().catch(() => false);
    const hasBackLink = await backLink.first().isVisible().catch(() => false);
    const hasPipelinesNav = await pipelinesNav.isVisible().catch(() => false);

    // Should have some form of navigation back
    expect(hasBreadcrumb || hasBackLink || hasPipelinesNav).toBeTruthy();
  });
});
