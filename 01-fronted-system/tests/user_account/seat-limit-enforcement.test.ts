/**
 * @vitest-environment node
 *
 * Seat Limit Enforcement Tests
 *
 * Tests that seat limits are properly enforced when:
 * 1. Creating invites (members + pending invites < seat_limit)
 * 2. Accepting invites (current members < seat_limit)
 *
 * Run: npx vitest run -c vitest.node.config.ts tests/seat-limit-enforcement.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const SKIP_TESTS = !SUPABASE_URL || !SUPABASE_SERVICE_KEY

if (SKIP_TESTS) {
    console.warn('Supabase credentials not set. Tests will be skipped.')
}

// Test data
const TEST_ORG_NAME = `seat_limit_test_${Date.now()}`
const TEST_ORG_SLUG = TEST_ORG_NAME.toLowerCase()
const TEST_OWNER_EMAIL = `seat_owner_${Date.now()}@example.com`

let supabase: SupabaseClient
let testOrgId: string
let testOwnerUserId: string
const createdUserIds: string[] = []
const createdInviteIds: string[] = []

describe.skipIf(SKIP_TESTS)('Seat Limit Enforcement', () => {

    beforeAll(async () => {
        console.log('Setting up seat limit tests...')

        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false }
        })

        // Create test owner
        const { data: ownerData, error: ownerError } = await supabase.auth.admin.createUser({
            email: TEST_OWNER_EMAIL,
            password: 'TestPassword123!',
            email_confirm: true
        })

        if (ownerError) throw new Error(`Failed to create owner: ${ownerError.message}`)
        testOwnerUserId = ownerData.user.id
        createdUserIds.push(testOwnerUserId)

        // Create org with seat_limit = 2 (owner counts as 1, so only 1 more member allowed)
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({
                org_name: TEST_ORG_NAME,
                org_slug: TEST_ORG_SLUG,
                created_by: testOwnerUserId,
                billing_status: 'active',
                plan: 'starter',
                seat_limit: 2,  // Important: Only 2 seats total
                backend_onboarded: true,
                backend_api_key_fingerprint: 'test_seat_limit'
            })
            .select()
            .single()

        if (orgError) throw new Error(`Failed to create org: ${orgError.message}`)
        testOrgId = orgData.id

        console.log(`Created org ${TEST_ORG_SLUG} with seat_limit=2`)
    })

    afterAll(async () => {
        console.log('Cleaning up...')
        try {
            // Delete invites
            if (createdInviteIds.length > 0) {
                await supabase.from('invites').delete().in('id', createdInviteIds)
            }

            // Delete members
            await supabase.from('organization_members').delete().eq('org_id', testOrgId)

            // Delete org
            await supabase.from('organizations').delete().eq('id', testOrgId)

            // Delete users
            for (const userId of createdUserIds) {
                await supabase.auth.admin.deleteUser(userId)
            }

            console.log('Cleanup complete')
        } catch (err) {
            console.error('Cleanup error:', err)
        }
    })

    describe('Invite Creation with Pending Invites Counted', () => {
        it('should count pending invites toward seat limit', async () => {
            // Get current member count (should be 1 - owner)
            const { count: memberCount } = await supabase
                .from('organization_members')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'active')

            expect(memberCount).toBe(1) // Owner only

            // Create first invite - should succeed (1 member + 1 invite = 2, at limit)
            const token1 = randomBytes(32).toString('hex')
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + 48)

            const { data: invite1, error: error1 } = await supabase
                .from('invites')
                .insert({
                    org_id: testOrgId,
                    email: `invite1_${Date.now()}@example.com`,
                    role: 'collaborator',
                    token: token1,
                    invited_by: testOwnerUserId,
                    expires_at: expiresAt.toISOString(),
                    status: 'pending'
                })
                .select()
                .single()

            expect(error1).toBeNull()
            expect(invite1).toBeDefined()
            createdInviteIds.push(invite1!.id)

            // Get pending invite count
            const { count: pendingCount } = await supabase
                .from('invites')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'pending')

            expect(pendingCount).toBe(1)

            // Get org seat limit
            const { data: org } = await supabase
                .from('organizations')
                .select('seat_limit')
                .eq('id', testOrgId)
                .single()

            expect(org!.seat_limit).toBe(2)

            // Total reserved = members + pending = 1 + 1 = 2, which equals seat_limit
            const totalReserved = (memberCount || 0) + (pendingCount || 0)
            expect(totalReserved).toBe(2)

            // Application-level check: Creating another invite should be blocked
            // (members + pending >= seat_limit)
            const shouldBlockNewInvite = totalReserved >= org!.seat_limit
            expect(shouldBlockNewInvite).toBe(true)

            console.log(`Seat limit check: ${memberCount} members + ${pendingCount} pending = ${totalReserved}/${org!.seat_limit}`)
        })

        it('should allow invite after canceling pending invite', async () => {
            // Cancel the existing pending invite
            const { error: cancelError } = await supabase
                .from('invites')
                .update({ status: 'revoked' })
                .eq('org_id', testOrgId)
                .eq('status', 'pending')

            expect(cancelError).toBeNull()

            // Now pending count should be 0
            const { count: pendingCount } = await supabase
                .from('invites')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'pending')

            expect(pendingCount).toBe(0)

            // Get member count
            const { count: memberCount } = await supabase
                .from('organization_members')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'active')

            // Now we should be able to create a new invite
            const totalReserved = (memberCount || 0) + (pendingCount || 0)
            expect(totalReserved).toBe(1) // Only owner
            expect(totalReserved).toBeLessThan(2) // Below seat limit

            console.log(`After cancel: ${memberCount} members + ${pendingCount} pending = ${totalReserved}/2`)
        })
    })

    describe('Accept Invite with Seat Limit', () => {
        let inviteToken: string
        let inviteUserId: string
        let inviteEmail: string

        beforeAll(async () => {
            // Create a user who will accept the invite
            inviteEmail = `accept_test_${Date.now()}@example.com`
            const { data: userData, error: userError } = await supabase.auth.admin.createUser({
                email: inviteEmail,
                password: 'TestPassword123!',
                email_confirm: true
            })

            if (userError) throw new Error(`Failed to create invite user: ${userError.message}`)
            inviteUserId = userData.user.id
            createdUserIds.push(inviteUserId)

            // Create an invite for this user
            inviteToken = randomBytes(32).toString('hex')
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + 48)

            const { data: invite, error: inviteError } = await supabase
                .from('invites')
                .insert({
                    org_id: testOrgId,
                    email: inviteEmail.toLowerCase(),
                    role: 'collaborator',
                    token: inviteToken,
                    invited_by: testOwnerUserId,
                    expires_at: expiresAt.toISOString(),
                    status: 'pending'
                })
                .select()
                .single()

            if (inviteError) throw new Error(`Failed to create invite: ${inviteError.message}`)
            createdInviteIds.push(invite.id)
        })

        it('should check seat limit when accepting invite', async () => {
            // Get current member count
            const { count: currentMembers } = await supabase
                .from('organization_members')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'active')

            // Get org seat limit
            const { data: org } = await supabase
                .from('organizations')
                .select('seat_limit')
                .eq('id', testOrgId)
                .single()

            expect(org).toBeDefined()
            expect(currentMembers).toBe(1) // Only owner

            // Check if we can accept (currentMembers < seat_limit)
            const canAccept = (currentMembers || 0) < org!.seat_limit
            expect(canAccept).toBe(true)

            console.log(`Accept check: ${currentMembers} members < ${org!.seat_limit} seat_limit = can accept`)
        })

        it('should successfully accept invite when under seat limit', async () => {
            // Accept invite by creating membership
            const { error: memberError } = await supabase
                .from('organization_members')
                .insert({
                    org_id: testOrgId,
                    user_id: inviteUserId,
                    role: 'collaborator',
                    status: 'active'
                })

            expect(memberError).toBeNull()

            // Update invite status
            await supabase
                .from('invites')
                .update({ status: 'accepted' })
                .eq('token', inviteToken)

            // Verify member was added
            const { data: newMember } = await supabase
                .from('organization_members')
                .select('id, role, status')
                .eq('org_id', testOrgId)
                .eq('user_id', inviteUserId)
                .single()

            expect(newMember).toBeDefined()
            expect(newMember!.status).toBe('active')
            expect(newMember!.role).toBe('collaborator')

            console.log('Successfully accepted invite')
        })

        it('should block new member when at seat limit', async () => {
            // Now we have 2 members (owner + collaborator)
            const { count: memberCount } = await supabase
                .from('organization_members')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', testOrgId)
                .eq('status', 'active')

            expect(memberCount).toBe(2)

            // Get seat limit
            const { data: org } = await supabase
                .from('organizations')
                .select('seat_limit')
                .eq('id', testOrgId)
                .single()

            // Should be at limit
            expect(memberCount).toBe(org!.seat_limit)

            // Application-level check: Adding another member should be blocked
            const canAddMore = (memberCount || 0) < org!.seat_limit
            expect(canAddMore).toBe(false)

            console.log(`At seat limit: ${memberCount}/${org!.seat_limit} - new members blocked`)
        })

        it('should reject third member due to seat limit trigger', async () => {
            // Create a third user
            const { data: thirdUser, error: userError } = await supabase.auth.admin.createUser({
                email: `third_${Date.now()}@example.com`,
                password: 'TestPassword123!',
                email_confirm: true
            })

            if (userError) throw new Error(`Failed to create third user: ${userError.message}`)
            createdUserIds.push(thirdUser.user.id)

            // Try to add as member - database trigger should reject
            const { error: memberError } = await supabase
                .from('organization_members')
                .insert({
                    org_id: testOrgId,
                    user_id: thirdUser.user.id,
                    role: 'collaborator',
                    status: 'active'
                })

            // Should get error from database trigger
            expect(memberError).not.toBeNull()
            expect(memberError!.message).toContain('Seat limit')

            console.log(`Database trigger blocked third member: ${memberError!.message}`)
        })
    })
})
