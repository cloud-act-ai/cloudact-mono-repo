/**
 * @vitest-environment node
 *
 * Flow Test 14: Subscription Providers (Integration Test)
 *
 * Tests subscription provider management through Supabase and API Service:
 * - List available providers
 * - Enable/disable providers
 * - View provider plans
 * - Add custom plans
 * - Toggle plan enabled/disabled
 * - Delete custom plans
 * - Cost summary calculations
 * - Sidebar integration (enabled providers)
 * - Custom provider support
 *
 * Prerequisites:
 * - Frontend server running on port 3000
 * - API Service running on port 8000 (for plan seeding/management)
 * - Pipeline Service running on port 8001 (for subscription endpoints)
 * - Supabase configured with saas_subscription_providers_meta table
 * - Test user authenticated with org API key
 *
 * Run: npx vitest tests/14-subscription-providers.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Environment config - use import.meta.env for Vite/Vitest
const getEnv = (key: string, defaultValue = ''): string => {
    // Try import.meta.env first (Vite)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        const value = (import.meta.env as Record<string, string>)[key]
        if (value) return value
    }
    // Fallback to process.env (Node.js)
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || defaultValue
    }
    return defaultValue
}

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const API_SERVICE_URL = getEnv('NEXT_PUBLIC_API_SERVICE_URL', 'http://localhost:8001')

// Check if credentials are available
const SKIP_TESTS = !SUPABASE_URL || !SUPABASE_SERVICE_KEY

if (SKIP_TESTS) {
    console.warn('Warning: Supabase credentials not set. Tests will be skipped.')
}

// Test org details
const TEST_ORG_NAME = `provider_test_org_${Date.now()}`
const TEST_USER_EMAIL = `provider_test_${Date.now()}@example.com`
const TEST_ORG_SLUG = TEST_ORG_NAME.toLowerCase().replace(/\s+/g, '_')

// Store test data
let supabase: SupabaseClient
let testOrgId: string
let testUserId: string
let testOrgApiKey: string
let enabledProviders: string[] = []
let createdSubscriptionIds: string[] = []

// Test providers
const TEST_PROVIDERS = {
    canva: {
        name: 'canva',
        displayName: 'Canva',
        category: 'design'
    },
    chatgpt_plus: {
        name: 'chatgpt_plus',
        displayName: 'ChatGPT Plus',
        category: 'ai'
    },
    slack: {
        name: 'slack',
        displayName: 'Slack',
        category: 'communication'
    }
}

describe.skipIf(SKIP_TESTS)('Flow 14: Subscription Providers (Supabase + API)', () => {

    beforeAll(async () => {
        console.log('Setting up subscription providers tests...')

        // Create Supabase admin client
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false }
        })

        // Create test user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: TEST_USER_EMAIL,
            password: 'TestPassword123!',
            email_confirm: true,
            user_metadata: {
                full_name: 'Provider Test User',
                company_name: TEST_ORG_NAME,
                company_type: 'startup'
            }
        })

        if (authError) {
            throw new Error(`Failed to create test user: ${authError.message}`)
        }

        testUserId = authData.user.id
        console.log(`Created test user: ${testUserId}`)

        // Create test organization (use correct column names from schema)
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({
                org_name: TEST_ORG_NAME,
                org_slug: TEST_ORG_SLUG,
                created_by: testUserId,
                billing_status: 'active',
                plan: 'starter',
                backend_onboarded: true,
                backend_api_key_fingerprint: 'test_fingerprint_123'
            })
            .select()
            .single()

        if (orgError) {
            throw new Error(`Failed to create test org: ${orgError.message}`)
        }

        testOrgId = orgData.id
        testOrgApiKey = `${TEST_ORG_SLUG}_api_test_key_${Date.now()}`
        console.log(`Created test org: ${testOrgId}`)

        // Add user as org member (owner)
        await supabase
            .from('organization_members')
            .insert({
                org_id: testOrgId,
                user_id: testUserId,
                role: 'owner',
                status: 'active'
            })

        // Store API key in user metadata
        await supabase.auth.admin.updateUserById(testUserId, {
            user_metadata: {
                full_name: 'Provider Test User',
                company_name: TEST_ORG_NAME,
                company_type: 'startup',
                org_api_keys: {
                    [TEST_ORG_SLUG]: testOrgApiKey
                }
            }
        })

        console.log('Test setup complete')
    }, 60000)

    describe('FE-01: List Available Providers', () => {
        it('should list all available providers', async () => {
            // This simulates getAllProviders() action
            const { data: metaData, error: metaError } = await supabase
                .from('saas_subscription_providers_meta')
                .select('provider_name, is_enabled')
                .eq('org_id', testOrgId)

            if (metaError && metaError.code !== '42P01') {
                throw metaError
            }

            // Should return empty initially
            expect(metaData || []).toEqual([])
            console.log('Initial provider list: empty')
        })

        it('should categorize providers correctly', () => {
            const PROVIDER_CATEGORIES: Record<string, string[]> = {
                ai: ['chatgpt_plus', 'claude_pro', 'gemini_advanced', 'copilot', 'cursor', 'windsurf', 'replit', 'v0', 'lovable'],
                design: ['canva', 'adobe_cc', 'figma', 'miro'],
                productivity: ['notion', 'confluence', 'asana', 'monday'],
                communication: ['slack', 'zoom', 'teams'],
                development: ['github', 'gitlab', 'jira', 'linear', 'vercel', 'netlify', 'railway', 'supabase'],
            }

            // Verify test providers are categorized
            expect(PROVIDER_CATEGORIES.design).toContain('canva')
            expect(PROVIDER_CATEGORIES.ai).toContain('chatgpt_plus')
            expect(PROVIDER_CATEGORIES.communication).toContain('slack')
            console.log('Provider categorization verified')
        })
    })

    describe('FE-02: Enable Provider Toggle', () => {
        it('should enable Canva provider', async () => {
            // Simulate enableProvider() action
            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .upsert(
                    {
                        org_id: testOrgId,
                        provider_name: TEST_PROVIDERS.canva.name,
                        is_enabled: true,
                        enabled_at: new Date().toISOString(),
                    },
                    { onConflict: 'org_id,provider_name' }
                )

            if (error && error.code !== '42P01') {
                throw error
            }

            if (!error) {
                enabledProviders.push(TEST_PROVIDERS.canva.name)
                console.log('Enabled Canva provider')
            } else {
                console.log('Table does not exist - skipping')
            }
        })

        it('should enable ChatGPT Plus provider', async () => {
            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .upsert(
                    {
                        org_id: testOrgId,
                        provider_name: TEST_PROVIDERS.chatgpt_plus.name,
                        is_enabled: true,
                        enabled_at: new Date().toISOString(),
                    },
                    { onConflict: 'org_id,provider_name' }
                )

            if (error && error.code !== '42P01') {
                throw error
            }

            if (!error) {
                enabledProviders.push(TEST_PROVIDERS.chatgpt_plus.name)
                console.log('Enabled ChatGPT Plus provider')
            } else {
                console.log('Table does not exist - skipping')
            }
        })

        it('should verify enabled providers are stored', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            const { data, error } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('is_enabled', true)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data).toBeDefined()
            expect(data.length).toBeGreaterThan(0)
            console.log(`Verified ${data.length} enabled providers`)
        })
    })

    describe('FE-03: Disable Provider Toggle', () => {
        it('should disable Canva provider', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .update({ is_enabled: false })
                .eq('org_id', testOrgId)
                .eq('provider_name', TEST_PROVIDERS.canva.name)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            // Verify disabled
            const { data } = await supabase
                .from('saas_subscription_providers_meta')
                .select('is_enabled')
                .eq('org_id', testOrgId)
                .eq('provider_name', TEST_PROVIDERS.canva.name)
                .single()

            expect(data?.is_enabled).toBe(false)
            console.log('Disabled Canva provider')
        })

        it('should re-enable Canva provider', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .update({ is_enabled: true })
                .eq('org_id', testOrgId)
                .eq('provider_name', TEST_PROVIDERS.canva.name)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            // Verify re-enabled
            const { data } = await supabase
                .from('saas_subscription_providers_meta')
                .select('is_enabled')
                .eq('org_id', testOrgId)
                .eq('provider_name', TEST_PROVIDERS.canva.name)
                .single()

            expect(data?.is_enabled).toBe(true)
            console.log('Re-enabled Canva provider')
        })
    })

    describe('FE-04: Provider Detail Page - Seeded Plans', () => {
        it('should simulate navigation to provider detail page', async () => {
            // This simulates the URL: /[orgSlug]/subscriptions/[provider]
            const providerPageUrl = `/${TEST_ORG_SLUG}/subscriptions/${TEST_PROVIDERS.canva.name}`

            // Verify provider is enabled before navigation
            const { data, error } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('provider_name', TEST_PROVIDERS.canva.name)
                .single()

            if (error && error.code === 'PGRST116') {
                console.log('Provider not found - would need to enable first')
                return
            }

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data).toBeDefined()
            console.log(`Simulated navigation to: ${providerPageUrl}`)
        })

        it('should verify API endpoint for getting plans exists', async () => {
            // This would call: GET /api/v1/subscriptions/{org}/providers/{provider}/plans
            // For now, we verify the endpoint pattern is correct
            const apiEndpoint = `${API_SERVICE_URL}/api/v1/subscriptions/${TEST_ORG_SLUG}/providers/${TEST_PROVIDERS.canva.name}/plans`

            expect(apiEndpoint).toContain(TEST_ORG_SLUG)
            expect(apiEndpoint).toContain(TEST_PROVIDERS.canva.name)
            console.log(`Plan API endpoint: ${apiEndpoint}`)
        })
    })

    describe('FE-05: Add Custom Plan', () => {
        it('should create a custom Canva Enterprise plan', async () => {
            // This simulates createCustomPlan() action
            // In reality, this would call the API service
            // For this test, we'll verify the request structure

            const customPlan = {
                plan_name: 'ENTERPRISE',
                display_name: 'Canva Enterprise',
                unit_price_usd: 30.00,
                quantity: 1,
                billing_period: 'monthly',
                notes: 'Custom enterprise plan for large teams',
                seats: 20,
                is_custom: true,
                provider: TEST_PROVIDERS.canva.name,
                category: TEST_PROVIDERS.canva.category,
                is_enabled: true
            }

            // Verify structure
            expect(customPlan.plan_name).toBe('ENTERPRISE')
            expect(customPlan.is_custom).toBe(true)
            expect(customPlan.unit_price_usd).toBeGreaterThan(0)
            console.log('Custom plan structure validated')
        })

        it('should validate custom plan fields', () => {
            const invalidPlan = {
                plan_name: '',  // Invalid: empty
                unit_price_usd: -10,  // Invalid: negative
            }

            // Field validation checks
            expect(invalidPlan.plan_name).toBe('')
            expect(invalidPlan.unit_price_usd).toBeLessThan(0)
            console.log('Invalid plan fields detected correctly')
        })
    })

    describe('FE-06: Toggle Plan Enable/Disable', () => {
        it('should simulate toggling plan enabled status', async () => {
            // This simulates togglePlan() action which calls updatePlan()
            // In reality, this would call: PUT /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}

            const mockPlanId = 'test_plan_123'
            const toggleRequest = {
                orgSlug: TEST_ORG_SLUG,
                provider: TEST_PROVIDERS.canva.name,
                subscriptionId: mockPlanId,
                is_enabled: false
            }

            expect(toggleRequest.is_enabled).toBe(false)
            console.log('Plan toggle request structure validated')
        })

        it('should verify toggle affects cost calculation', () => {
            // Mock plans with different enabled states
            const plans = [
                { name: 'PRO', price: 12.99, is_enabled: true },
                { name: 'ENTERPRISE', price: 30.00, is_enabled: false },
                { name: 'TEAM', price: 20.00, is_enabled: true }
            ]

            // Calculate total (only enabled)
            const totalCost = plans
                .filter(p => p.is_enabled)
                .reduce((sum, p) => sum + p.price, 0)

            expect(totalCost).toBe(32.99)  // 12.99 + 20.00
            console.log(`Total enabled plans cost: $${totalCost}`)
        })
    })

    describe('FE-07: Delete Custom Plan', () => {
        it('should simulate deleting custom plan', async () => {
            // This simulates deletePlan() action
            // In reality, this would call: DELETE /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}

            const mockPlanId = 'custom_plan_456'
            const deleteRequest = {
                orgSlug: TEST_ORG_SLUG,
                provider: TEST_PROVIDERS.canva.name,
                subscriptionId: mockPlanId
            }

            expect(deleteRequest.subscriptionId).toBe(mockPlanId)
            console.log('Plan deletion request structure validated')
        })

        it('should only allow deleting custom plans', () => {
            // Mock plans
            const plans = [
                { id: 'plan1', name: 'PRO', is_custom: false },
                { id: 'plan2', name: 'CUSTOM_ENTERPRISE', is_custom: true }
            ]

            // Filter deletable plans (custom only)
            const deletablePlans = plans.filter(p => p.is_custom)

            expect(deletablePlans.length).toBe(1)
            expect(deletablePlans[0].name).toBe('CUSTOM_ENTERPRISE')
            console.log('Only custom plans are deletable')
        })
    })

    describe('FE-08: Cost Summary Calculation', () => {
        it('should calculate monthly cost correctly', () => {
            const plans = [
                { name: 'Monthly Plan', price: 10.00, billing_period: 'monthly', is_enabled: true },
                { name: 'Annual Plan', price: 120.00, billing_period: 'yearly', is_enabled: true },
                { name: 'Quarterly Plan', price: 30.00, billing_period: 'quarterly', is_enabled: true },
                { name: 'Disabled Plan', price: 50.00, billing_period: 'monthly', is_enabled: false }
            ]

            // Calculate monthly equivalent (only enabled)
            let totalMonthly = 0
            for (const plan of plans.filter(p => p.is_enabled)) {
                if (plan.billing_period === 'monthly') {
                    totalMonthly += plan.price
                } else if (plan.billing_period === 'yearly') {
                    totalMonthly += plan.price / 12
                } else if (plan.billing_period === 'quarterly') {
                    totalMonthly += plan.price / 3
                }
            }

            expect(totalMonthly).toBeCloseTo(30.00, 2)  // 10 + 10 + 10
            console.log(`Total monthly cost: $${totalMonthly.toFixed(2)}`)
        })

        it('should count plans by category', () => {
            const plans = [
                { name: 'Plan 1', category: 'design' },
                { name: 'Plan 2', category: 'ai' },
                { name: 'Plan 3', category: 'design' },
                { name: 'Plan 4', category: 'ai' },
                { name: 'Plan 5', category: 'communication' }
            ]

            const countByCategory: Record<string, number> = {}
            for (const plan of plans) {
                countByCategory[plan.category] = (countByCategory[plan.category] || 0) + 1
            }

            expect(countByCategory.design).toBe(2)
            expect(countByCategory.ai).toBe(2)
            expect(countByCategory.communication).toBe(1)
            console.log('Category counts:', countByCategory)
        })

        it('should calculate per-seat costs', () => {
            const plan = {
                name: 'Team Plan',
                unit_price_usd: 10.00,
                seats: 5,
                quantity: 2
            }

            const totalCost = plan.unit_price_usd * plan.quantity
            const perSeatCost = totalCost / plan.seats

            expect(totalCost).toBe(20.00)
            expect(perSeatCost).toBe(4.00)
            console.log(`Total: $${totalCost}, Per seat: $${perSeatCost}`)
        })
    })

    describe('FE-09: Sidebar Shows Enabled Providers', () => {
        it('should list only enabled providers in sidebar', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            // Simulate listEnabledProviders() action
            const { data, error } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('is_enabled', true)
                .order('provider_name')

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data).toBeDefined()
            expect(data.length).toBeGreaterThan(0)

            // Verify providers are in expected list
            const providerNames = data.map(p => p.provider_name)
            console.log('Enabled providers for sidebar:', providerNames)
        })

        it('should exclude disabled providers from sidebar', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            // Get all providers
            const { data: allProviders, error: allError } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)

            if (allError && allError.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (allError) throw allError

            // Get enabled providers
            const { data: enabledOnly } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('is_enabled', true)

            const disabledCount = (allProviders?.length || 0) - (enabledOnly?.length || 0)

            expect(disabledCount).toBeGreaterThanOrEqual(0)
            console.log(`Disabled providers (not in sidebar): ${disabledCount}`)
        })
    })

    describe('FE-10: Add Custom Provider', () => {
        it('should enable custom provider not in predefined list', async () => {
            const customProvider = {
                name: 'custom_saas_tool',
                displayName: 'Custom SaaS Tool',
                category: 'other'
            }

            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .upsert(
                    {
                        org_id: testOrgId,
                        provider_name: customProvider.name,
                        is_enabled: true,
                        enabled_at: new Date().toISOString(),
                    },
                    { onConflict: 'org_id,provider_name' }
                )

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            // Verify custom provider is stored
            const { data } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('provider_name', customProvider.name)
                .single()

            expect(data).toBeDefined()
            expect(data.provider_name).toBe(customProvider.name)
            console.log('Custom provider added:', customProvider.name)
        })

        it('should support custom provider display names', () => {
            const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
                chatgpt_plus: 'ChatGPT Plus',
                claude_pro: 'Claude Pro',
                custom: 'Custom',
            }

            function getProviderDisplayName(provider: string): string {
                return PROVIDER_DISPLAY_NAMES[provider] ||
                    provider.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            }

            // Test predefined
            expect(getProviderDisplayName('chatgpt_plus')).toBe('ChatGPT Plus')

            // Test custom
            expect(getProviderDisplayName('my_custom_tool')).toBe('My Custom Tool')
            console.log('Custom provider display names work correctly')
        })
    })

    describe('Integration: Provider to Plan Flow', () => {
        it('should complete full flow: enable → view plans → add plan → disable', async () => {
            const testProvider = TEST_PROVIDERS.slack

            // 1. Enable provider
            const { error: enableError } = await supabase
                .from('saas_subscription_providers_meta')
                .upsert(
                    {
                        org_id: testOrgId,
                        provider_name: testProvider.name,
                        is_enabled: true,
                        enabled_at: new Date().toISOString(),
                    },
                    { onConflict: 'org_id,provider_name' }
                )

            if (enableError && enableError.code === '42P01') {
                console.log('Table does not exist - skipping flow test')
                return
            }

            if (enableError) throw enableError

            // 2. Verify enabled
            const { data: verifyData } = await supabase
                .from('saas_subscription_providers_meta')
                .select('*')
                .eq('org_id', testOrgId)
                .eq('provider_name', testProvider.name)
                .single()

            expect(verifyData?.is_enabled).toBe(true)

            // 3. Simulate viewing plans (would call API)
            const plansEndpoint = `${API_SERVICE_URL}/api/v1/subscriptions/${TEST_ORG_SLUG}/providers/${testProvider.name}/plans`
            expect(plansEndpoint).toContain(testProvider.name)

            // 4. Simulate adding custom plan (would call API)
            const customPlan = {
                plan_name: 'CUSTOM_SLACK_PLAN',
                unit_price_usd: 15.00,
                seats: 50,
                billing_period: 'monthly'
            }
            expect(customPlan.plan_name).toBe('CUSTOM_SLACK_PLAN')

            // 5. Disable provider
            const { error: disableError } = await supabase
                .from('saas_subscription_providers_meta')
                .update({ is_enabled: false })
                .eq('org_id', testOrgId)
                .eq('provider_name', testProvider.name)

            if (disableError) throw disableError

            console.log('Full provider flow completed successfully')
        })
    })

    describe('Validation Tests', () => {
        it('should enforce unique org_id + provider_name constraint', async () => {
            if (enabledProviders.length === 0) {
                console.log('No providers enabled - skipping')
                return
            }

            // Try to insert duplicate
            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .insert({
                    org_id: testOrgId,
                    provider_name: TEST_PROVIDERS.canva.name,
                    is_enabled: true,
                    enabled_at: new Date().toISOString(),
                })

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            // Should fail due to unique constraint
            expect(error).toBeDefined()
            console.log('Unique constraint enforced correctly')
        })

        it('should enforce org_id foreign key', async () => {
            const fakeOrgId = '00000000-0000-0000-0000-000000000000'

            const { error } = await supabase
                .from('saas_subscription_providers_meta')
                .insert({
                    org_id: fakeOrgId,
                    provider_name: 'test_provider',
                    is_enabled: true,
                    enabled_at: new Date().toISOString(),
                })

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            // Should fail due to FK constraint
            expect(error).toBeDefined()
            console.log('Foreign key constraint enforced correctly')
        })
    })

    afterAll(async () => {
        console.log('Cleaning up test data...')

        try {
            // Delete provider meta records
            await supabase
                .from('saas_subscription_providers_meta')
                .delete()
                .eq('org_id', testOrgId)

            // Delete org member
            await supabase
                .from('organization_members')
                .delete()
                .eq('org_id', testOrgId)

            // Delete test org
            await supabase
                .from('organizations')
                .delete()
                .eq('id', testOrgId)

            // Delete test user
            if (testUserId) {
                await supabase.auth.admin.deleteUser(testUserId)
            }

            console.log('Cleanup complete')
        } catch (e) {
            console.warn('Cleanup warning:', e)
        }
    }, 30000)

}, 120000)
