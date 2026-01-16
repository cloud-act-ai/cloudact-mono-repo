/**
 * Script to retry backend onboarding for an existing organization.
 *
 * Usage:
 *   npx tsx scripts/retry-backend-onboarding.ts <org_slug>
 *
 * Example:
 *   npx tsx scripts/retry-backend-onboarding.ts cloudact_inc_01142026
 *
 * This script:
 * 1. Gets org data from Supabase
 * 2. Calls the backend onboarding endpoint
 * 3. Saves the API key to Supabase
 */

import { createClient } from "@supabase/supabase-js"

async function main() {
  const orgSlug = process.argv[2]

  if (!orgSlug) {
    console.error("Usage: npx tsx scripts/retry-backend-onboarding.ts <org_slug>")
    process.exit(1)
  }

  console.log(`\n🔄 Retrying backend onboarding for: ${orgSlug}\n`)

  // Load environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
  const adminApiKey = process.env.CA_ROOT_API_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    process.exit(1)
  }

  if (!backendUrl) {
    console.error("❌ API_SERVICE_URL or NEXT_PUBLIC_API_SERVICE_URL must be set")
    process.exit(1)
  }

  if (!adminApiKey) {
    console.error("❌ CA_ROOT_API_KEY must be set")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Step 1: Get org data from Supabase
  console.log("1️⃣ Getting organization data from Supabase...")
  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("id, org_name, plan, default_currency, default_timezone, created_by")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError || !orgData) {
    console.error(`❌ Organization not found: ${orgError?.message || "Unknown error"}`)
    process.exit(1)
  }

  console.log(`   ✅ Found org: ${orgData.org_name} (ID: ${orgData.id})`)

  // Step 2: Get admin email from organization_members -> profiles
  console.log("2️⃣ Getting admin email...")

  // First get the owner's user_id from organization_members
  const { data: memberData, error: memberError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgData.id)
    .eq("role", "owner")
    .single()

  let adminEmail = "admin@example.com" // Fallback

  if (!memberError && memberData?.user_id) {
    // Get email from profiles table
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", memberData.user_id)
      .single()

    if (!profileError && profileData?.email) {
      adminEmail = profileData.email
    }
  }

  console.log(`   ✅ Admin email: ${adminEmail}`)

  // Step 3: Map plan to backend format
  const planMap: Record<string, string> = {
    "starter": "STARTER",
    "professional": "PROFESSIONAL",
    "scale": "SCALE",
  }
  const subscriptionPlan = planMap[orgData.plan?.toLowerCase() || "starter"] || "STARTER"

  // Step 4: Call backend onboarding
  console.log("3️⃣ Calling backend onboarding endpoint...")
  const onboardingPayload = {
    org_slug: orgSlug,
    company_name: orgData.org_name || orgSlug,
    admin_email: adminEmail,
    subscription_plan: subscriptionPlan,
    default_currency: orgData.default_currency || "USD",
    default_timezone: orgData.default_timezone || "UTC",
    // IMPORTANT: Regenerate API key if org already exists (sync fix)
    regenerate_api_key_if_exists: true,
  }

  console.log(`   Payload: ${JSON.stringify(onboardingPayload, null, 2)}`)

  try {
    const response = await fetch(`${backendUrl}/api/v1/organizations/onboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CA-Root-Key": adminApiKey,
      },
      body: JSON.stringify(onboardingPayload),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error(`❌ Backend onboarding failed: ${result.detail || result.error || response.statusText}`)
      console.error(`   Status: ${response.status}`)
      console.error(`   Response: ${JSON.stringify(result, null, 2)}`)
      process.exit(1)
    }

    console.log(`   ✅ Backend onboarding successful!`)
    console.log(`   Response: ${JSON.stringify(result, null, 2)}`)

    // Step 5: Save API key to Supabase
    if (result.api_key) {
      console.log("4️⃣ Saving API key to Supabase...")

      // Table schema: org_slug, api_key, created_at, updated_at
      const { error: saveError } = await supabase
        .from("org_api_keys_secure")
        .upsert({
          org_slug: orgSlug,
          api_key: result.api_key,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "org_slug",
        })

      if (saveError) {
        console.error(`❌ Failed to save API key to Supabase: ${saveError.message}`)
        console.error("   You may need to manually update the org_api_keys_secure table")
      } else {
        console.log("   ✅ API key saved to Supabase!")
      }

      // Also update fingerprint in organizations table
      const fingerprint = result.api_key.slice(-8)
      const { error: fingerprintError } = await supabase
        .from("organizations")
        .update({
          backend_api_key_fingerprint: `****${fingerprint}`,
          backend_onboarding_status: "COMPLETED",
          updated_at: new Date().toISOString(),
        })
        .eq("org_slug", orgSlug)

      if (fingerprintError) {
        console.warn(`   ⚠️ Failed to update fingerprint: ${fingerprintError.message}`)
      } else {
        console.log("   ✅ API key fingerprint updated in organizations table!")
      }
    }

    console.log("\n✅ Backend onboarding completed successfully!")
    console.log(`   Organization: ${orgSlug}`)
    console.log(`   You can now run pipelines from the frontend.`)

  } catch (fetchError) {
    console.error(`❌ Network error: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`)
    console.error("   Make sure the API service is running at:", backendUrl)
    process.exit(1)
  }
}

main().catch(error => {
  console.error("Script failed:", error)
  process.exit(1)
})
