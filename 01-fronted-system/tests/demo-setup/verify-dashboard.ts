/**
 * Dashboard Verification via Playwright
 *
 * Logs into the frontend, navigates to the dashboard, waits for cost data to
 * appear, takes a screenshot, and extracts dollar amounts for verification.
 *
 * Usage:
 *   npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=$ORG_SLUG
 *   npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=$ORG_SLUG --screenshot-dir=/tmp
 *
 * Prerequisites:
 *   - Frontend running (default http://localhost:3000)
 *   - Demo account exists with loaded cost data
 *
 * Exit codes:
 *   0 = PASSED (non-zero dollar amounts found, no "no data" warnings)
 *   1 = FAILED (no dollar amounts, or "no data" warnings present)
 */

import { chromium, Page } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { DEFAULT_DEMO_ACCOUNT, TEST_CONFIG } from './config'

export interface DashboardVerificationResult {
    passed: boolean
    screenshot: string | null
    amounts: string[]
    errors: string[]
    url: string
}

const NO_DATA_WARNINGS = [
    'No cost data',
    'No GenAI costs',
    'No cloud costs',
    'No subscription costs',
]

/**
 * Wait for dollar amounts to appear in the page body.
 * Polls every 3s up to the given timeout.
 * Looks for amounts >= $1,000 to avoid CSS/JS noise.
 */
async function waitForCostData(page: Page, timeout = 45000): Promise<string[]> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const amounts = await extractDollarAmounts(page)
        if (amounts.length > 0) {
            return amounts
        }
        await page.waitForTimeout(3000)
    }
    return []
}

/**
 * Extract meaningful dollar amounts from the page body text.
 * Filters out small values (< $1,000) that come from CSS/JS or pricing cards.
 * Real demo cost data is in thousands ($7K+) to hundreds of thousands ($170K+).
 */
async function extractDollarAmounts(page: Page): Promise<string[]> {
    const bodyText = await page.textContent('body') || ''
    const matches = bodyText.match(/\$[\d,.]+/g)
    if (!matches) return []
    // Filter: only keep amounts >= $1,000 (real cost data, not CSS/JS/pricing noise)
    const meaningful = [...new Set(matches)].filter(a => {
        const num = parseFloat(a.replace(/[$,]/g, ''))
        return num >= 1000
    })
    return meaningful
}

/**
 * Check for "no data" warning messages in the page.
 */
async function checkNoDataWarnings(page: Page): Promise<string[]> {
    const bodyText = await page.textContent('body') || ''
    const found: string[] = []
    for (const warning of NO_DATA_WARNINGS) {
        if (bodyText.includes(warning)) {
            found.push(warning)
        }
    }
    return found
}

/**
 * Run full dashboard verification flow.
 */
export async function verifyDashboard(
    orgSlug: string,
    screenshotDir?: string
): Promise<DashboardVerificationResult> {
    const baseUrl = TEST_CONFIG.baseUrl
    const dashboardUrl = `${baseUrl}/${orgSlug}/dashboard`
    const outDir = screenshotDir || path.resolve(__dirname, 'screenshots')

    const result: DashboardVerificationResult = {
        passed: false,
        screenshot: null,
        amounts: [],
        errors: [],
        url: dashboardUrl,
    }

    // Ensure screenshot directory exists
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true })
    }

    let browser
    try {
        browser = await chromium.launch({
            headless: TEST_CONFIG.headless,
            slowMo: TEST_CONFIG.slowMo,
        })
        const page = await browser.newPage()

        // Step 1: Login
        console.log('  Logging in...')
        await page.goto(`${baseUrl}/login`, { timeout: TEST_CONFIG.timeout })
        await page.waitForLoadState('networkidle')

        await page.fill('input[type="email"], input[name="email"]', DEFAULT_DEMO_ACCOUNT.email)
        await page.fill('input[type="password"], input[name="password"]', DEFAULT_DEMO_ACCOUNT.password)
        await page.click('button[type="submit"]')

        await page.waitForURL(/\/(dashboard|integrations)/, { timeout: 15000 }).catch(() => {
            // May redirect elsewhere; we navigate explicitly next
        })

        // Step 2: Navigate to org dashboard
        // Default time range is "365" (Last 365 Days) which covers demo data (Dec 2025 - Jan 2026)
        console.log(`  Navigating to ${dashboardUrl}...`)
        await page.goto(dashboardUrl, { timeout: TEST_CONFIG.timeout })
        await page.waitForLoadState('networkidle')

        // Step 3: Wait for cost data (API calls need time to complete)
        console.log('  Waiting for cost data (up to 45s)...')
        const amounts = await waitForCostData(page, 45000)
        result.amounts = amounts

        // Step 4: Check for "no data" warnings
        const warnings = await checkNoDataWarnings(page)

        // Step 5: Take screenshot
        const timestamp = Math.floor(Date.now() / 1000)
        const screenshotPath = path.join(outDir, `dashboard-verified-${timestamp}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        result.screenshot = screenshotPath
        console.log(`  Screenshot saved: ${screenshotPath}`)

        // Step 6: Evaluate pass/fail
        if (amounts.length === 0) {
            result.errors.push('No non-zero dollar amounts found on dashboard')
        }
        if (warnings.length > 0) {
            result.errors.push(`"No data" warnings found: ${warnings.join(', ')}`)
        }

        // Need at least 3 distinct non-zero amounts for a passing result
        const MIN_AMOUNTS = 3
        if (amounts.length < MIN_AMOUNTS) {
            result.errors.push(`Found ${amounts.length} non-zero amounts, expected at least ${MIN_AMOUNTS}`)
        }

        result.passed = result.errors.length === 0
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        result.errors.push(`Playwright error: ${msg}`)
    } finally {
        if (browser) {
            await browser.close()
        }
    }

    return result
}

/**
 * Print human-readable verification summary.
 */
function printResult(result: DashboardVerificationResult): void {
    console.log('\nDashboard Verification:')
    console.log(`  URL: ${result.url}`)
    if (result.screenshot) {
        console.log(`  Screenshot: ${result.screenshot}`)
    }
    if (result.amounts.length > 0) {
        console.log(`  Dollar amounts found: ${result.amounts.join(', ')}`)
    } else {
        console.log('  Dollar amounts found: NONE')
    }
    if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.join('; ')}`)
    }
    console.log(`  Result: ${result.passed ? 'PASSED' : 'FAILED'}`)
}

// CLI entrypoint
async function main() {
    const args = process.argv.slice(2)
    let orgSlug = ''
    let screenshotDir: string | undefined

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key === 'org-slug' || key === 'orgSlug') orgSlug = value
        if (key === 'screenshot-dir' || key === 'screenshotDir') screenshotDir = value
    }

    if (!orgSlug) {
        console.log('Usage:')
        console.log('  npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=<slug>')
        console.log('  npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=<slug> --screenshot-dir=/tmp')
        process.exit(1)
    }

    console.log(`[Dashboard Verification] org=${orgSlug}`)
    const result = await verifyDashboard(orgSlug, screenshotDir)
    printResult(result)
    process.exit(result.passed ? 0 : 1)
}

// Run if executed directly (not imported)
const isDirectRun = require.main === module || process.argv[1]?.endsWith('verify-dashboard.ts')
if (isDirectRun) {
    main().catch(console.error)
}
