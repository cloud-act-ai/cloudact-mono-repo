/**
 * Demo Account Setup Script
 *
 * Automated Playwright script to create a demo account via the signup flow.
 * Includes Stripe checkout automation and API key retrieval.
 *
 * Usage:
 *   npx tsx tests/demo-setup/setup-demo-account.ts
 *   npx tsx tests/demo-setup/setup-demo-account.ts --email=custom@test.com --company="My Company"
 *
 * Environment Variables:
 *   TEST_BASE_URL - Frontend URL (default: http://localhost:3000)
 *   TEST_HEADLESS - Run in headless mode (default: true)
 *   TEST_SLOW_MO - Slow down actions by ms (default: 0)
 *   CA_ROOT_API_KEY - Root API key for fetching org API key (from .env.local)
 *
 * Demo Account Values:
 *   Email: demo@cloudact.ai
 *   Password: demo1234
 *   Company: Acme Inc (system auto-generates org_slug as acme_inc_{timestamp} in base36)
 *   Plan: scale (free trial, no credit card required)
 */

import { chromium, Browser, Page } from 'playwright'
import { DEFAULT_DEMO_ACCOUNT, TEST_CONFIG, ENV_CONFIG } from './config'
import type { DemoAccountConfig } from './config'

interface SetupResult {
    success: boolean
    message: string
    orgSlug?: string
    apiKey?: string
    dashboardUrl?: string
    error?: string
}

function parseArgs(): Partial<DemoAccountConfig> {
    const args = process.argv.slice(2)
    const config: Partial<DemoAccountConfig> = {}

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key && value) {
            switch (key) {
                case 'firstName':
                    config.firstName = value
                    break
                case 'lastName':
                    config.lastName = value
                    break
                case 'email':
                    config.email = value
                    break
                case 'password':
                    config.password = value
                    break
                case 'phone':
                    config.phone = value
                    break
                case 'company':
                case 'companyName':
                    config.companyName = value
                    break
                case 'companyType':
                    config.companyType = value as DemoAccountConfig['companyType']
                    break
                case 'currency':
                    config.currency = value
                    break
                case 'timezone':
                    config.timezone = value
                    break
                case 'plan':
                    config.plan = value as DemoAccountConfig['plan']
                    break
            }
        }
    }

    return config
}

async function waitForUrlChange(page: Page, expectedPath: string, timeout = 30000): Promise<boolean> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
        if (page.url().includes(expectedPath)) {
            return true
        }
        await page.waitForTimeout(500)
    }
    return false
}

/**
 * Fetch org API key from the dev endpoint
 * API key is already created during backend onboarding - we just need to GET it
 */
async function fetchOrgApiKey(orgSlug: string): Promise<string | null> {
    const caRootApiKey = ENV_CONFIG.caRootApiKey
    if (!caRootApiKey) {
        console.error('  Missing CA_ROOT_API_KEY environment variable')
        return null
    }

    const apiUrl = `${TEST_CONFIG.apiServiceUrl}/api/v1/admin/dev/api-key/${orgSlug}`
    console.log(`  Fetching API key from: ${apiUrl}`)

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'X-CA-Root-Key': caRootApiKey,
            },
        })

        if (!response.ok) {
            console.error(`  API request failed: ${response.status} ${response.statusText}`)
            return null
        }

        const data = await response.json()
        if (data.api_key) {
            console.log(`  API key retrieved: ${data.api_key.substring(0, 20)}...`)
            return data.api_key
        }

        console.error('  API key not found in response')
        return null
    } catch (error) {
        console.error(`  Failed to fetch API key: ${error}`)
        return null
    }
}

/**
 * Handle Stripe checkout page - click "Start trial" button
 */
async function handleStripeCheckout(page: Page): Promise<boolean> {
    console.log('\n[Step 6/6] Handling Stripe checkout...')

    try {
        // Wait for Stripe page to fully load
        await page.waitForTimeout(2000)

        // Look for "Start trial" button on Stripe checkout
        // Stripe uses various button selectors
        const startTrialSelectors = [
            'button:has-text("Start trial")',
            'button:has-text("Start Trial")',
            '[data-testid="hosted-payment-submit-button"]',
            '.SubmitButton',
            'button[type="submit"]',
        ]

        for (const selector of startTrialSelectors) {
            const button = page.locator(selector).first()
            if (await button.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log(`  Found button with selector: ${selector}`)
                await button.click()
                console.log('  Clicked "Start trial" on Stripe')
                return true
            }
        }

        console.log('  Could not find Start trial button on Stripe')
        return false
    } catch (error) {
        console.error(`  Stripe checkout error: ${error}`)
        return false
    }
}

