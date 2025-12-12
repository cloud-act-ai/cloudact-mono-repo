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

  // Phase 1: Fetch user and org in parallel
  const [userResult, orgResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("organizations")
      .select("id, org_name, org_slug, plan, billing_status")
      .eq("org_slug", orgSlug)
      .single()
  ])

  const user = userResult.data?.user
  const org = orgResult.data

  if (!user) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="health-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF3B30] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Not authenticated</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">Please sign in to access the dashboard</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 bg-[#007A78] hover:bg-[#006664] text-white rounded-xl font-semibold text-[15px] transition-colors">
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
        <div className="health-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
          <AlertCircle className="h-14 w-14 text-[#FF3B30] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold text-black">Organization not found</h2>
            <p className="text-[15px] text-[#8E8E93] leading-relaxed">The organization you're looking for doesn't exist</p>
          </div>
        </div>
      </div>
    )
  }

  // Phase 2: Fetch membership and member count in parallel (both depend on org.id)
  const [membershipResult, memberCountResult] = await Promise.all([
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

  const data: DashboardData = {
    organization: org,
    memberCount: memberCountResult.count || 0,
    userRole: membershipResult.data?.role || "read_only",
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {success === "true" && (
        <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#34C759]/10">
          <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#34C759] mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-[15px] font-semibold text-black">Subscription Successful!</h3>
            <p className="text-[13px] text-[#8E8E93] mt-1 leading-relaxed">
              Your subscription has been activated. You now have full access to all features.
            </p>
          </div>
        </div>
      )}

      {/* Page Header - Apple Health Style */}
      <div className="pb-2">
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Dashboard</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">Welcome to {data.organization.org_name}</p>
      </div>

      {/* Pinned Section - Apple Health Style */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Pinned</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Organization - Apple Health Style */}
          <div className="health-card">
            <div className="health-card-header">
              <div className="health-card-label health-card-label-teal">
                <Building2 className="h-[18px] w-[18px]" />
                <span>Organization</span>
              </div>
            </div>
            <div className="health-card-content">
              <div className="health-card-value">{data.organization.org_name}</div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Plan</span>
                  <span className="text-[13px] font-semibold text-[#007AFF] uppercase">{data.organization.plan}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Status</span>
                  <span className="text-[13px] font-semibold text-[#34C759] capitalize">{data.organization.billing_status}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Members - Apple Health Style */}
          <div className="health-card">
            <div className="health-card-header">
              <div className="health-card-label health-card-label-coral">
                <Users className="h-[18px] w-[18px]" />
                <span>Team Members</span>
              </div>
            </div>
            <div className="health-card-content">
              <div className="health-card-value">{data.memberCount}</div>
              <div className="health-card-description mt-1">Active users in your workspace</div>
            </div>
          </div>

          {/* Card 3: Your Role - Apple Health Style */}
          <div className="health-card">
            <div className="health-card-header">
              <div className="health-card-label health-card-label-purple">
                <Shield className="h-[18px] w-[18px]" />
                <span>Your Role</span>
              </div>
            </div>
            <div className="health-card-content">
              <div className="health-card-value capitalize">{data.userRole.replace("_", " ")}</div>
              <div className="health-card-description mt-1">
                {data.userRole === "owner" && "Full access to all features"}
                {data.userRole === "collaborator" && "Can edit data, no billing access"}
                {data.userRole === "read_only" && "View-only access"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Apple Health Style */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Quick Actions</h2>
        <div className="health-card">
          <div className="space-y-2">
            <Link
              href={`/${orgSlug}/settings/members`}
              className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-[#5856D6]" />
                <span>Manage Members</span>
              </div>
              <ArrowRight className="h-4 w-4 text-[#C7C7CC] transition-transform group-hover:translate-x-1" />
            </Link>
            {data.userRole === "owner" && (
              <Link
                href={`/${orgSlug}/billing`}
                className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <ArrowRight className="h-5 w-5 text-[#34C759]" />
                  <span>Billing & Subscription</span>
                </div>
                <ArrowRight className="h-4 w-4 text-[#C7C7CC] transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            <Link
              href={`/${orgSlug}/settings/profile`}
              className="w-full px-4 py-3.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-black rounded-xl font-medium text-[15px] inline-flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-[#8E8E93]" />
                <span>Settings</span>
              </div>
              <ArrowRight className="h-4 w-4 text-[#C7C7CC] transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
