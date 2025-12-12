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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center space-y-6 bg-white border border-gray-200 rounded-xl">
          <AlertCircle className="h-12 w-12 sm:h-16 sm:w-16 text-[#FF6E50] mx-auto" />
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Not authenticated</h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">Please sign in to access the dashboard</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-[#007A78] hover:bg-[#005F5D] text-white rounded-lg font-medium text-sm transition-colors">
            <LogIn className="h-4 w-4" />
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center space-y-6 bg-white border border-gray-200 rounded-xl">
          <AlertCircle className="h-12 w-12 sm:h-16 sm:w-16 text-[#FF6E50] mx-auto" />
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Organization not found</h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">The organization you're looking for doesn't exist</p>
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {success === "true" && (
          <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border border-[#007A78] bg-[#F0FDFA]">
            <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#007A78] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">Subscription Successful!</h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">
                Your subscription has been activated. You now have full access to all features.
              </p>
            </div>
          </div>
        )}

        <div className="pb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">Welcome to {data.organization.org_name}</p>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Organization - Light teal shade with border */}
          <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Organization</p>
                <p className="text-xs text-gray-500">Your workspace</p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{data.organization.org_name}</p>
              <div className="space-y-2.5 pt-3 border-t border-[#007A78]/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 font-medium">Slug:</span>
                  <span className="text-xs font-bold text-gray-900 truncate">{data.organization.org_slug}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 font-medium">Plan:</span>
                  <span className="inline-block px-2.5 py-1 rounded-md bg-[#007A78] text-white text-xs font-bold uppercase">{data.organization.plan}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 font-medium">Status:</span>
                  <span className="inline-block px-2.5 py-1 rounded-md bg-green-500 text-white text-xs font-bold capitalize">{data.organization.billing_status}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Members - Light coral shade with border */}
          <div className="bg-[#FF6E50]/5 border-2 border-[#FF6E50] rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-[#FF6E50] flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Team Members</p>
                <p className="text-xs text-gray-500">Active users</p>
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{data.memberCount}</p>
          </div>

          {/* Card 3: Your Role - Light teal shade with border */}
          <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Your Role</p>
                <p className="text-xs text-gray-500">Access level</p>
              </div>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 capitalize mb-2">{data.userRole.replace("_", " ")}</p>
              <p className="text-sm text-gray-600">
                {data.userRole === "owner" && "Full access to all features"}
                {data.userRole === "collaborator" && "Can edit data, no billing access"}
                {data.userRole === "read_only" && "View-only access"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#007A78]/5 border-2 border-[#007A78]/50 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
              <ArrowRight className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">Quick Actions</p>
              <p className="text-xs text-gray-500">Common tasks</p>
            </div>
          </div>
          <div className="space-y-3">
            <Link
              href={`/${orgSlug}/settings/members`}
              className="w-full px-4 sm:px-5 py-3 bg-[#007A78] hover:bg-[#005F5D] text-white rounded-lg font-semibold text-sm inline-flex items-center justify-between transition-all group"
            >
              Manage Members
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            {data.userRole === "owner" && (
              <Link
                href={`/${orgSlug}/billing`}
                className="w-full px-4 sm:px-5 py-3 bg-[#FF6E50] hover:bg-[#E55A3C] text-white rounded-lg font-semibold text-sm inline-flex items-center justify-between transition-all group"
              >
                Billing & Subscription
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            <Link
              href={`/${orgSlug}/settings/profile`}
              className="w-full px-4 sm:px-5 py-3 bg-[#007A78] hover:bg-[#005F5D] text-white rounded-lg font-semibold text-sm inline-flex items-center justify-between transition-all group"
            >
              Settings
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
