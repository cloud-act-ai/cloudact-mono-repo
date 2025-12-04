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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-gray-400" />
        <div className="text-center space-y-2">
          <h2 className="console-heading">Not authenticated</h2>
          <p className="console-subheading">Please sign in to access the dashboard</p>
        </div>
        <Link href="/login" className="console-button-primary inline-flex items-center">
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Link>
      </div>
    )
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, org_name, org_slug, plan, billing_status")
    .eq("org_slug", orgSlug)
    .single()

  if (!org) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-gray-400" />
        <div className="text-center space-y-2">
          <h2 className="console-heading">Organization not found</h2>
          <p className="console-subheading">The organization you're looking for doesn't exist</p>
        </div>
      </div>
    )
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single()

  const { count: memberCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active")

  const data: DashboardData = {
    organization: org,
    memberCount: memberCount || 0,
    userRole: membership?.role || "read_only",
  }

  return (
    <div className="space-y-8">
      {success === "true" && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-[#007A78]/20 bg-[#F0FDFA]">
          <CheckCircle2 className="h-5 w-5 text-[#007A78] mt-0.5" />
          <div>
            <h3 className="console-card-title text-[#007A78]">Subscription Successful!</h3>
            <p className="console-subheading">
              Your subscription has been activated. You now have full access to all features.
            </p>
          </div>
        </div>
      )}

      <div>
        <h1 className="console-page-title">Dashboard</h1>
        <p className="console-subheading mt-1">Welcome to {data.organization.org_name}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="console-stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-[#F0FDFA] flex items-center justify-center">
              <Building2 className="h-5 w-5 text-[#007A78]" />
            </div>
            <div>
              <p className="console-card-title">Organization</p>
              <p className="console-small">Your workspace details</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="console-metric">{data.organization.org_name}</p>
            </div>
            <div className="space-y-1">
              <p className="console-small">Slug: {data.organization.org_slug}</p>
              <p className="console-small">Plan: <span className="console-badge console-badge-teal">{data.organization.plan}</span></p>
              <p className="console-small">Status: <span className="console-badge console-badge-success">{data.organization.billing_status}</span></p>
            </div>
          </div>
        </div>

        <div className="console-stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-[#FFF5F3] flex items-center justify-center">
              <Users className="h-5 w-5 text-[#FF6E50]" />
            </div>
            <div>
              <p className="console-card-title">Members</p>
              <p className="console-small">Team size</p>
            </div>
          </div>
          <div>
            <p className="console-metric console-metric-coral">{data.memberCount}</p>
            <p className="console-subheading mt-1">Active members</p>
          </div>
        </div>

        <div className="console-stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-[#F0FDFA] flex items-center justify-center">
              <Shield className="h-5 w-5 text-[#007A78]" />
            </div>
            <div>
              <p className="console-card-title">Your Role</p>
              <p className="console-small">Access level</p>
            </div>
          </div>
          <div>
            <p className="console-metric console-metric-teal capitalize">{data.userRole.replace("_", " ")}</p>
            <p className="console-subheading mt-1">
              {data.userRole === "owner" && "Full access to all features"}
              {data.userRole === "collaborator" && "Can edit data, no billing access"}
              {data.userRole === "read_only" && "View-only access"}
            </p>
          </div>
        </div>
      </div>

      <div className="console-stat-card">
        <div className="mb-4">
          <p className="console-card-title">Quick Actions</p>
          <p className="console-small">Common tasks</p>
        </div>
        <div className="space-y-2">
          <Link
            href={`/${orgSlug}/settings/members`}
            className="console-button-secondary w-full justify-between inline-flex items-center group"
          >
            Manage Members
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          {data.userRole === "owner" && (
            <Link
              href={`/${orgSlug}/billing`}
              className="console-button-secondary w-full justify-between inline-flex items-center group"
            >
              Billing & Subscription
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
          <Link
            href={`/${orgSlug}/settings/profile`}
            className="console-button-secondary w-full justify-between inline-flex items-center group"
          >
            Settings
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  )
}
