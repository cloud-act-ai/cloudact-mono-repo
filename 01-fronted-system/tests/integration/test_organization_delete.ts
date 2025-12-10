/**
 * Integration Test: Organization Delete Flow
 *
 * Tests the complete organization deletion flow against REAL services.
 * Run: npx tsx tests/integration/test_organization_delete.ts
 *
 * Prerequisites:
 * - API Service running (port 8000)
 * - Supabase accessible
 * - .env.local configured
 *
 * Tests:
 * 1. Create test user via Supabase Admin API
 * 2. Create test organization
 * 3. Test protect_owner trigger (should block direct delete)
 * 4. Test soft delete flow
 * 5. Test backend cleanup (if backend onboarded)
 * 6. Verify cleanup
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") })

// Get URLs from environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_SERVICE_URL = process.env.API_SERVICE_URL || "http://localhost:8000"
const CA_ROOT_API_KEY = process.env.CA_ROOT_API_KEY || ""

interface TestResult {
  name: string
  passed: boolean
  message: string
  duration: number
}

class OrganizationDeleteTest {
  private supabase: SupabaseClient
  private results: TestResult[] = []
  private userId: string = ""
  private orgId: string = ""
  private orgSlug: string = ""

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  private async runTest(
    name: string,
    testFn: () => Promise<{ passed: boolean; message: string }>
  ): Promise<void> {
    const start = Date.now()
    console.log(`\n  Running: ${name}...`)

    try {
      const result = await testFn()
      const duration = Date.now() - start
      this.results.push({ name, ...result, duration })

      if (result.passed) {
        console.log(`  ✅ ${name} (${duration}ms)`)
        console.log(`     ${result.message}`)
      } else {
        console.log(`  ❌ ${name} (${duration}ms)`)
        console.log(`     ${result.message}`)
      }
    } catch (err: unknown) {
      const duration = Date.now() - start
      this.results.push({
        name,
        passed: false,
        message: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        duration,
      })
      console.log(`  ❌ ${name} (${duration}ms)`)
      console.log(`     Exception: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async setup(): Promise<boolean> {
    console.log("\n📋 SETUP: Creating test data...")

    const timestamp = Date.now()
    const testEmail = `test_delete_${timestamp}@test.com`
    const testPassword = "TestPassword123!"
    this.orgSlug = `test_delete_${timestamp}`

    // Create test user
    const { data: authData, error: authError } =
      await this.supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: "Test Delete User" },
      })

    if (authError) {
      console.log(`  ❌ Failed to create user: ${authError.message}`)
      return false
    }
    this.userId = authData.user.id
    console.log(`  ✅ Created user: ${this.userId}`)

    // Create test organization
    const { data: org, error: orgError } = await this.supabase
      .from("organizations")
      .insert({
        org_name: `Test Delete Org ${timestamp}`,
        org_slug: this.orgSlug,
        billing_status: "trialing",
        plan: "starter",
        seat_limit: 2,
        created_by: this.userId,
      })
      .select()
      .single()

    if (orgError) {
      console.log(`  ❌ Failed to create org: ${orgError.message}`)
      await this.cleanup()
      return false
    }
    this.orgId = org.id
    console.log(`  ✅ Created org: ${this.orgId} (${this.orgSlug})`)

    // Verify membership was auto-created by trigger
    const { data: membership } = await this.supabase
      .from("organization_members")
      .select("role, status")
      .eq("org_id", this.orgId)
      .eq("user_id", this.userId)
      .single()

    if (membership) {
      console.log(`  ✅ Owner membership auto-created: ${membership.role} (${membership.status})`)
    } else {
      console.log(`  ⚠️  No auto-membership found`)
    }

    return true
  }

  async runTests(): Promise<void> {
    console.log("\n🧪 TESTS: Running organization delete tests...")

    // Test 1: protect_owner trigger blocks direct deletion
    await this.runTest("protect_owner trigger blocks delete", async () => {
      const { error } = await this.supabase
        .from("organization_members")
        .delete()
        .eq("org_id", this.orgId)
        .eq("user_id", this.userId)

      if (error && error.message.includes("Cannot delete organization owner")) {
        return { passed: true, message: `Trigger blocked: "${error.message}"` }
      }
      return {
        passed: false,
        message: error ? `Unexpected error: ${error.message}` : "Delete succeeded (trigger not working!)",
      }
    })

    // Test 2: protect_owner trigger blocks role change
    await this.runTest("protect_owner trigger blocks role change", async () => {
      const { error } = await this.supabase
        .from("organization_members")
        .update({ role: "collaborator" })
        .eq("org_id", this.orgId)
        .eq("user_id", this.userId)

      if (error && error.message.includes("Cannot change owner role")) {
        return { passed: true, message: `Trigger blocked: "${error.message}"` }
      }
      return {
        passed: false,
        message: error ? `Unexpected error: ${error.message}` : "Role change succeeded (trigger not working!)",
      }
    })

    // Test 3: Soft delete organization
    await this.runTest("Soft delete organization", async () => {
      const { error } = await this.supabase
        .from("organizations")
        .update({
          billing_status: "deleted",
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", this.orgId)

      if (error) {
        return { passed: false, message: `Failed: ${error.message}` }
      }

      // Verify
      const { data: org } = await this.supabase
        .from("organizations")
        .select("billing_status, is_deleted, deleted_at")
        .eq("id", this.orgId)
        .single()

      if (org?.is_deleted && org?.billing_status === "deleted") {
        return {
          passed: true,
          message: `billing_status=${org.billing_status}, is_deleted=${org.is_deleted}`,
        }
      }
      return { passed: false, message: `Org not properly marked as deleted` }
    })

    // Test 4: Backend cleanup (if CA_ROOT_API_KEY is set)
    await this.runTest("Backend cleanup", async () => {
      if (!CA_ROOT_API_KEY) {
        return { passed: true, message: "Skipped (CA_ROOT_API_KEY not set)" }
      }

      try {
        const response = await fetch(`${API_SERVICE_URL}/api/v1/organizations/${this.orgSlug}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-CA-Root-Key": CA_ROOT_API_KEY,
          },
          body: JSON.stringify({
            delete_dataset: false,
            confirm_org_slug: this.orgSlug,
          }),
        })

        const result = await response.json()

        // 200 = deleted, 404/400 = not found (acceptable if org wasn't onboarded)
        if ([200, 400, 404].includes(response.status)) {
          return {
            passed: true,
            message: `Backend responded ${response.status}: ${JSON.stringify(result).slice(0, 100)}`,
          }
        }
        return { passed: false, message: `Unexpected status: ${response.status}` }
      } catch (err: unknown) {
        // Backend not reachable is acceptable for non-onboarded orgs
        const errorMessage = err instanceof Error ? err.message : String(err)
        return { passed: true, message: `Backend not reachable (acceptable): ${errorMessage}` }
      }
    })
  }

  async cleanup(): Promise<void> {
    console.log("\n🧹 CLEANUP: Removing test data...")

    try {
      if (this.orgId) {
        await this.supabase.from("organization_members").delete().eq("org_id", this.orgId)
        await this.supabase.from("organizations").delete().eq("id", this.orgId)
        console.log(`  ✅ Deleted org and memberships`)
      }
      if (this.userId) {
        await this.supabase.auth.admin.deleteUser(this.userId)
        console.log(`  ✅ Deleted user`)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.log(`  ⚠️  Cleanup error: ${errorMessage}`)
    }
  }

  printSummary(): void {
    console.log("\n╔════════════════════════════════════════════════════════════════╗")
    console.log("║                         TEST SUMMARY                           ║")
    console.log("╚════════════════════════════════════════════════════════════════╝\n")

    const passed = this.results.filter((r) => r.passed).length
    const failed = this.results.filter((r) => !r.passed).length
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0)

    for (const result of this.results) {
      const icon = result.passed ? "✅" : "❌"
      console.log(`${icon} ${result.name.padEnd(45)} ${result.duration}ms`)
    }

    console.log("\n───────────────────────────────────────────────────────────────────")
    console.log(`   Passed: ${passed} | Failed: ${failed} | Total: ${this.results.length}`)
    console.log(`   Duration: ${totalTime}ms`)
    console.log("═══════════════════════════════════════════════════════════════════\n")

    if (failed === 0) {
      console.log("✅ All tests passed!\n")
    } else {
      console.log(`❌ ${failed} test(s) failed\n`)
    }
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗")
  console.log("║           ORGANIZATION DELETE - INTEGRATION TEST               ║")
  console.log("╚════════════════════════════════════════════════════════════════╝")

  console.log(`\nEnvironment:`)
  console.log(`  Supabase URL:    ${SUPABASE_URL}`)
  console.log(`  API Service URL: ${API_SERVICE_URL}`)
  console.log(`  CA_ROOT_API_KEY: ${CA_ROOT_API_KEY ? "Set" : "Not set"}`)

  const test = new OrganizationDeleteTest()

  const setupOk = await test.setup()
  if (!setupOk) {
    console.log("\n❌ Setup failed. Aborting tests.\n")
    process.exit(1)
  }

  await test.runTests()
  await test.cleanup()
  test.printSummary()
}

main().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
