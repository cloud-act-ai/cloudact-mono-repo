import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { MobileHeader } from "@/components/mobile-header"
import { SidebarProvider } from "@/components/ui/sidebar"
import "./console.css"

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/login")
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, org_name, org_slug, billing_status, plan")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError || !org) {
    // Org not found - check if user has any other organizations
    const { data: userOrgs } = await supabase
      .from("organization_members")
      .select("org_id, organizations(org_slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)

    if (userOrgs && userOrgs.length > 0) {
      // User has another org - redirect to that org's dashboard
      const existingOrg = userOrgs[0].organizations as { org_slug?: string } | null
      if (existingOrg?.org_slug) {
        redirect(`/${existingOrg.org_slug}/dashboard`)
      }
    }
    // No existing org - redirect to onboarding
    redirect("/onboarding/organization")
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!membership) {
    redirect("/unauthorized")
  }

  // Get member count for the org
  const { count: memberCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active")

  // Enforce active subscription for dashboard access
  const inactiveStatuses = ["canceled", "past_due", "incomplete", "unpaid", "incomplete_expired"]
  if (org.billing_status && inactiveStatuses.includes(org.billing_status)) {
    redirect(`/${orgSlug}/billing?reason=subscription_required`)
  }

  return (
    <SidebarProvider>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#007A78] focus:text-white focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar
          orgSlug={orgSlug}
          orgName={org.org_name}
          orgPlan={org.plan}
          billingStatus={org.billing_status}
          memberCount={memberCount || 0}
          userRole={membership.role}
        />
        <div className="flex flex-1 flex-col">
          <MobileHeader orgName={org.org_name} />
          <main id="main-content" className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