async function setupDemoAccount(config: DemoAccountConfig): Promise<SetupResult> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
        console.log('Starting demo account setup...')
        console.log(`  Email: ${config.email}`)
        console.log(`  Company: ${config.companyName}`)
        console.log(`  Plan: ${config.plan}`)

        // Launch browser
        browser = await chromium.launch({
            headless: TEST_CONFIG.headless,
            slowMo: TEST_CONFIG.slowMo,
        })

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
        })
        page = await context.newPage()

        // Step 1: Navigate to signup page
        console.log('\n[Step 1/5] Navigating to signup page...')
        await page.goto(`${TEST_CONFIG.baseUrl}/signup`)
        await page.waitForSelector('input[placeholder="John"]', { timeout: 10000 })
        console.log('  Signup page loaded')

        // Step 2: Fill account details (Step 1 of signup)
        console.log('\n[Step 2/5] Filling account details...')

        // Fill first name and last name
        await page.fill('input[placeholder="John"]', config.firstName)
        await page.fill('input[placeholder="Doe"]', config.lastName)

        // Fill email and password
        await page.fill('input[placeholder="you@company.com"]', config.email)
        await page.fill('input[placeholder="Min 8 characters"]', config.password)

        // Fill phone number (placeholder has dashes: 555-123-4567)
        await page.fill('input[placeholder="555-123-4567"]', config.phone)

        // Click Continue
        await page.click('button:has-text("Continue")')
        console.log('  Account details submitted')

        // Wait for step 2 (Organization setup)
        await page.waitForSelector('text=Set up organization', { timeout: 10000 })

        // Step 3: Fill organization details (Step 2 of signup)
        console.log('\n[Step 3/5] Filling organization details...')
        await page.fill('input[placeholder="Acme Inc."]', config.companyName)

        // Select company type
        await page.selectOption('select:near(:text("Company type"))', config.companyType)

        // Select currency
        await page.selectOption('select:near(:text("Currency"))', config.currency)

        // Select timezone
        await page.selectOption('select:near(:text("Timezone"))', config.timezone)

        // Click Create account
        await page.click('button:has-text("Create account")')
        console.log('  Organization details submitted')

        // Wait for billing page
        const billingLoaded = await waitForUrlChange(page, '/onboarding/billing', 30000)
        if (!billingLoaded) {
            throw new Error('Failed to navigate to billing page - signup may have failed')
        }
        console.log('  Signup successful, on billing page')

        // Step 4: Select plan
        console.log(`\n[Step 4/5] Selecting ${config.plan} plan...`)
        await page.waitForSelector('text=Choose your plan', { timeout: 10000 })

        // Wait for plans to load (wait for "Loading plans..." to disappear)
        console.log('  Waiting for plans to load...')
        await page.waitForSelector('text=Loading plans...', { state: 'hidden', timeout: 30000 }).catch(() => {})

        // Wait for plan cards to appear (look for price text like "$19" or plan names)
        await page.waitForSelector('text=$19', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(1000) // Extra wait for rendering

        // Click the appropriate plan card
        const planSelectors: Record<string, string> = {
            'starter': 'text=Starter',
            'professional': 'text=Professional',
            'scale': 'text=Scale',
        }

        // Click on the plan card to select it
        const planSelector = planSelectors[config.plan]
        const planCard = await page.locator(planSelector).first()
        if (await planCard.isVisible()) {
            await planCard.click()
            console.log(`  ${config.plan} plan selected`)
        } else {
            // Fallback: try clicking Select Plan buttons by index
            const planButtons = await page.$$('button:has-text("Select")')
            let planIndex = 0
            switch (config.plan) {
                case 'starter': planIndex = 0; break
                case 'professional': planIndex = 1; break
                case 'scale': planIndex = 2; break
            }
            if (planButtons[planIndex]) {
                await planButtons[planIndex].click()
                console.log(`  ${config.plan} plan selected (fallback)`)
            } else {
                throw new Error(`Could not find ${config.plan} plan button`)
            }
        }

        // Step 5: Start trial (no credit card for Scale plan trial)
        console.log('\n[Step 5/5] Starting trial...')

        // Look for "Start trial" or "Continue to Checkout" button
        const startTrialButton = page.locator('button:has-text("Start trial"), button:has-text("Start Trial")')
        const checkoutButton = page.locator('button:has-text("Continue to Checkout")')

        if (await startTrialButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('  Clicking "Start trial" button...')
            await startTrialButton.click()
        } else if (await checkoutButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('  Clicking "Continue to Checkout" button...')
            await checkoutButton.click()
        } else {
            throw new Error('Could not find Start trial or Continue to Checkout button')
        }

        // Wait for organization setup to complete
        console.log('  Waiting for organization setup to complete...')

        // Wait for redirect to dashboard or success page (up to 60 seconds for backend onboarding)
        const setupComplete = await Promise.race([
            waitForUrlChange(page, '/dashboard', 60000),
            waitForUrlChange(page, '/onboarding/success', 60000),
            page.waitForURL('**/checkout.stripe.com/**', { timeout: 60000 }).then(() => 'stripe').catch(() => null),
        ])

        const currentUrl = page.url()

        if (currentUrl.includes('checkout.stripe.com')) {
            console.log('  Redirected to Stripe checkout')

            // Handle Stripe checkout - click "Start trial"
            const stripeHandled = await handleStripeCheckout(page)

            if (stripeHandled) {
                // Wait for redirect back to our app (dashboard or success page)
                console.log('  Waiting for redirect from Stripe...')
                const redirected = await Promise.race([
                    waitForUrlChange(page, '/dashboard', 90000),
                    waitForUrlChange(page, '/onboarding/success', 90000),
                    waitForUrlChange(page, TEST_CONFIG.baseUrl, 90000),
                ])

                if (redirected) {
                    await page.waitForTimeout(3000) // Wait for page to fully load
                }
            }

            // Check where we ended up
            const finalUrl = page.url()
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/dashboard/)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : config.companyName.toLowerCase().replace(/\s+/g, '_')

            if (finalUrl.includes('/dashboard')) {
                console.log('  Organization setup completed!')
                console.log(`  Org Slug: ${orgSlug}`)
                console.log(`  Dashboard URL: ${finalUrl}`)

                // Fetch the API key
                console.log('\n[Step 7/7] Fetching API key...')
                const apiKey = await fetchOrgApiKey(orgSlug)

                return {
                    success: true,
                    message: 'Demo account created and onboarding completed!',
                    orgSlug,
                    apiKey: apiKey || undefined,
                    dashboardUrl: finalUrl,
                }
            } else {
                // Still on Stripe or somewhere else
                return {
                    success: true,
                    message: `Demo account created. Please complete Stripe checkout manually. Current page: ${finalUrl}`,
                    orgSlug,
                }
            }
        } else if (currentUrl.includes('/dashboard')) {
            console.log('  Organization setup completed!')

            // Extract org slug from URL (e.g., /acme_inc_ml01ua8p/dashboard)
            const orgSlugMatch = currentUrl.match(/\/([^/]+)\/dashboard/)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : config.companyName.toLowerCase().replace(/\s+/g, '_')

            console.log(`  Org Slug: ${orgSlug}`)
            console.log(`  Dashboard URL: ${currentUrl}`)

            // Fetch the API key
            console.log('\n[Step 7/7] Fetching API key...')
            const apiKey = await fetchOrgApiKey(orgSlug)

            return {
                success: true,
                message: 'Demo account created and onboarding completed!',
                orgSlug,
                apiKey: apiKey || undefined,
                dashboardUrl: currentUrl,
            }
        } else if (currentUrl.includes('/onboarding/success')) {
            console.log('  Onboarding success page reached!')

            // Wait a bit then check for redirect to dashboard
            await page.waitForTimeout(3000)
            const finalUrl = page.url()
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/dashboard/)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : config.companyName.toLowerCase().replace(/\s+/g, '_')

            // Fetch the API key
            console.log('\n[Step 7/7] Fetching API key...')
            const apiKey = await fetchOrgApiKey(orgSlug)

            return {
                success: true,
                message: 'Demo account created and onboarding completed!',
                orgSlug,
                apiKey: apiKey || undefined,
                dashboardUrl: finalUrl,
            }
        } else {
            // Still wait and check the current page
            await page.waitForTimeout(5000)
            const finalUrl = page.url()
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/dashboard/)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : config.companyName.toLowerCase().replace(/\s+/g, '_')

            // Try to fetch API key anyway
            console.log('\n[Step 7/7] Fetching API key...')
            const apiKey = await fetchOrgApiKey(orgSlug)

            return {
                success: true,
                message: `Demo account created. Current page: ${finalUrl}`,
                orgSlug,
                apiKey: apiKey || undefined,
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${errorMessage}`)

        // Take screenshot on error
        if (page) {
            const screenshotPath = `tests/demo-setup/error-screenshot-${Date.now()}.png`
            await page.screenshot({ path: screenshotPath })
            console.log(`  Screenshot saved: ${screenshotPath}`)
        }

        return {
            success: false,
            message: 'Demo account setup failed',
            error: errorMessage,
        }
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}

// Main execution
async function main() {
    const overrides = parseArgs()
    const config: DemoAccountConfig = { ...DEFAULT_DEMO_ACCOUNT, ...overrides }

    console.log('=' .repeat(60))
    console.log('Demo Account Setup')
    console.log('=' .repeat(60))
    console.log('\nDemo Account Values:')
    console.log(`  Email: ${config.email}`)
    console.log(`  Password: ${config.password}`)
    console.log(`  Company: ${config.companyName}`)
    console.log(`  Plan: ${config.plan}`)
    console.log('')

    const result = await setupDemoAccount(config)

    console.log('\n' + '=' .repeat(60))
    console.log('Result:', result.success ? 'SUCCESS' : 'FAILED')
    console.log('=' .repeat(60))
    console.log(JSON.stringify(result, null, 2))

    // Print export commands for next steps
    if (result.success && result.orgSlug) {
        console.log('\n' + '=' .repeat(60))
        console.log('Next Steps:')
        console.log('=' .repeat(60))
        console.log(`\nexport ORG_SLUG="${result.orgSlug}"`)
        if (result.apiKey) {
            console.log(`export ORG_API_KEY="${result.apiKey}"`)
        }
        console.log(`\n# Load demo data:`)
        console.log(`npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY`)
        console.log(`\n# Dashboard URL:`)
        console.log(`open ${result.dashboardUrl || `http://localhost:3000/${result.orgSlug}/dashboard`}`)
    }

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { setupDemoAccount }
export type { DemoAccountConfig, SetupResult }
