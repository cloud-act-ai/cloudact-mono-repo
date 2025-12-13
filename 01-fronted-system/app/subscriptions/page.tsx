import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Redirect page for /subscriptions
 *
 * This page handles the case where users navigate to /subscriptions
 * without an organization slug. It redirects them to their first
 * organization's subscription page.
 */
export default async function SubscriptionsRedirectPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get user's organizations
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id, organizations!inner(org_slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgSlug = (memberships?.[0]?.organizations as any)?.org_slug
  if (orgSlug) {
    redirect(`/${orgSlug}/subscriptions`)
  }

  // If user has no organizations, redirect to onboarding
  redirect("/onboarding/billing")
}
