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
 *   Password: Demo1234
 *   Company: Acme Inc (system auto-generates org_slug as acme_inc_{timestamp} in base36)
 *   Plan: scale (free trial, no credit card required)
 */

import { execSync } from 'child_process'
import { chromium, Browser, Page } from 'playwright'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_DEMO_ACCOUNT, TEST_CONFIG, ENV_CONFIG } from './config'
import type { DemoAccountConfig } from './config'

/**
 * Resolve SUPABASE_SERVICE_ROLE_KEY: env var → GCP Secret Manager fallback.
 * .env.prod has placeholder (INJECTED_FROM_SECRET_MANAGER), so auto-fetch from GCP.
 */
function resolveSupabaseServiceRoleKey(): string {
    const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (fromEnv && !fromEnv.includes('INJECTED_FROM') && !fromEnv.includes('_AT_BUILD_TIME')) {
        return fromEnv
    }
    if (ENV_CONFIG.environment !== 'local') {
        try {
            const secretName = `supabase-service-role-key-${ENV_CONFIG.environment}`
            return execSync(
                `gcloud secrets versions access latest --secret=${secretName} --project=${ENV_CONFIG.gcpProjectId}`,
                { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim()
        } catch {
            return ''
        }
    }
    return fromEnv
}

const SUPABASE_SERVICE_ROLE_KEY = resolveSupabaseServiceRoleKey()

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
 * Query Supabase for the actual org slug by admin email
 * Org slug format: {company_name}_{base36_timestamp} e.g. acme_inc_mlj3ql4q
 * The base36 timestamp is generated at signup time - we must query to get it
 */
async function fetchOrgSlugFromSupabase(email: string): Promise<string | null> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ENV_CONFIG.supabaseUrl
    const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        console.log('  Cannot query Supabase: missing URL or service role key')
        return null
    }

    try {
        // Query organizations joined with org_members and auth users to find by email
        // Simpler: query organizations ordered by created_at desc, matching the base slug pattern
        const baseSlug = DEFAULT_DEMO_ACCOUNT.companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_')
        const response = await fetch(
            `${supabaseUrl}/rest/v1/organizations?select=org_slug&org_slug=like.${baseSlug}*&order=created_at.desc&limit=1`,
            {
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                },
            }
        )

        if (!response.ok) {
            console.log(`  Supabase query failed: ${response.status}`)
            return null
        }

        const data = await response.json()
        if (data.length > 0) {
            console.log(`  Found org slug from Supabase: ${data[0].org_slug}`)
            return data[0].org_slug
        }

        console.log('  No matching org found in Supabase')
        return null
    } catch (error) {
        console.log(`  Supabase query error: ${error}`)
        return null
    }
}

/**
 * Poll Supabase org_api_keys_secure for the API key.
 * The frontend's completeOnboarding() server action stores the key here
 * via storeApiKeySecure(). This is the single source of truth.
 *
 * Polls every 5s until found or timeout.
 */
async function pollForApiKeyFromSupabase(orgSlug: string, timeoutMs = 90000): Promise<string | null> {
    const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        console.error('  SUPABASE_SERVICE_ROLE_KEY not set - cannot poll for API key')
        return null
    }

    const supabase = createSupabaseClient(ENV_CONFIG.supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })

    console.log(`  Polling Supabase org_api_keys_secure (timeout: ${timeoutMs / 1000}s)...`)
    const startTime = Date.now()
    let attempt = 0

    while (Date.now() - startTime < timeoutMs) {
        attempt++
        try {
            const { data, error } = await supabase
                .from('org_api_keys_secure')
                .select('api_key')
                .eq('org_slug', orgSlug)
                .single()

            if (!error && data?.api_key) {
                console.log(`  API key found in Supabase after ${attempt} attempt(s): ${data.api_key.substring(0, 20)}...`)
                return data.api_key
            }
        } catch {
            // Ignore and retry
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000)
        console.log(`  Attempt ${attempt}: API key not in Supabase yet (${elapsed}s elapsed)`)
        await new Promise(resolve => setTimeout(resolve, 5000))
    }

    console.log(`  API key not found in Supabase after ${Math.round(timeoutMs / 1000)}s`)
    return null
}

/**
 * Verify backend onboarding completed and retrieve API key from Supabase.
 *
 * The frontend's /onboarding/success page calls completeOnboarding() which:
 *   1. Creates org in Supabase
 *   2. Calls onboardToBackend() → creates BigQuery dataset + API key
 *   3. Calls storeApiKeySecure() → stores key in org_api_keys_secure
 *
 * We poll org_api_keys_secure because that's what the frontend uses.
 * No manual onboarding fallback — the frontend flow must complete on its own.
 */
async function verifyOnboardingAndGetApiKey(orgSlug: string, _companyName: string, _email: string): Promise<string> {
    console.log('\n[Onboarding Verification] Waiting for frontend onboarding to store API key in Supabase...')

    const apiKey = await pollForApiKeyFromSupabase(orgSlug, 90000)
    if (apiKey) {
        console.log('  Onboarding verified (API key found in Supabase org_api_keys_secure)')
        return apiKey
    }

    throw new Error(
        `Onboarding failed for ${orgSlug}: API key not found in Supabase org_api_keys_secure after 90s. ` +
        'The frontend completeOnboarding() server action may have failed. ' +
        'Check: 1) /onboarding/success page loaded, 2) API service is healthy, 3) Bootstrap has been run.'
    )
}

