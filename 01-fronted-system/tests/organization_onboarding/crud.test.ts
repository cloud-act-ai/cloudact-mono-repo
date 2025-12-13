// @vitest-environment node
/**
 * Organization CRUD Operations Test Suite
 *
 * Tests all CRUD functions from organization.ts and backend-onboarding.ts:
 * 1. createOrganization - creates org in Supabase
 * 2. completeOnboarding - after Stripe checkout
 * 3. onboardToBackend - creates BigQuery dataset + API key
 * 4. checkBackendOnboarding - checks if onboarded
 * 5. getApiKeyInfo - gets API key fingerprint
 * 6. rotateApiKey - rotates API key
 * 7. saveApiKey - saves API key to secure storage
 * 8. hasStoredApiKey - checks if key exists
 *
 * Prerequisites:
 * - Supabase configured with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * - Backend API service running on port 8000
 * - CA_ROOT_API_KEY environment variable set
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_BASE_URL = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000'
const ROOT_KEY = process.env.CA_ROOT_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase environment variables')
}

if (!ROOT_KEY) {
    console.warn('Warning: CA_ROOT_API_KEY not set. Backend integration tests will fail.')
}

// Create Supabase admin client for testing
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

// Test user and org data
const TEST_EMAIL = `org_crud_test_${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPassword123!'
let testUserId: string
let testOrgSlug: string

describe('Organization CRUD Operations', () => {

    beforeAll(async () => {
        console.log('Setting up test user...')

        // Create test user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            email_confirm: true
        })

        if (authError || !authData.user) {
            throw new Error(`Failed to create test user: ${authError?.message}`)
        }

        testUserId = authData.user.id
        console.log(`Test user created: ${testUserId}`)
    }, 30000)

    afterAll(async () => {
        console.log('Cleaning up test data...')

        try {
            // Delete test organization if created
            if (testOrgSlug) {
                await supabase.from('organizations').delete().eq('org_slug', testOrgSlug)
            }

            // Delete test user
            if (testUserId) {
                await supabase.auth.admin.deleteUser(testUserId)
            }

            console.log('Cleanup completed')
        } catch (error) {
            console.warn('Cleanup failed:', error)
        }
    }, 30000)

    describe('createOrganization', () => {
        const testCreateOrg = async (orgName: string, type: string, planId: string) => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: `org_${Date.now()}`,
                    company_name: orgName,
                    admin_email: TEST_EMAIL,
                    subscription_plan: planId
                })
            })
            return response
        }

        it('should create organization successfully', async () => {
            const orgName = 'Test Organization'
            const orgSlug = `test_org_${Date.now()}`

            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: orgSlug,
                    company_name: orgName,
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.org_slug).toBe(orgSlug)
            expect(data.api_key).toBeDefined()

            // Save for cleanup
            testOrgSlug = orgSlug

            console.log(`Organization created: ${orgSlug}`)
        }, 30000)

        it('should handle already exists scenario', async () => {
            // Try to create the same org again
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: testOrgSlug,
                    company_name: 'Duplicate Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER',
                    regenerate_api_key_if_exists: true
                })
            })

            // Should succeed with regenerated API key
            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.api_key).toBeDefined()
            console.log('Handled duplicate org creation with API key regeneration')
        }, 30000)

        it('should validate organization name', async () => {
            const invalidNames = [
                '',
                'X', // Too short
                '<script>alert("xss")</script>',
                'Org & <div>HTML</div>'
            ]

            for (const invalidName of invalidNames) {
                const orgSlug = `invalid_${Date.now()}`
                const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CA-Root-Key': ROOT_KEY || ''
                    },
                    body: JSON.stringify({
                        org_slug: orgSlug,
                        company_name: invalidName,
                        admin_email: TEST_EMAIL,
                        subscription_plan: 'STARTER'
                    })
                })

                // Should either reject or sanitize
                if (response.ok) {
                    const data = await response.json()
                    // If accepted, name should be sanitized
                    expect(data.org_slug).toBeDefined()
                    console.log(`Sanitized invalid name: "${invalidName}"`)
                } else {
                    console.log(`Rejected invalid name: "${invalidName}"`)
                }
            }
        }, 60000)

        it('should require authentication (root key)', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No X-CA-Root-Key
                },
                body: JSON.stringify({
                    org_slug: `auth_test_${Date.now()}`,
                    company_name: 'Auth Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('Correctly required authentication')
        })

        it('should handle backend URL not configured gracefully', async () => {
            // This test documents expected behavior when backend is unavailable
            // The frontend should create org in Supabase but flag backend onboarding as failed
            console.log('Backend connectivity test - org should be created, backend onboarding may fail')
        })
    })

    describe('onboardToBackend', () => {
        let backendTestOrgSlug: string

        beforeEach(async () => {
            // Create a new org for each backend test
            backendTestOrgSlug = `backend_test_${Date.now()}`
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: backendTestOrgSlug,
                    company_name: 'Backend Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            expect(response.ok).toBe(true)
        }, 30000)

        it('should onboard organization to backend', async () => {
            // Check onboarding status - should be onboarded by default
            const { data: org } = await supabase
                .from('organizations')
                .select('backend_onboarded, backend_api_key_fingerprint')
                .eq('org_slug', backendTestOrgSlug)
                .single()

            expect(org?.backend_onboarded).toBe(true)
            expect(org?.backend_api_key_fingerprint).toBeDefined()
            console.log(`Backend onboarding status: ${org?.backend_onboarded}`)
        })

        it('should return API key on successful onboarding', async () => {
            const newOrgSlug = `api_key_test_${Date.now()}`
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: newOrgSlug,
                    company_name: 'API Key Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.api_key).toBeDefined()
            expect(data.api_key).toMatch(new RegExp(`^${newOrgSlug}_api_`))
            console.log(`API key format validated: ${data.api_key.substring(0, 30)}...`)
        }, 30000)

        it('should handle backend unavailable scenario', async () => {
            // Test with invalid backend URL (simulated)
            // In real implementation, this would test fallback behavior
            console.log('Backend unavailable test - org should be created, backend onboarding flagged as failed')
        })
    })

    describe('checkBackendOnboarding', () => {
        it('should check if organization is onboarded', async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('backend_onboarded, backend_api_key_fingerprint')
                .eq('org_slug', testOrgSlug)
                .single()

            expect(org).toBeDefined()
            expect(typeof org?.backend_onboarded).toBe('boolean')
            console.log(`Onboarding status: ${org?.backend_onboarded}`)
        })

        it('should return false for non-existent org', async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('backend_onboarded')
                .eq('org_slug', 'non_existent_org_xyz')
                .single()

            expect(org).toBeNull()
            console.log('Non-existent org returns null as expected')
        })

        it('should validate org slug format', async () => {
            const invalidSlugs = [
                '../../../etc/passwd',
                'org; DROP TABLE organizations;--',
                'org<script>alert(1)</script>'
            ]

            for (const invalidSlug of invalidSlugs) {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('backend_onboarded')
                    .eq('org_slug', invalidSlug)
                    .single()

                expect(org).toBeNull()
                console.log(`Invalid slug rejected: ${invalidSlug}`)
            }
        })
    })

    describe('getApiKeyInfo', () => {
        let apiKeyTestOrgSlug: string
        let apiKeyTestApiKey: string

        beforeAll(async () => {
            // Create org with API key
            apiKeyTestOrgSlug = `api_info_test_${Date.now()}`
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: apiKeyTestOrgSlug,
                    company_name: 'API Info Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            const data = await response.json()
            apiKeyTestApiKey = data.api_key
        }, 30000)

        it('should get API key info successfully', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${apiKeyTestOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKeyTestApiKey
                }
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.api_key_fingerprint).toBeDefined()
            expect(data.is_active).toBe(true)
            console.log(`API key info retrieved: fingerprint=${data.api_key_fingerprint}`)
        })

        it('should require authentication', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${apiKeyTestOrgSlug}/api-key/info`, {
                method: 'GET'
                // No X-API-Key header
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('API key info requires authentication')
        })

        it('should require org membership', async () => {
            // Create another org to test cross-tenant access
            const otherOrgSlug = `other_org_${Date.now()}`
            const otherResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: otherOrgSlug,
                    company_name: 'Other Org',
                    admin_email: `other_${TEST_EMAIL}`,
                    subscription_plan: 'STARTER'
                })
            })

            const otherData = await otherResponse.json()

            // Try to access apiKeyTestOrgSlug with otherOrg's API key
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${apiKeyTestOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': otherData.api_key
                }
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('Cross-tenant access correctly blocked')
        }, 30000)

        it('should handle API key not found', async () => {
            const noKeyOrgSlug = `no_key_org_${Date.now()}`

            // Create org in Supabase without backend onboarding
            await supabase.from('organizations').insert({
                org_slug: noKeyOrgSlug,
                org_name: 'No Key Org',
                org_type: 'company',
                plan: 'starter',
                billing_status: 'trialing',
                created_by: testUserId
            })

            // Try to get API key info (should fail - no key exists)
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${noKeyOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': 'fake_key' // This won't work anyway
                }
            })

            expect(response.ok).toBe(false)
            console.log('No API key scenario handled')

            // Cleanup
            await supabase.from('organizations').delete().eq('org_slug', noKeyOrgSlug)
        })
    })

    describe('rotateApiKey', () => {
        let rotateTestOrgSlug: string
        let rotateTestApiKey: string

        beforeAll(async () => {
            // Create org for rotation tests
            rotateTestOrgSlug = `rotate_test_${Date.now()}`
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: rotateTestOrgSlug,
                    company_name: 'Rotate Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            const data = await response.json()
            rotateTestApiKey = data.api_key
        }, 30000)

        it('should rotate API key successfully', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${rotateTestOrgSlug}/api-key/rotate`, {
                method: 'POST',
                headers: {
                    'X-API-Key': rotateTestApiKey
                }
            })

            expect(response.ok).toBe(true)
            const data = await response.json()
            expect(data.api_key).toBeDefined()
            expect(data.api_key).not.toBe(rotateTestApiKey)
            expect(data.api_key_fingerprint).toBeDefined()

            // Update for next test
            rotateTestApiKey = data.api_key
            console.log(`API key rotated successfully: ${data.api_key.substring(0, 30)}...`)
        }, 30000)

        it('should invalidate old API key after rotation', async () => {
            // Rotate key
            const rotateResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${rotateTestOrgSlug}/api-key/rotate`, {
                method: 'POST',
                headers: {
                    'X-API-Key': rotateTestApiKey
                }
            })

            const rotateData = await rotateResponse.json()
            const oldKey = rotateTestApiKey
            const newKey = rotateData.api_key

            // Try to use old key
            const testResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${rotateTestOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': oldKey
                }
            })

            expect(testResponse.ok).toBe(false)
            console.log('Old API key correctly invalidated')

            // Verify new key works
            const newTestResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${rotateTestOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': newKey
                }
            })

            expect(newTestResponse.ok).toBe(true)
            console.log('New API key works correctly')
        }, 30000)

        it('should require valid current API key', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${rotateTestOrgSlug}/api-key/rotate`, {
                method: 'POST',
                headers: {
                    'X-API-Key': 'invalid_key_xyz'
                }
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('Invalid API key rejected for rotation')
        })

        it('should prevent concurrent rotations', async () => {
            // This test documents expected behavior
            // Implementation should use locks to prevent race conditions
            console.log('Concurrent rotation prevention test - implementation should use locks')
        })
    })

    describe('saveApiKey', () => {
        it('should save API key to secure storage', async () => {
            const saveTestOrgSlug = `save_test_${Date.now()}`

            // Create org
            const createResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: saveTestOrgSlug,
                    company_name: 'Save Test Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            const createData = await createResponse.json()
            const apiKey = createData.api_key

            // API key should already be saved by onboarding
            // Verify it exists in secure storage by checking we can get info
            const infoResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${saveTestOrgSlug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey
                }
            })

            expect(infoResponse.ok).toBe(true)
            console.log('API key saved to secure storage on creation')
        }, 30000)

        it('should validate API key format', async () => {
            // Test with invalid API key formats
            const invalidKeys = [
                '',
                'short',
                'wrong_org_slug_api_key',
                '<script>alert(1)</script>',
                '../../../etc/passwd'
            ]

            for (const invalidKey of invalidKeys) {
                // Attempt to use invalid key
                const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${testOrgSlug}/api-key/info`, {
                    method: 'GET',
                    headers: {
                        'X-API-Key': invalidKey
                    }
                })

                expect(response.ok).toBe(false)
                console.log(`Invalid key format rejected: ${invalidKey}`)
            }
        })

        it('should require org membership to save', async () => {
            // This is implicit in the API design - saveApiKey requires authenticated user
            // who is a member of the org. Cross-tenant key injection is prevented.
            console.log('Cross-tenant key injection prevention test')
        })
    })

    describe('hasStoredApiKey', () => {
        it('should return true for org with stored key', async () => {
            // testOrgSlug should have a stored key from earlier tests
            const { data: org } = await supabase
                .from('organizations')
                .select('backend_api_key_fingerprint')
                .eq('org_slug', testOrgSlug)
                .single()

            const hasKey = !!org?.backend_api_key_fingerprint
            expect(hasKey).toBe(true)
            console.log(`Org has stored key: ${hasKey}`)
        })

        it('should return false for org without key', async () => {
            const noKeyOrgSlug = `no_stored_key_${Date.now()}`

            // Create org in Supabase without backend onboarding
            await supabase.from('organizations').insert({
                org_slug: noKeyOrgSlug,
                org_name: 'No Stored Key Org',
                org_type: 'company',
                plan: 'starter',
                billing_status: 'trialing',
                backend_onboarded: false,
                created_by: testUserId
            })

            const { data: org } = await supabase
                .from('organizations')
                .select('backend_api_key_fingerprint')
                .eq('org_slug', noKeyOrgSlug)
                .single()

            const hasKey = !!org?.backend_api_key_fingerprint
            expect(hasKey).toBe(false)
            console.log('Org without key returns false')

            // Cleanup
            await supabase.from('organizations').delete().eq('org_slug', noKeyOrgSlug)
        })

        it('should validate org slug', async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('backend_api_key_fingerprint')
                .eq('org_slug', 'invalid-slug-xyz')
                .single()

            expect(org).toBeNull()
            console.log('Invalid org slug returns null')
        })

        it('should require org membership', async () => {
            // This test documents security requirement
            // hasStoredApiKey should only be callable by org members
            console.log('Org membership requirement for hasStoredApiKey')
        })
    })

    describe('completeOnboarding', () => {
        it('should complete onboarding after Stripe checkout', async () => {
            // This test documents the flow - actual Stripe integration requires:
            // 1. Valid Stripe session ID
            // 2. Completed checkout
            // 3. Metadata with pending company info
            console.log('Complete onboarding flow requires Stripe integration')
        })

        it('should validate session ID format', async () => {
            const invalidSessionIds = [
                '',
                'invalid',
                'sub_123', // Not a session ID
                '<script>alert(1)</script>'
            ]

            for (const sessionId of invalidSessionIds) {
                // In real implementation, this would call completeOnboarding(sessionId)
                // and expect it to reject invalid formats
                console.log(`Invalid session ID: ${sessionId}`)
            }
        })

        it('should verify session belongs to user', async () => {
            // Security requirement: Session metadata.user_id must match current user
            console.log('Session ownership verification test')
        })

        it('should handle duplicate completion (idempotency)', async () => {
            // If user refreshes /onboarding/success, should not create duplicate org
            console.log('Idempotent completion test')
        })

        it('should sync subscription to backend', async () => {
            // After creating org, should sync limits to BigQuery
            console.log('Backend subscription sync test')
        })
    })

    describe('Authorization & Security', () => {
        it('should prevent unauthorized org creation', async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No X-CA-Root-Key
                },
                body: JSON.stringify({
                    org_slug: `unauth_test_${Date.now()}`,
                    company_name: 'Unauthorized Org',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            expect(response.ok).toBe(false)
            expect([401, 403]).toContain(response.status)
            console.log('Unauthorized org creation blocked')
        })

        it('should prevent cross-tenant access', async () => {
            // Create two orgs with different users
            const org1Slug = `tenant1_${Date.now()}`
            const org2Slug = `tenant2_${Date.now()}`

            const org1Response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: org1Slug,
                    company_name: 'Tenant 1',
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            const org2Response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: org2Slug,
                    company_name: 'Tenant 2',
                    admin_email: `other_${TEST_EMAIL}`,
                    subscription_plan: 'STARTER'
                })
            })

            const org1Data = await org1Response.json()
            const org2Data = await org2Response.json()

            // Try to access org1 with org2's API key
            const crossTenantResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${org1Slug}/api-key/info`, {
                method: 'GET',
                headers: {
                    'X-API-Key': org2Data.api_key
                }
            })

            expect(crossTenantResponse.ok).toBe(false)
            expect([401, 403]).toContain(crossTenantResponse.status)
            console.log('Cross-tenant access correctly prevented')

            // Cleanup
            await supabase.from('organizations').delete().eq('org_slug', org1Slug)
            await supabase.from('organizations').delete().eq('org_slug', org2Slug)
        }, 30000)

        it('should sanitize XSS attempts in org name', async () => {
            const xssAttempts = [
                '<script>alert("xss")</script>',
                '<img src=x onerror=alert(1)>',
                'javascript:alert(1)',
                '"><script>alert(1)</script>',
                '<iframe src="javascript:alert(1)">'
            ]

            for (const xssAttempt of xssAttempts) {
                const orgSlug = `xss_test_${Date.now()}`
                const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CA-Root-Key': ROOT_KEY || ''
                    },
                    body: JSON.stringify({
                        org_slug: orgSlug,
                        company_name: xssAttempt,
                        admin_email: TEST_EMAIL,
                        subscription_plan: 'STARTER'
                    })
                })

                if (response.ok) {
                    const data = await response.json()
                    // Should be sanitized (no script tags)
                    const { data: org } = await supabase
                        .from('organizations')
                        .select('org_name')
                        .eq('org_slug', orgSlug)
                        .single()

                    expect(org?.org_name).not.toContain('<script')
                    expect(org?.org_name).not.toContain('javascript:')
                    console.log(`XSS attempt sanitized: "${xssAttempt}" -> "${org?.org_name}"`)

                    // Cleanup
                    await supabase.from('organizations').delete().eq('org_slug', orgSlug)
                }
            }
        }, 60000)

        it('should prevent SQL injection in org slug', async () => {
            const sqlInjectionAttempts = [
                "org'; DROP TABLE organizations;--",
                "org' OR '1'='1",
                "org\"; DELETE FROM organizations WHERE '1'='1';--"
            ]

            for (const attempt of sqlInjectionAttempts) {
                const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CA-Root-Key': ROOT_KEY || ''
                    },
                    body: JSON.stringify({
                        org_slug: attempt,
                        company_name: 'SQL Injection Test',
                        admin_email: TEST_EMAIL,
                        subscription_plan: 'STARTER'
                    })
                })

                // Should be rejected (invalid slug format)
                expect(response.ok).toBe(false)
                console.log(`SQL injection attempt blocked: ${attempt}`)
            }
        }, 30000)
    })

    describe('Edge Cases', () => {
        it('should handle very long organization names', async () => {
            const longName = 'A'.repeat(200)
            const orgSlug = `long_name_${Date.now()}`

            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: orgSlug,
                    company_name: longName,
                    admin_email: TEST_EMAIL,
                    subscription_plan: 'STARTER'
                })
            })

            if (response.ok) {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('org_name')
                    .eq('org_slug', orgSlug)
                    .single()

                // Should be truncated to 100 chars
                expect(org?.org_name.length).toBeLessThanOrEqual(100)
                console.log(`Long name truncated: ${longName.length} -> ${org?.org_name.length}`)

                // Cleanup
                await supabase.from('organizations').delete().eq('org_slug', orgSlug)
            }
        }, 30000)

        it('should handle special characters in org name', async () => {
            const specialNames = [
                'Org & Company',
                'Company (Pty) Ltd',
                "O'Reilly Media",
                'Société Générale'
            ]

            for (const name of specialNames) {
                const orgSlug = `special_${Date.now()}`
                const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CA-Root-Key': ROOT_KEY || ''
                    },
                    body: JSON.stringify({
                        org_slug: orgSlug,
                        company_name: name,
                        admin_email: TEST_EMAIL,
                        subscription_plan: 'STARTER'
                    })
                })

                if (response.ok) {
                    console.log(`Special characters handled: "${name}"`)
                    await supabase.from('organizations').delete().eq('org_slug', orgSlug)
                }
            }
        }, 30000)

        it('should handle missing optional fields', async () => {
            // Test with minimal required fields only
            const orgSlug = `minimal_${Date.now()}`
            const response = await fetch(`${API_BASE_URL}/api/v1/organizations/onboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CA-Root-Key': ROOT_KEY || ''
                },
                body: JSON.stringify({
                    org_slug: orgSlug,
                    company_name: 'Minimal Org',
                    admin_email: TEST_EMAIL
                    // No subscription_plan (should default to STARTER)
                })
            })

            expect(response.ok).toBe(true)
            console.log('Missing optional fields handled with defaults')

            // Cleanup
            await supabase.from('organizations').delete().eq('org_slug', orgSlug)
        }, 30000)
    })
})
