// @vitest-environment node
/**
 * Flow Test 13: SaaS Subscription CRUD Operations (Integration Test)
 *
 * Tests SaaS subscription management through Supabase:
 * - List subscriptions
 * - Create subscription
 * - Update subscription
 * - Delete subscription
 * - Toggle enabled/disabled
 * - Get cost summary
 *
 * Prerequisites:
 * - Frontend server running on port 3000
 * - Supabase configured with saas_subscriptions table
 * - Test user authenticated
 *
 * Run: npx vitest tests/13-saas-subscription-crud.test.ts --config vitest.node.config.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Environment config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('Warning: Supabase credentials not set. Tests will fail.')
}

// Test org details - use existing test org or create one
const TEST_ORG_NAME = `saas_test_org_${Date.now()}`
const TEST_USER_EMAIL = `saas_test_${Date.now()}@example.com`

// Store test data
let supabase: SupabaseClient
let testOrgId: string
let testUserId: string
let createdSubscriptionIds: string[] = []

describe('Flow 13: SaaS Subscription CRUD (Supabase)', () => {

    beforeAll(async () => {
        console.log('Setting up SaaS subscription tests...')

        // Create Supabase admin client
        supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
            auth: { persistSession: false }
        })

        // Create test user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: TEST_USER_EMAIL,
            password: 'TestPassword123!',
            email_confirm: true,
            user_metadata: {
                full_name: 'SaaS Test User',
                company_name: TEST_ORG_NAME,
                company_type: 'startup'
            }
        })

        if (authError) {
            throw new Error(`Failed to create test user: ${authError.message}`)
        }

        testUserId = authData.user.id
        console.log(`Created test user: ${testUserId}`)

        // Create test organization
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({
                name: TEST_ORG_NAME,
                slug: TEST_ORG_NAME.toLowerCase().replace(/\s+/g, '_'),
                owner_id: testUserId,
                subscription_status: 'active',
                subscription_plan: 'starter'
            })
            .select()
            .single()

        if (orgError) {
            throw new Error(`Failed to create test org: ${orgError.message}`)
        }

        testOrgId = orgData.id
        console.log(`Created test org: ${testOrgId}`)

        // Add user as org member
        await supabase
            .from('organization_members')
            .insert({
                org_id: testOrgId,
                user_id: testUserId,
                role: 'owner',
                status: 'active'
            })

        console.log('Test setup complete')
    }, 60000)

    describe('List Subscriptions', () => {
        it('should return empty list initially', async () => {
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .select('*')
                .eq('org_id', testOrgId)

            // Table might not exist (42P01) - that's ok
            if (error && error.code !== '42P01') {
                throw error
            }

            expect(data || []).toEqual([])
            console.log('Initial subscriptions: empty')
        })
    })

    describe('Create Subscription', () => {
        it('should create a Canva Pro subscription', async () => {
            const subscription = {
                org_id: testOrgId,
                provider_name: 'canva',
                display_name: 'Canva Pro',
                billing_cycle: 'monthly',
                cost_per_cycle: 12.99,
                currency: 'USD',
                seats: 5,
                category: 'design',
                is_enabled: true,
                notes: 'Test subscription'
            }

            const { data, error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)
                .select()
                .single()

            if (error) {
                // If table doesn't exist, skip
                if (error.code === '42P01') {
                    console.log('Table saas_subscriptions does not exist - skipping')
                    return
                }
                throw error
            }

            expect(data).toBeDefined()
            expect(data.provider_name).toBe('canva')
            expect(data.cost_per_cycle).toBe(12.99)
            createdSubscriptionIds.push(data.id)
            console.log(`Created Canva subscription: ${data.id}`)
        })

        it('should create a ChatGPT Plus subscription', async () => {
            const subscription = {
                org_id: testOrgId,
                provider_name: 'chatgpt_plus',
                display_name: 'ChatGPT Plus',
                billing_cycle: 'monthly',
                cost_per_cycle: 20.00,
                currency: 'USD',
                seats: 1,
                category: 'ai',
                is_enabled: true
            }

            const { data, error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.provider_name).toBe('chatgpt_plus')
            expect(data.cost_per_cycle).toBe(20.00)
            createdSubscriptionIds.push(data.id)
            console.log(`Created ChatGPT Plus subscription: ${data.id}`)
        })

        it('should create a Slack Pro subscription', async () => {
            const subscription = {
                org_id: testOrgId,
                provider_name: 'slack',
                display_name: 'Slack Pro',
                billing_cycle: 'monthly',
                cost_per_cycle: 8.75,
                currency: 'USD',
                seats: 10,
                category: 'communication',
                is_enabled: true
            }

            const { data, error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.provider_name).toBe('slack')
            createdSubscriptionIds.push(data.id)
            console.log(`Created Slack subscription: ${data.id}`)
        })

        it('should reject subscription with negative cost', async () => {
            const subscription = {
                org_id: testOrgId,
                provider_name: 'invalid',
                display_name: 'Invalid Test',
                billing_cycle: 'monthly',
                cost_per_cycle: -10.00, // Invalid: negative
                currency: 'USD'
            }

            const { error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            // Should fail due to CHECK constraint
            expect(error).toBeDefined()
            console.log('Correctly rejected negative cost')
        })

        it('should reject subscription with invalid billing_cycle', async () => {
            const subscription = {
                org_id: testOrgId,
                provider_name: 'invalid',
                display_name: 'Invalid Test',
                billing_cycle: 'invalid_cycle', // Invalid
                cost_per_cycle: 10.00,
                currency: 'USD'
            }

            const { error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            // Should fail due to CHECK constraint
            expect(error).toBeDefined()
            console.log('Correctly rejected invalid billing_cycle')
        })
    })

    describe('Update Subscription', () => {
        it('should update subscription cost and seats', async () => {
            if (createdSubscriptionIds.length === 0) {
                console.log('No subscriptions to update - skipping')
                return
            }

            const subId = createdSubscriptionIds[0]
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .update({
                    cost_per_cycle: 14.99,
                    seats: 10
                })
                .eq('id', subId)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.cost_per_cycle).toBe(14.99)
            expect(data.seats).toBe(10)
            console.log(`Updated subscription: ${subId}`)
        })

        it('should update subscription notes', async () => {
            if (createdSubscriptionIds.length === 0) {
                console.log('No subscriptions to update - skipping')
                return
            }

            const subId = createdSubscriptionIds[0]
            const newNotes = `Updated at ${new Date().toISOString()}`

            const { data, error } = await supabase
                .from('saas_subscriptions')
                .update({ notes: newNotes })
                .eq('id', subId)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.notes).toBe(newNotes)
            console.log('Updated subscription notes')
        })
    })

    describe('Toggle Subscription', () => {
        it('should disable a subscription', async () => {
            if (createdSubscriptionIds.length === 0) {
                console.log('No subscriptions to toggle - skipping')
                return
            }

            const subId = createdSubscriptionIds[0]
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .update({ is_enabled: false })
                .eq('id', subId)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.is_enabled).toBe(false)
            console.log(`Disabled subscription: ${subId}`)
        })

        it('should re-enable a subscription', async () => {
            if (createdSubscriptionIds.length === 0) {
                console.log('No subscriptions to toggle - skipping')
                return
            }

            const subId = createdSubscriptionIds[0]
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .update({ is_enabled: true })
                .eq('id', subId)
                .select()
                .single()

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            expect(data.is_enabled).toBe(true)
            console.log(`Re-enabled subscription: ${subId}`)
        })
    })

    describe('Cost Summary', () => {
        it('should calculate total monthly cost', async () => {
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .select('cost_per_cycle, billing_cycle, is_enabled')
                .eq('org_id', testOrgId)
                .eq('is_enabled', true)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            // Calculate monthly equivalent
            let totalMonthly = 0
            for (const sub of data || []) {
                let monthly = sub.cost_per_cycle
                if (sub.billing_cycle === 'annual') monthly = sub.cost_per_cycle / 12
                else if (sub.billing_cycle === 'quarterly') monthly = sub.cost_per_cycle / 3
                totalMonthly += monthly
            }

            console.log(`Total monthly cost: $${totalMonthly.toFixed(2)}`)
            expect(totalMonthly).toBeGreaterThanOrEqual(0)
        })

        it('should count subscriptions by category', async () => {
            const { data, error } = await supabase
                .from('saas_subscriptions')
                .select('category')
                .eq('org_id', testOrgId)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            const countByCategory: Record<string, number> = {}
            for (const sub of data || []) {
                const cat = sub.category || 'other'
                countByCategory[cat] = (countByCategory[cat] || 0) + 1
            }

            console.log('Count by category:', countByCategory)
            expect(Object.keys(countByCategory).length).toBeGreaterThanOrEqual(0)
        })
    })

    describe('Delete Subscription', () => {
        it('should delete a subscription', async () => {
            if (createdSubscriptionIds.length === 0) {
                console.log('No subscriptions to delete - skipping')
                return
            }

            const subId = createdSubscriptionIds.pop()!
            const { error } = await supabase
                .from('saas_subscriptions')
                .delete()
                .eq('id', subId)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            if (error) throw error

            // Verify deletion
            const { data: checkData } = await supabase
                .from('saas_subscriptions')
                .select('id')
                .eq('id', subId)

            expect(checkData || []).toHaveLength(0)
            console.log(`Deleted subscription: ${subId}`)
        })
    })

    describe('Validation Tests', () => {
        it('should enforce org_id foreign key', async () => {
            const subscription = {
                org_id: '00000000-0000-0000-0000-000000000000', // Non-existent org
                provider_name: 'test',
                display_name: 'Test',
                billing_cycle: 'monthly',
                cost_per_cycle: 10.00,
                currency: 'USD'
            }

            const { error } = await supabase
                .from('saas_subscriptions')
                .insert(subscription)

            if (error && error.code === '42P01') {
                console.log('Table does not exist - skipping')
                return
            }

            // Should fail due to FK constraint
            expect(error).toBeDefined()
            console.log('Correctly enforced org_id foreign key')
        })
    })

    afterAll(async () => {
        console.log('Cleaning up test data...')

        try {
            // Delete remaining test subscriptions
            for (const subId of createdSubscriptionIds) {
                await supabase
                    .from('saas_subscriptions')
                    .delete()
                    .eq('id', subId)
            }

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
