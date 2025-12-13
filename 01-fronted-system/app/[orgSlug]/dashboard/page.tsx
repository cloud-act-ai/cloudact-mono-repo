import { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { CheckCircle2, AlertCircle, LogIn, Users, Building2, Shield, ArrowRight } from "lucide-react"

interface OrganizationData {
  id: string
  org_name: string
  org_slug: string
  plan: string
  billing_status: string
}

interface DashboardData {
  organization: OrganizationData
  memberCount: number
  userRole: string
}

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params
  return {
    title: `Dashboard | ${orgSlug}`,
    description: "Organization dashboard overview",
  }
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ success?: string }>
}) {
  const { orgSlug } = await params
  const { success } = await searchParams
  const supabase = await createClient()

  let userResult, orgResult

  try {
    // Phase 1: Fetch user and org in parallel - OPTIMIZED
    // Both queries run simultaneously to minimize loading time
    const results = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("organizations")
        .select("id, org_name, org_slug, plan, billing_status")
        .eq("org_slug", orgSlug)
        .single()
    ])

    userResult = results[0]
    orgResult = results[1]
  } catch (err) {
    // Handle unexpected errors during parallel fetching
    console.error("Error loading dashboard data:", err)
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="metric-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF6E50] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Failed to load dashboard</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">Please try refreshing the page</p>
          </div>
        </div>
      </div>
    )
  }

  const user = userResult.data?.user
  const org = orgResult.data

  if (!user) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="metric-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF6E50] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Not authenticated</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">Please sign in to access the dashboard</p>
          </div>
          <Link href="/login" className="console-button-primary inline-flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="metric-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF6E50] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Organization not found</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">The organization you're looking for doesn't exist</p>
          </div>
        </div>
      </div>
    )
  }

  // Phase 2: Fetch membership and member count in parallel (both depend on org.id) - OPTIMIZED
  // Both queries run simultaneously to minimize loading time
  let membershipResult, memberCountResult

  try {
    const results = await Promise.all([
      supabase
        .from("organization_members")
        .select("role")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "active")
    ])

    membershipResult = results[0]
    memberCountResult = results[1]
  } catch (err) {
    // Handle unexpected errors during parallel fetching
    console.error("Error loading membership data:", err)
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="metric-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF6E50] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Failed to load membership data</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">Please try refreshing the page</p>
          </div>
        </div>
      </div>
    )
  }

  const data: DashboardData = {
    organization: org,
    memberCount: memberCountResult.count || 0,
    userRole: membershipResult.data?.role || "read_only",
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {success === "true" && (
        <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#007A78]/10">
          <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#007A78] mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-[15px] font-semibold text-black">Subscription Successful!</h3>
            <p className="text-[13px] text-[#8E8E93] mt-1 leading-relaxed">
              Your subscription has been activated. You now have full access to all features.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="pb-2">
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Dashboard</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">Welcome to {data.organization.org_name}</p>
      </div>

      {/* Pinned Section */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Pinned</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Organization */}
          <div className="metric-card">
            <div className="metric-card-header">
              <div className="metric-card-label metric-card-label-teal">
                <Building2 className="h-[18px] w-[18px]" />
                <span>Organization</span>
              </div>
            </div>
            <div className="metric-card-content">
              <div className="metric-card-value">{data.organization.org_name}</div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Plan</span>
                  <span className="text-[13px] font-semibold text-[#007A78] uppercase">{data.organization.plan}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Status</span>
                  <span className={`text-[13px] font-semibold capitalize ${
                    data.organization.billing_status === 'active' || data.organization.billing_status === 'trialing'
                      ? 'text-[#007A78]'
                      : data.organization.billing_status === 'past_due'
                      ? 'text-[#FF9500]'
                      : 'text-[#FF6E50]'
                  }`}>
                    {data.organization.billing_status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Members */}
          <div className="metric-card">
            <div className="metric-card-header">
              <div className="metric-card-label metric-card-label-secondary">
                <Users className="h-[18px] w-[18px]" />
                <span>Team Members</span>
              </div>
            </div>
            <div className="metric-card-content">
              <div className="metric-card-value">{data.memberCount}</div>
              <div className="metric-card-description mt-1">Active users in your workspace</div>
            </div>
          </div>

          {/* Card 3: Your Role */}
          <div className="metric-card">
            <div className="metric-card-header">
              <div className="metric-card-label metric-card-label-tertiary">
                <Shield className="h-[18px] w-[18px]" />
                <span>Your Role</span>
              </div>
            </div>
            <div className="metric-card-content">
              <div className="metric-card-value capitalize">{data.userRole.replace("_", " ")}</div>
              <div className="metric-card-description mt-1">
                {data.userRole === "owner" && "Full access to all features"}
                {data.userRole === "collaborator" && "Can edit data, no billing access"}
                {data.userRole === "read_only" && "View-only access"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Quick Actions</h2>
        <div className="metric-card">
          <div className="space-y-2">
            <Link
              href={`/${orgSlug}/settings/members`}
              className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007A78] focus-visible:outline-offset-2"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-[#007A78]" />
                <span>Manage Members</span>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8E8E93] transition-transform group-hover:translate-x-1" />
            </Link>
            {data.userRole === "owner" && (
              <Link
                href={`/${orgSlug}/billing`}
                className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007A78] focus-visible:outline-offset-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-sm bg-[#FF6E50]" />
                  </div>
                  <span>Billing & Subscription</span>
                </div>
                <ArrowRight className="h-4 w-4 text-[#8E8E93] transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            <Link
              href={`/${orgSlug}/settings/profile`}
              className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007A78] focus-visible:outline-offset-2"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-[#8E8E93]" />
                <span>Settings</span>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8E8E93] transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
