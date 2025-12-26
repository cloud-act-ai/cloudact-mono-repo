import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

// Cache user data for the current request cycle
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
})

// Cache org data for the current request cycle
export const getOrgData = cache(async (orgSlug: string) => {
  const supabase = await createClient()
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, org_name, org_slug, billing_status, plan")
    .eq("org_slug", orgSlug)
    .single()

  if (error || !org) return null
  return org
})

// Cache membership data for the current request cycle
export const getMembership = cache(async (orgId: string, userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .single()
  return data
})

// Cache profile data for the current request cycle
export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .single()
  return data
})

// Cache member count for the current request cycle
export const getMemberCount = cache(async (orgId: string) => {
  const supabase = await createClient()
  const { count } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active")
  return count || 0
})

// Get all org layout data in parallel with caching
export async function getOrgLayoutData(orgSlug: string) {
  const user = await getCurrentUser()
  if (!user) return null

  const org = await getOrgData(orgSlug)
  if (!org) return null

  // Run remaining queries in parallel
  const [membership, profile, memberCount] = await Promise.all([
    getMembership(org.id, user.id),
    getProfile(user.id),
    getMemberCount(org.id)
  ])

  if (!membership) return null

  return {
    user,
    org,
    membership,
    profile,
    memberCount
  }
}
