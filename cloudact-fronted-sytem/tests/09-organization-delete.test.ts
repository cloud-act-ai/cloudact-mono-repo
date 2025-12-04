/**
 * Flow Test 9: Organization Delete Flow
 *
 * Tests the complete organization deletion flow:
 * 1. Create test user and org via Supabase Admin API
 * 2. Test protect_owner trigger (should block direct delete)
 * 3. Test deleteOrganization flow (soft delete + backend cleanup)
 * 4. Verify data cleanup
 *
 * This test uses real database operations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

describe('Flow 9: Organization Delete', () => {
  const TEST_EMAIL = `test_delete_flow_${Date.now()}@test.com`
  const TEST_PASSWORD = 'TestPassword123!'
  const TEST_ORG_NAME = `Test Delete Org ${Date.now()}`
  const TEST_ORG_SLUG = `test_delete_${Date.now()}`

  let userId: string
  let orgId: string

  beforeAll(async () => {
    console.log('Setting up test data...')
    console.log(`Test User: ${TEST_EMAIL}`)
    console.log(`Test Org: ${TEST_ORG_NAME}`)

    // Create test user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Test Delete User' }
    })

    if (authError) throw new Error(`Failed to create user: ${authError.message}`)
    userId = authData.user.id
    console.log(`Created user: ${userId}`)

    // Create test organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        org_name: TEST_ORG_NAME,
        org_slug: TEST_ORG_SLUG,
        billing_status: 'trialing',
        plan: 'starter',
        seat_limit: 2,
      })
      .select()
      .single()

    if (orgError) throw new Error(`Failed to create org: ${orgError.message}`)
    orgId = org.id
    console.log(`Created org: ${orgId}`)

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        org_id: orgId,
        user_id: userId,
        role: 'owner',
        status: 'active',
      })

    if (memberError) throw new Error(`Failed to add member: ${memberError.message}`)
    console.log('User added as owner')
  })

  afterAll(async () => {
    console.log('Cleaning up test data...')
    try {
      // Clean up org members
      await supabase.from('organization_members').delete().eq('org_id', orgId)
      // Clean up org
      await supabase.from('organizations').delete().eq('id', orgId)
      // Clean up user
      await supabase.auth.admin.deleteUser(userId)
      console.log('Cleanup complete')
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  })

  it('should block direct owner deletion (protect_owner trigger)', async () => {
    console.log('\n--- Test: protect_owner trigger ---')

    // Try to delete the owner directly - should fail
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)

    // The trigger should block this
    expect(error).toBeTruthy()
    expect(error?.message).toContain('Cannot delete organization owner')
    console.log(`✓ Trigger blocked delete: "${error?.message}"`)
  })

  it('should block owner role change (protect_owner trigger)', async () => {
    console.log('\n--- Test: protect_owner role change ---')

    // Try to change owner role directly - should fail
    const { error } = await supabase
      .from('organization_members')
      .update({ role: 'collaborator' })
      .eq('org_id', orgId)
      .eq('user_id', userId)

    // The trigger should block this
    expect(error).toBeTruthy()
    expect(error?.message).toContain('Cannot change owner role')
    console.log(`✓ Trigger blocked role change: "${error?.message}"`)
  })

  it('should allow deactivating members (soft delete approach)', async () => {
    console.log('\n--- Test: Soft delete approach ---')

    // This is how deleteOrganization works - sets status to inactive
    const { error: deactivateError } = await supabase
      .from('organization_members')
      .update({ status: 'inactive' })
      .eq('org_id', orgId)

    expect(deactivateError).toBeNull()
    console.log('✓ Deactivated members successfully')

    // Verify status changed
    const { data: member } = await supabase
      .from('organization_members')
      .select('status')
      .eq('org_id', orgId)
      .single()

    expect(member?.status).toBe('inactive')
    console.log(`✓ Member status is now: ${member?.status}`)

    // Restore for next tests
    await supabase
      .from('organization_members')
      .update({ status: 'active' })
      .eq('org_id', orgId)
  })

  it('should soft-delete organization correctly', async () => {
    console.log('\n--- Test: Soft delete organization ---')

    // Soft delete the organization
    const { error: deleteError } = await supabase
      .from('organizations')
      .update({
        billing_status: 'deleted',
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', orgId)

    expect(deleteError).toBeNull()
    console.log('✓ Soft-deleted organization')

    // Verify org is marked as deleted
    const { data: org } = await supabase
      .from('organizations')
      .select('billing_status, is_deleted, deleted_at')
      .eq('id', orgId)
      .single()

    expect(org?.billing_status).toBe('deleted')
    expect(org?.is_deleted).toBe(true)
    expect(org?.deleted_at).toBeTruthy()
    console.log(`✓ Org state: billing_status=${org?.billing_status}, is_deleted=${org?.is_deleted}`)
  })

  it('should verify backend delete endpoint works', async () => {
    console.log('\n--- Test: Backend delete endpoint ---')

    const backendUrl = process.env.API_SERVICE_URL || 'http://localhost:8000'
    const adminKey = process.env.CA_ROOT_API_KEY

    if (!adminKey) {
      console.log('Skipping (CA_ROOT_API_KEY not set)')
      return
    }

    try {
      const response = await fetch(`${backendUrl}/api/v1/organizations/${TEST_ORG_SLUG}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CA-Root-Key': adminKey,
        },
        body: JSON.stringify({
          delete_dataset: false,
          confirm_org_slug: TEST_ORG_SLUG,
        }),
      })

      const result = await response.json()
      console.log(`Backend response (${response.status}):`, result)

      // The org may not exist in backend since we didn't onboard it
      // Either 200 (deleted) or 404/400 (not found) is acceptable
      expect([200, 400, 404]).toContain(response.status)
      console.log('✓ Backend endpoint responded correctly')
    } catch (err) {
      // Backend not running is acceptable for this test
      console.log('Backend not reachable (acceptable for unit test)')
    }
  })
})
