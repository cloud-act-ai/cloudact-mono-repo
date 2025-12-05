/**
 * Test Script: Organization Delete Flow
 *
 * This script tests the complete delete flow:
 * 1. Creates a test user via Supabase Auth
 * 2. Creates an organization
 * 3. Tests the deleteOrganization function
 * 4. Verifies backend cleanup
 *
 * Run with: npx tsx scripts/test_delete_flow.ts
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const TEST_EMAIL = `test_delete_${Date.now()}@example.com`
const TEST_PASSWORD = "TestPassword123!"
const TEST_ORG_NAME = "Test Delete Org"
const TEST_ORG_SLUG = `test_delete_org_${Date.now()}`

async function main() {
  console.log("=== Testing Organization Delete Flow ===\n")

  // Step 1: Create test user
  console.log("1. Creating test user...")
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Test Delete User" }
  })

  if (authError) {
    console.error("Failed to create user:", authError)
    return
  }
  const userId = authData.user.id
  console.log(`   Created user: ${userId}`)

  // Step 2: Create organization
  console.log("\n2. Creating organization...")
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      org_name: TEST_ORG_NAME,
      org_slug: TEST_ORG_SLUG,
      billing_status: "trialing",
      plan: "starter",
      seat_limit: 2,
      created_by: userId,
    })
    .select()
    .single()

  if (orgError) {
    console.error("Failed to create org:", orgError)
    await cleanup(userId)
    return
  }
  console.log(`   Created org: ${org.id} (${org.org_name})`)

  // Step 3: Verify user was auto-added as owner (by database trigger)
  console.log("\n3. Verifying owner membership...")
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .single()

  if (memberError) {
    console.error("Failed to find member:", memberError)
    await cleanup(userId, org.id)
    return
  }
  console.log(`   User is ${membership.role} (status: ${membership.status})`)

  // Step 4: Verify state before delete
  console.log("\n4. State before delete:")
  await showState(org.id, userId)

  // Step 5: Test protect_owner trigger (should fail)
  console.log("\n5. Testing protect_owner trigger...")
  const { error: deleteOwnerError } = await supabase
    .from("organization_members")
    .delete()
    .eq("org_id", org.id)
    .eq("user_id", userId)

  if (deleteOwnerError) {
    console.log(`   ✓ Trigger blocked delete: "${deleteOwnerError.message}"`)
  } else {
    console.log("   ✗ WARNING: Delete succeeded (trigger not working!)")
  }

  // Step 6: Simulate deleteOrganization flow (soft delete)
  console.log("\n6. Simulating deleteOrganization flow...")

  // 6a. Revoke pending invites
  await supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("org_id", org.id)
    .eq("status", "pending")
  console.log("   - Revoked pending invites")

  // 6b. Deactivate all memberships (not delete - avoids trigger)
  const { error: deactivateError } = await supabase
    .from("organization_members")
    .update({ status: "inactive" })
    .eq("org_id", org.id)

  if (deactivateError) {
    console.error("   ✗ Failed to deactivate members:", deactivateError)
  } else {
    console.log("   ✓ Deactivated all memberships")
  }

  // 6c. Soft-delete organization
  const { error: softDeleteError } = await supabase
    .from("organizations")
    .update({
      billing_status: "deleted",
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", org.id)

  if (softDeleteError) {
    console.error("   ✗ Failed to soft-delete org:", softDeleteError)
  } else {
    console.log("   ✓ Soft-deleted organization")
  }

  // Step 7: Verify state after delete
  console.log("\n7. State after delete:")
  await showState(org.id, userId)

  // Step 8: Test backend delete endpoint
  console.log("\n8. Testing backend delete endpoint...")
  const backendUrl = process.env.API_SERVICE_URL || "http://localhost:8000"
  const adminKey = process.env.CA_ROOT_API_KEY

  if (adminKey) {
    try {
      const response = await fetch(`${backendUrl}/api/v1/organizations/${TEST_ORG_SLUG}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CA-Root-Key": adminKey,
        },
        body: JSON.stringify({
          delete_dataset: false,
          confirm_org_slug: TEST_ORG_SLUG,
        }),
      })
      const result = await response.json()
      if (response.ok) {
        console.log(`   ✓ Backend delete succeeded:`, result)
      } else {
        console.log(`   Backend response (${response.status}):`, result)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.log(`   Backend not reachable (this is OK if not onboarded):`, errorMessage)
    }
  } else {
    console.log("   Skipped (CA_ROOT_API_KEY not set)")
  }

  // Cleanup
  console.log("\n9. Cleaning up test data...")
  await cleanup(userId, org.id)
  console.log("   Done!")

  console.log("\n=== Test Complete ===")
}

async function showState(orgId: string, _userId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("org_name, billing_status, is_deleted")
    .eq("id", orgId)
    .single()
  console.log(`   Org: ${org?.org_name} | status: ${org?.billing_status} | deleted: ${org?.is_deleted}`)

  const { data: members } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("org_id", orgId)
  console.log(`   Members: ${JSON.stringify(members)}`)
}

async function cleanup(userId: string, orgId?: string) {
  if (orgId) {
    await supabase.from("organization_members").delete().eq("org_id", orgId)
    await supabase.from("organizations").delete().eq("id", orgId)
  }
  await supabase.auth.admin.deleteUser(userId)
}

main().catch(console.error)