/**
 * Handle Stripe checkout page - click "Start trial" button
 */
async function handleStripeCheckout(page: Page): Promise<boolean> {
    console.log('\n[Step 6/6] Handling Stripe checkout...')
    console.log(`  Current URL: ${page.url()}`)

    try {
        // Wait for Stripe page to fully load (Stripe can be slow)
        console.log('  Waiting for Stripe page to fully load...')
        await page.waitForTimeout(5000)

        // Log page title for debugging
        const title = await page.title()
        console.log(`  Page title: ${title}`)

        // Look for "Start trial" button on Stripe checkout
        // Stripe uses various button selectors - try multiple approaches
        const startTrialSelectors = [
            'button:has-text("Start trial")',
            'button:has-text("Start Trial")',
            'button:has-text("Start free trial")',
            'button:has-text("Subscribe")',
            '[data-testid="hosted-payment-submit-button"]',
            '.SubmitButton-IconContainer',
            '.SubmitButton',
            'button[type="submit"]',
            // Stripe's newer checkout uses spans inside buttons
            'button >> text=Start trial',
            'button >> text=Start Trial',
        ]

        for (const selector of startTrialSelectors) {
            try {
                const button = page.locator(selector).first()
                const isVisible = await button.isVisible({ timeout: 3000 }).catch(() => false)
                if (isVisible) {
                    console.log(`  Found button with selector: ${selector}`)
                    // Scroll into view and click
                    await button.scrollIntoViewIfNeeded()
                    await page.waitForTimeout(500)
                    await button.click({ force: true })
                    console.log('  Clicked "Start trial" on Stripe')
                    // Wait a moment for the click to register
                    await page.waitForTimeout(3000)
                    return true
                }
            } catch {
                // Continue to next selector
            }
        }

        // Last resort: try clicking any visible green/primary button
        console.log('  Trying to find any submit-like button...')
        const allButtons = page.locator('button')
        const buttonCount = await allButtons.count()
        console.log(`  Found ${buttonCount} buttons on page`)
        for (let i = 0; i < buttonCount; i++) {
            const btn = allButtons.nth(i)
            const text = await btn.textContent().catch(() => '')
            const isVisible = await btn.isVisible().catch(() => false)
            if (isVisible) {
                console.log(`  Button ${i}: "${text?.trim()}"`)
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

        // Wait for redirect to dashboard, integrations, success page, or Stripe
        // NOTE: Stripe checkout uses custom domain pay.cloudact.ai (not checkout.stripe.com)
        const setupComplete = await Promise.race([
            waitForUrlChange(page, '/dashboard', 60000),
            waitForUrlChange(page, '/integrations', 60000),
            waitForUrlChange(page, '/onboarding/success', 60000),
            waitForUrlChange(page, '/c/pay/', 60000).then((found) => found ? 'stripe' as const : null),
            page.waitForURL('**/checkout.stripe.com/**', { timeout: 60000 }).then(() => 'stripe' as const).catch(() => null),
            page.waitForURL('**/pay.cloudact.ai/**', { timeout: 60000 }).then(() => 'stripe' as const).catch(() => null),
        ])

        const currentUrl = page.url()
        console.log(`  Race result: ${setupComplete}, URL: ${currentUrl}`)

        // Stripe checkout may be on custom domain (pay.cloudact.ai) or stripe.com
        const isStripeCheckout = currentUrl.includes('stripe.com') ||
            currentUrl.includes('pay.cloudact.ai') ||
            currentUrl.includes('/c/pay/') ||
            setupComplete === 'stripe'

        if (isStripeCheckout) {
            console.log('  Redirected to Stripe checkout')

            // Handle Stripe checkout - click "Start trial"
            const stripeHandled = await handleStripeCheckout(page)

            if (stripeHandled) {
                // Wait for redirect back to our app
                // Flow: Stripe → /onboarding/success → completeOnboarding() → /{orgSlug}/integrations
                console.log('  Waiting for redirect from Stripe...')
                await Promise.race([
                    waitForUrlChange(page, '/onboarding/success', 90000),
                    waitForUrlChange(page, '/dashboard', 90000),
                    waitForUrlChange(page, '/integrations', 90000),
                    waitForUrlChange(page, TEST_CONFIG.baseUrl, 90000),
                ])

                const afterStripeUrl = page.url()
                console.log(`  After Stripe redirect: ${afterStripeUrl}`)

                // If we hit /onboarding/success, wait for it to complete and redirect to /integrations
                if (afterStripeUrl.includes('/onboarding/success')) {
                    console.log('  Onboarding success page loaded - waiting for backend onboarding to complete...')
                    // The page runs completeOnboarding() then redirects to /{orgSlug}/integrations
                    // Wait up to 90s for the onboarding to finish and redirect
                    try {
                        await page.waitForURL('**/integrations**', { timeout: 90000 })
                        console.log(`  Onboarding complete! Redirected to: ${page.url()}`)
                    } catch {
                        console.log(`  Onboarding redirect timed out. Current URL: ${page.url()}`)
                    }
                }
            }

            // Check where we ended up
            const finalUrl = page.url()
            // Extract org slug from URL patterns: /{orgSlug}/dashboard or /{orgSlug}/integrations
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/(dashboard|integrations)/)
            const orgSlugFromSupabase = orgSlugMatch ? null : await fetchOrgSlugFromSupabase(config.email)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : orgSlugFromSupabase
            if (!orgSlug) {
                throw new Error('Could not determine org slug from URL or Supabase. Check Supabase connection and SUPABASE_SERVICE_ROLE_KEY.')
            }

            if (finalUrl.includes('/dashboard') || finalUrl.includes('/integrations')) {
                console.log('  Organization setup completed!')
                console.log(`  Org Slug: ${orgSlug}`)
                console.log(`  Current URL: ${finalUrl}`)

                // Verify onboarding + get API key from Supabase
                const apiKey = await verifyOnboardingAndGetApiKey(orgSlug, config.companyName, config.email)

                return {
                    success: true,
                    message: 'Demo account created and onboarding completed!',
                    orgSlug,
                    apiKey,
                    dashboardUrl: `${TEST_CONFIG.baseUrl}/${orgSlug}/dashboard`,
                }
            } else {
                // Still somewhere unexpected - still verify onboarding
                const apiKey = await verifyOnboardingAndGetApiKey(orgSlug, config.companyName, config.email)

                return {
                    success: true,
                    message: `Demo account created. Current page: ${finalUrl}`,
                    orgSlug,
                    apiKey,
                }
            }
        } else if (currentUrl.includes('/dashboard') || currentUrl.includes('/integrations')) {
            console.log('  Organization setup completed!')

            // Extract org slug from URL (e.g., /acme_inc_xxx/dashboard or /acme_inc_xxx/integrations)
            const orgSlugMatch = currentUrl.match(/\/([^/]+)\/(dashboard|integrations)/)
            const orgSlugFromSupabase = orgSlugMatch ? null : await fetchOrgSlugFromSupabase(config.email)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : orgSlugFromSupabase
            if (!orgSlug) {
                throw new Error('Could not determine org slug from URL or Supabase. Check Supabase connection and SUPABASE_SERVICE_ROLE_KEY.')
            }

            console.log(`  Org Slug: ${orgSlug}`)
            console.log(`  Current URL: ${currentUrl}`)

            // Verify onboarding + get API key
            const apiKey = await verifyOnboardingAndGetApiKey(orgSlug, config.companyName, config.email)

            return {
                success: true,
                message: 'Demo account created and onboarding completed!',
                orgSlug,
                apiKey,
                dashboardUrl: `${TEST_CONFIG.baseUrl}/${orgSlug}/dashboard`,
            }
        } else if (currentUrl.includes('/onboarding/success')) {
            console.log('  Onboarding success page reached! Waiting for onboarding to complete...')

            // Wait for /onboarding/success to finish and redirect to /integrations
            try {
                await page.waitForURL('**/integrations**', { timeout: 90000 })
                console.log(`  Onboarding complete! Redirected to: ${page.url()}`)
            } catch {
                console.log(`  Onboarding redirect timed out. Current URL: ${page.url()}`)
            }

            const finalUrl = page.url()
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/(dashboard|integrations)/)
            const orgSlugFromSupabase = orgSlugMatch ? null : await fetchOrgSlugFromSupabase(config.email)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : orgSlugFromSupabase
            if (!orgSlug) {
                throw new Error('Could not determine org slug from URL or Supabase. Check Supabase connection and SUPABASE_SERVICE_ROLE_KEY.')
            }

            // Verify onboarding + get API key
            const apiKey = await verifyOnboardingAndGetApiKey(orgSlug, config.companyName, config.email)

            return {
                success: true,
                message: 'Demo account created and onboarding completed!',
                orgSlug,
                apiKey,
                dashboardUrl: `${TEST_CONFIG.baseUrl}/${orgSlug}/dashboard`,
            }
        } else {
            // Still wait and check the current page
            await page.waitForTimeout(5000)
            const finalUrl = page.url()
            const orgSlugMatch = finalUrl.match(/\/([^/]+)\/(dashboard|integrations)/)
            const orgSlugFromSupabase = orgSlugMatch ? null : await fetchOrgSlugFromSupabase(config.email)
            const orgSlug = orgSlugMatch ? orgSlugMatch[1] : orgSlugFromSupabase
            if (!orgSlug) {
                throw new Error('Could not determine org slug from URL or Supabase. Check Supabase connection and SUPABASE_SERVICE_ROLE_KEY.')
            }

            // Verify onboarding + get API key
            const apiKey = await verifyOnboardingAndGetApiKey(orgSlug, config.companyName, config.email)

            return {
                success: true,
                message: `Demo account created. Current page: ${finalUrl}`,
                orgSlug,
                apiKey,
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
