import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { MobileHeader } from "@/components/mobile-header"
import { SidebarProvider } from "@/components/ui/sidebar"
import { PipelineAutoTrigger } from "@/components/pipeline-auto-trigger"
import "./console.css"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { getOrgLayoutData } from "@/lib/data/org-data"
import { OrgProviders } from "@/components/org-providers"

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const [{ orgSlug }, headersList] = await Promise.all([
    params,
    headers()
  ])

  // Use cached data layer - queries are deduplicated within this request
  let layoutData = await getOrgLayoutData(orgSlug)

  if (!layoutData) {
    // No valid session or org - check why
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Log auth issues in development for debugging
    if (process.env.NODE_ENV === "development" && authError) {
      console.warn(`[OrgLayout] Auth error for ${orgSlug}:`, authError.message)
    }

    if (!user) {
      redirect("/login")
    }

    // Check if user has membership to THIS org specifically first
    // This handles transient cache/timing issues
    const { data: currentOrgMembership } = await supabase
      .from("organization_members")
      .select("org_id, organizations(org_slug, org_name)")
      .eq("user_id", user.id)
      .eq("status", "active")

    const hasCurrentOrgMembership = currentOrgMembership?.some(
      m => (m.organizations as { org_slug?: string } | null)?.org_slug === orgSlug
    )

    // If user has membership to this org, the issue might be transient - retry once
    if (hasCurrentOrgMembership) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[OrgLayout] Transient data issue for ${orgSlug}, retrying...`)
      }
      // Small delay to allow any pending writes to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      // Re-fetch layout data
      layoutData = await getOrgLayoutData(orgSlug)

      // If still null after retry, redirect to billing (not dashboard to avoid redirect loop)
      // The dashboard page uses the same layout, so redirecting to it would cause infinite loop
      if (!layoutData) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[OrgLayout] Retry failed for ${orgSlug}, data access issue - redirecting to billing`)
        }
        // Redirect to billing page which is exempt from data requirements
        redirect(`/${orgSlug}/billing?reason=data_unavailable`)
      }
    } else {
      // User doesn't have membership to this org - find another org
      const { data: userOrgs } = await supabase
        .from("organization_members")
        .select("org_id, organizations(org_slug)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)

      if (userOrgs && userOrgs.length > 0) {
        const existingOrg = userOrgs[0].organizations as { org_slug?: string } | null
        if (existingOrg?.org_slug) {
          redirect(`/${existingOrg.org_slug}/dashboard`)
        }
      }

      redirect("/onboarding/billing")
    }
  }

  const { user, org, membership, profile, memberCount } = layoutData

  // Enforce active subscription for dashboard access
  const pathname = headersList.get('x-pathname') || ''
  const isExemptRoute = pathname.includes('/billing') || pathname.includes('/subscriptions')

  const inactiveStatuses = ["canceled", "past_due", "incomplete", "unpaid", "incomplete_expired"]
  if (org.billing_status && inactiveStatuses.includes(org.billing_status) && !isExemptRoute) {
    redirect(`/${orgSlug}/billing?reason=subscription_required`)
  }

  return (
    <SidebarProvider>
      {/* Silent background pipeline auto-trigger on dashboard load */}
      <ErrorBoundary silent>
        <PipelineAutoTrigger orgSlug={orgSlug} />
      </ErrorBoundary>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#90FCA6] focus:text-black focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2"
        style={{ zIndex: 'var(--z-skip-link)' }}
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen w-full">
        <ErrorBoundary>
          <DashboardSidebar
            orgSlug={orgSlug}
            orgName={org.org_name}
            orgPlan={org.plan}
            billingStatus={org.billing_status}
            memberCount={memberCount || 0}
            userRole={membership.role}
            userName={profile?.full_name || user.email?.split('@')[0] || 'User'}
            userEmail={user.email || ''}
          />
        </ErrorBoundary>
        <div className="flex flex-1 flex-col">
          <ErrorBoundary>
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
          </ErrorBoundary>
          <main id="main-content" className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 dark:bg-slate-950" tabIndex={-1}>
            <OrgProviders orgSlug={orgSlug}>
              {children}
            </OrgProviders>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
