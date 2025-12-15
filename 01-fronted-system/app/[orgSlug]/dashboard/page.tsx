import { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { CheckCircle2, AlertCircle, LogIn, Users, Building2, Shield, ArrowRight, CreditCard, Play, Settings } from "lucide-react"
import { CostChart } from "@/components/dashboard/cost-chart"

interface OrganizationData {
  id: string
  org_name: string
  org_slug: string
  plan: string
  billing_status: string
  // i18n fields for locale-aware formatting
  default_currency?: string
  default_timezone?: string
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
        .select("id, org_name, org_slug, plan, billing_status, default_currency, default_timezone")
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
    <div className="space-y-8">
      {success === "true" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#007A78]/10 border border-[#007A78]/20 animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-[#007A78] flex-shrink-0" />
          <div>
            <h3 className="text-[15px] font-semibold text-[#007A78]">Subscription Successful!</h3>
            <p className="text-[13px] text-[#007A78]/80 leading-relaxed">
              Your subscription has been activated. You now have full access.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-1 pb-2">
        <h1 className="text-[34px] font-bold text-[#1C1C1E] tracking-tight">Summary</h1>
        <p className="text-[15px] text-[#8E8E93] font-medium">
          Welcome to <span className="text-[#1C1C1E]">{data.organization.org_name}</span>
        </p>
      </div>

      {/* Masonry Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Featured: Spending Trend (Span 2 on Desktop) */}
        <div className="col-span-1 md:col-span-2 xl:col-span-2 h-[320px]">
          <CostChart />
        </div>

        {/* Stacked Stats: Org & Members */}
        <div className="col-span-1 md:col-span-2 xl:col-span-1 flex flex-col gap-6">
          {/* Organization Card */}
          <div className="metric-card flex-1 flex flex-col justify-center">
            <div className="metric-card-header">
              <div className="metric-card-label metric-card-label-teal">
                <Building2 className="h-[18px] w-[18px]" />
                <span>Organization</span>
              </div>
            </div>
            <div className="metric-card-content">
              <div className="metric-card-value text-2xl truncate">{data.organization.org_name}</div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#F5F5F7] px-3 py-1.5 rounded-lg">
                  <span className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wide">Plan</span>
                  <span className="text-[13px] font-bold text-[#007A78] uppercase">{data.organization.plan}</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                   data.organization.billing_status === 'active' || data.organization.billing_status === 'trialing'
                      ? 'bg-[#007A78]/5 border-[#007A78]/20 text-[#007A78]'
                      : 'bg-[#FF6E50]/5 border-[#FF6E50]/20 text-[#FF6E50]'
                  }`}>
                   <span className="text-[12px] font-bold capitalize">{data.organization.billing_status}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Members / Role Row */}
          <div className="flex-1 grid grid-cols-2 gap-6">
            <div className="metric-card flex flex-col justify-center">
               <div className="metric-card-header mb-2">
                 <div className="metric-card-label metric-card-label-secondary">
                   <Users className="h-[16px] w-[16px]" />
                   <span>Team</span>
                 </div>
               </div>
               <div className="metric-card-value">{data.memberCount}</div>
            </div>

            <div className="metric-card flex flex-col justify-center">
               <div className="metric-card-header mb-2">
                 <div className="metric-card-label metric-card-label-tertiary">
                   <Shield className="h-[16px] w-[16px]" />
                   <span>Role</span>
                 </div>
               </div>
               <div className="metric-card-value text-xl capitalize">{data.userRole.replace("_", " ")}</div>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid - Full Width / Span 3 */}
        <div className="col-span-1 md:col-span-2 xl:col-span-3">
          <h2 className="text-[20px] font-bold text-[#1C1C1E] mb-4 tracking-tight">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href={`/${orgSlug}/settings/members`} className="group metric-card p-5 !shadow-sm hover:!shadow-md border-transparent bg-[#FFFFFF] hover:bg-[#F5F5F7]">
              <div className="h-10 w-10 rounded-full bg-[#007A78]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Users className="h-5 w-5 text-[#007A78]" />
              </div>
              <h3 className="text-[15px] font-bold text-[#1C1C1E]">Teammates</h3>
              <p className="text-[13px] text-[#8E8E93] mt-1">Manage access</p>
            </Link>

            {data.userRole === "owner" && (
              <Link href={`/${orgSlug}/billing`} className="group metric-card p-5 !shadow-sm hover:!shadow-md border-transparent bg-[#FFFFFF] hover:bg-[#F5F5F7]">
                <div className="h-10 w-10 rounded-full bg-[#FF6E50]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <CreditCard className="h-5 w-5 text-[#FF6E50]" />
                </div>
                <h3 className="text-[15px] font-bold text-[#1C1C1E]">Billing</h3>
                <p className="text-[13px] text-[#8E8E93] mt-1">Invoices & plans</p>
              </Link>
            )}

            <Link href={`/${orgSlug}/settings/profile`} className="group metric-card p-5 !shadow-sm hover:!shadow-md border-transparent bg-[#FFFFFF] hover:bg-[#F5F5F7]">
               <div className="h-10 w-10 rounded-full bg-[#8E8E93]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                 <Settings className="h-5 w-5 text-[#8E8E93]" />
               </div>
               <h3 className="text-[15px] font-bold text-[#1C1C1E]">Settings</h3>
               <p className="text-[13px] text-[#8E8E93] mt-1">Preferences</p>
            </Link>

             <Link href={`/${orgSlug}/pipelines`} className="group metric-card p-5 !shadow-sm hover:!shadow-md border-transparent bg-[#FFFFFF] hover:bg-[#F5F5F7]">
               <div className="h-10 w-10 rounded-full bg-[#005F5D]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                 <Play className="h-5 w-5 text-[#005F5D]" />
               </div>
               <h3 className="text-[15px] font-bold text-[#1C1C1E]">Pipelines</h3>
               <p className="text-[13px] text-[#8E8E93] mt-1">Run automation</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
