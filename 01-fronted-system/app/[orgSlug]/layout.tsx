import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
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
    redirect("/onboarding/billing")
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

  // Get user profile for avatar/name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single()

  // Get member count for the org
  const { count: memberCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active")

  // Enforce active subscription for dashboard access
  // Exempt billing and subscriptions pages from this check to allow users to manage their billing/subscriptions
  // even when their subscription is inactive
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const isExemptRoute = pathname.includes('/billing') || pathname.includes('/subscriptions')

  const inactiveStatuses = ["canceled", "past_due", "incomplete", "unpaid", "incomplete_expired"]
  if (org.billing_status && inactiveStatuses.includes(org.billing_status) && !isExemptRoute) {
    redirect(`/${orgSlug}/billing?reason=subscription_required`)
  }

  return (
    <SidebarProvider>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#007A78] focus:text-white focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2"
        style={{ zIndex: 'var(--z-skip-link)' }}
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
          <MobileHeader
            orgName={org.org_name}
            orgSlug={orgSlug}
            user={{
              email: user.email || "",
              full_name: profile?.full_name || undefined,
              avatar_url: profile?.avatar_url || undefined,
            }}
            userRole={membership.role}
          />
          <main id="main-content" className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
