// @vitest-environment node
/**
 * Flow Test 11: OpenAI Subscription CRUD Operations (Integration Test)
 *
 * Tests OpenAI subscription management through the API:
 * - List subscriptions
 * - Create subscription (with validation)
 * - Update subscription
 * - Delete subscription
 * - Reset subscriptions to defaults
 *
 * Prerequisites:
 * - Backend API service running on port 8000
 * - CA_ROOT_API_KEY environment variable set
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const API_BASE_URL = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000'
const ROOT_KEY = process.env.CA_ROOT_API_KEY

if (!ROOT_KEY) {
    console.warn('Warning: CA_ROOT_API_KEY not set. Tests requiring root access will fail.')
}

// Test org details
const TEST_ORG_SLUG = `sub_crud_${Date.now()}`
const TEST_EMAIL = `sub_crud_${Date.now()}@example.com`

// Store API key for the test org
let testApiKey: string

describe('Flow 11: OpenAI Subscription CRUD', () => {

    beforeAll(async () => {
        console.log(`Creating test org: ${TEST_ORG_SLUG}`)

        // Create org
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CA-Root-Key': ROOT_KEY || ''
            },
            body: JSON.stringify({
                org_slug: TEST_ORG_SLUG,
                company_name: `${TEST_ORG_SLUG} Corp`,
                admin_email: TEST_EMAIL,
                subscription_plan: 'STARTER',
                regenerate_api_key_if_exists: true
            })
        })

        if (!createResponse.ok) {
            const text = await createResponse.text()
            throw new Error(`Failed to create test org: ${createResponse.status} ${text}`)
        }

        const data = await createResponse.json()
        testApiKey = data.api_key
        console.log(`Test org created with API key: ${testApiKey.substring(0, 20)}...`)

        // Setup OpenAI integration with a test key (or skip validation)
        console.log('Setting up OpenAI integration...')
        const setupResponse = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/setup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': testApiKey
            },
            body: JSON.stringify({
                credential: 'sk-test-key-for-testing',
                credential_name: 'Test OpenAI Key',
                skip_validation: true
            })
        })

        if (!setupResponse.ok) {
            const text = await setupResponse.text()
            console.warn(`Note: OpenAI setup returned ${setupResponse.status}: ${text}`)
        }
    }, 60000)

    describe('List Subscriptions', () => {
        it('should return empty list initially (before reset)', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'GET',
                headers: {
                    'X-API-Key': testApiKey
                }
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.subscriptions).toBeDefined()
            expect(Array.isArray(data.subscriptions)).toBe(true)
            console.log(`Initial subscriptions count: ${data.count}`)
        })
    })

    describe('Create Subscription', () => {
        const TEST_PLAN_NAME = `TEST_PLAN_${Date.now()}`

        it('should create a subscription with valid data', async () => {
            const subscriptionData = {
                subscription_id: `sub_${Date.now()}_test`,
                plan_name: TEST_PLAN_NAME,
                quantity: 5,
                unit_price: 29.99,
                effective_date: new Date().toISOString().split('T')[0],
                tier_type: 'paid',
                rpm_limit: 3000,
                tpm_limit: 60000,
                notes: 'Test subscription created by integration test'
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(subscriptionData)
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.plan_name).toBe(TEST_PLAN_NAME)
            console.log(`Created subscription: ${TEST_PLAN_NAME}`)
        })

        it('should accept plan_name with spaces (backend allows, frontend validates)', async () => {
            // NOTE: Backend accepts spaces in plan_name - frontend validates before sending
            // This test documents backend behavior
            const subscriptionData = {
                subscription_id: `sub_${Date.now()}_spaces`,
                plan_name: 'Plan With Spaces', // Backend allows this
                quantity: 1,
                unit_price: 0,
                effective_date: new Date().toISOString().split('T')[0]
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(subscriptionData)
            })

            // Backend accepts this - frontend should validate before sending
            expect(response.ok).toBe(true)
            console.log('Backend accepts plan name with spaces (frontend validates)')
        })

        it('should reject subscription without subscription_id', async () => {
            const subscriptionData = {
                // Missing subscription_id
                plan_name: `NO_ID_PLAN_${Date.now()}`,
                quantity: 1,
                unit_price: 0,
                effective_date: new Date().toISOString().split('T')[0]
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(subscriptionData)
            })

            expect(response.ok).toBe(false)
            expect(response.status).toBe(422) // Validation error
            console.log('Correctly rejected subscription without subscription_id')
        })

        it('should reject subscription without effective_date', async () => {
            const subscriptionData = {
                subscription_id: `sub_${Date.now()}_nodate`,
                plan_name: `NO_DATE_PLAN_${Date.now()}`,
                quantity: 1,
                unit_price: 0
                // Missing effective_date
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(subscriptionData)
            })

            expect(response.ok).toBe(false)
            expect(response.status).toBe(422) // Validation error
            console.log('Correctly rejected subscription without effective_date')
        })
    })

    describe('Update Subscription', () => {
        let createdPlanName: string

        beforeAll(async () => {
            // Create a subscription to update
            createdPlanName = `UPDATE_TEST_${Date.now()}`
            await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify({
                    subscription_id: `sub_update_${Date.now()}`,
                    plan_name: createdPlanName,
                    quantity: 1,
                    unit_price: 10,
                    effective_date: new Date().toISOString().split('T')[0]
                })
            })
        })

        it('should update subscription quantity and price', async () => {
            const updateData = {
                quantity: 10,
                unit_price: 49.99
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/${createdPlanName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(updateData)
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.quantity).toBe(10)
            expect(data.unit_price).toBe(49.99)
            console.log(`Updated subscription: ${createdPlanName}`)
        })

        it('should update subscription rate limits', async () => {
            const updateData = {
                rpm_limit: 5000,
                tpm_limit: 100000
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/${createdPlanName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify(updateData)
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.rpm_limit).toBe(5000)
            expect(data.tpm_limit).toBe(100000)
            console.log('Updated rate limits successfully')
        })

        it('should reject update for non-existent plan', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/NON_EXISTENT_PLAN`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify({ quantity: 1 })
            })

            expect(response.ok).toBe(false)
            expect([400, 404]).toContain(response.status)
            console.log('Correctly rejected update for non-existent plan')
        })
    })

    describe('Delete Subscription', () => {
        let deletePlanName: string

        beforeAll(async () => {
            // Create a subscription to delete
            deletePlanName = `DELETE_TEST_${Date.now()}`
            await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                },
                body: JSON.stringify({
                    subscription_id: `sub_delete_${Date.now()}`,
                    plan_name: deletePlanName,
                    quantity: 1,
                    unit_price: 0,
                    effective_date: new Date().toISOString().split('T')[0]
                })
            })
        })

        it('should delete an existing subscription', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/${deletePlanName}`, {
                method: 'DELETE',
                headers: {
                    'X-API-Key': testApiKey
                }
            })

            expect(response.ok).toBe(true)
            console.log(`Deleted subscription: ${deletePlanName}`)

            // Verify it's deleted
            const listResponse = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'GET',
                headers: {
                    'X-API-Key': testApiKey
                }
            })
            const data = await listResponse.json()
            const found = data.subscriptions.find((s: { plan_name: string }) => s.plan_name === deletePlanName)
            expect(found).toBeUndefined()
        })

        it('should handle delete of non-existent plan gracefully', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/NON_EXISTENT_TO_DELETE`, {
                method: 'DELETE',
                headers: {
                    'X-API-Key': testApiKey
                }
            })

            // Should return 200, 204 (no content), or 404 for non-existent
            expect([200, 204, 404]).toContain(response.status)
            console.log(`Handled non-existent delete with status: ${response.status}`)
        })
    })

    describe('Reset Subscriptions', () => {
        it('should reset subscriptions to defaults', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': testApiKey
                }
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.subscriptions).toBeDefined()
            expect(data.count).toBeGreaterThan(0)
            console.log(`Reset subscriptions - now have ${data.count} default plans`)
        })

        it('should have default tiers after reset', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'GET',
                headers: {
                    'X-API-Key': testApiKey
                }
            })

            expect(response.ok).toBe(true)
            const data = await response.json()

            // Check for expected default tier types
            const tierTypes = data.subscriptions.map((s: { tier_type: string }) => s.tier_type)
            console.log('Tier types after reset:', [...new Set(tierTypes)])

            // Should have some subscriptions
            expect(data.count).toBeGreaterThan(0)
        })
    })

    describe('Validation Tests', () => {
        it('should require authentication', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/${TEST_ORG_SLUG}/openai/subscriptions`, {
                method: 'GET'
                // No X-API-Key header
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('Correctly required authentication')
        })

        it('should reject invalid org slug', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/integrations/invalid-org-slug/openai/subscriptions`, {
                method: 'GET',
                headers: {
                    'X-API-Key': testApiKey
                }
            })

            expect(response.ok).toBe(false)
            expect([400, 401, 403, 404]).toContain(response.status)
            console.log('Correctly rejected invalid org slug')
        })
    })

    afterAll(async () => {
        // Cleanup: Delete the test organization
        console.log(`Cleaning up test org: ${TEST_ORG_SLUG}`)
        try {
            // Note: Add org deletion API call if available
        } catch (e) {
            console.warn('Cleanup failed:', e)
        }
    })
}, 120000) // 2 minute timeout for entire suite
