/**
 * Demo Account Setup Script
 *
 * Automated Playwright script to create a demo account via the signup flow.
 * Can be run standalone or via Claude command.
 *
 * Usage:
 *   npx ts-node tests/demo-setup/setup-demo-account.ts
 *   npx ts-node tests/demo-setup/setup-demo-account.ts --email=custom@test.com --company="My Company"
 *
 * Environment Variables:
 *   TEST_BASE_URL - Frontend URL (default: http://localhost:3000)
 *   TEST_HEADLESS - Run in headless mode (default: true)
 *   TEST_SLOW_MO - Slow down actions by ms (default: 0)
 */

import { chromium, Browser, Page } from 'playwright'
import { DEFAULT_DEMO_ACCOUNT, TEST_CONFIG } from './config'
import type { DemoAccountConfig } from './config'

interface SetupResult {
    success: boolean
    message: string
    orgSlug?: string
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

        // Wait for "Continue to Checkout" button to be enabled
        await page.waitForSelector('button:has-text("Continue to Checkout")', { timeout: 5000 })

        // Step 5: Handle checkout
        console.log('\n[Step 5/5] Proceeding to checkout...')
        await page.click('button:has-text("Continue to Checkout")')

        // Wait for Stripe checkout or success page
        // Note: For demo purposes, we might redirect to Stripe or skip to success
        await page.waitForTimeout(3000)

        const currentUrl = page.url()

        if (currentUrl.includes('checkout.stripe.com')) {
            console.log('  Redirected to Stripe checkout')
            console.log('  NOTE: Complete Stripe checkout manually or use test card automation')

            return {
                success: true,
                message: 'Demo account created, awaiting Stripe checkout completion',
                orgSlug: config.companyName.toLowerCase().replace(/\s+/g, '_'),
            }
        } else if (currentUrl.includes('/onboarding/success') || currentUrl.includes('/dashboard')) {
            console.log('  Checkout completed successfully!')

            // Extract org slug from URL
            const orgSlugMatch = currentUrl.match(/\/([^/]+)\/dashboard/)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : config.companyName.toLowerCase().replace(/\s+/g, '_')

            return {
                success: true,
                message: 'Demo account created and onboarding completed!',
                orgSlug,
                dashboardUrl: currentUrl,
            }
        } else {
            return {
                success: true,
                message: `Demo account created. Current page: ${currentUrl}`,
                orgSlug: config.companyName.toLowerCase().replace(/\s+/g, '_'),
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

    const result = await setupDemoAccount(config)

    console.log('\n' + '=' .repeat(60))
    console.log('Result:', result.success ? 'SUCCESS' : 'FAILED')
    console.log('=' .repeat(60))
    console.log(JSON.stringify(result, null, 2))

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { setupDemoAccount }
export type { DemoAccountConfig, SetupResult }
