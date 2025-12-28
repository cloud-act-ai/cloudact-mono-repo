import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * Validate redirect URL to prevent open redirect attacks.
 * Only allows relative paths that don't escape to external sites.
 */
function isValidRedirect(url: string | null): url is string {
  if (!url) return false
  // Must start with /
  if (!url.startsWith("/")) return false
  // Reject protocol-relative URLs (//evil.com)
  if (url.startsWith("//")) return false
  // Reject URLs with encoded characters that could bypass checks
  if (url.includes("\\")) return false
  // Reject URLs with @ which could indicate user@host
  if (url.includes("@")) return false
  // Reject URLs with control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(url)) return false
  return true
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // Validate next parameter to prevent open redirect
  const rawNext = searchParams.get("next")
  const next = isValidRedirect(rawNext) ? rawNext : null

  if (code) {
    const supabase = await createClient()
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (sessionError) {
      return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }

    const forwardedHost = request.headers.get("x-forwarded-host") // original origin before load balancer
    const isLocalEnv = process.env.NODE_ENV === "development"

    // Determine redirect URL
    let redirectPath = next
    if (!redirectPath || redirectPath === "/dashboard") {
      // Get user's first org for proper redirect
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        return NextResponse.redirect(`${origin}/auth/auth-code-error`)
      }

      if (user) {
        // Use maybeSingle() instead of single() to handle 0 or 1 rows gracefully
        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("organizations(org_slug)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle()

        if (membershipError) {
          // Still redirect to onboarding on error - user can recover from there
          redirectPath = "/onboarding/billing"
        } else if (membership?.organizations) {
          const orgs = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations
          const orgSlug = (orgs as { org_slug: string })?.org_slug
          redirectPath = orgSlug ? `/${orgSlug}/dashboard` : "/onboarding/billing"
        } else {
          // No org found, redirect to onboarding
          redirectPath = "/onboarding/billing"
        }
      } else {
        redirectPath = "/"
      }
    }

    if (isLocalEnv) {
      // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
      return NextResponse.redirect(`${origin}${redirectPath}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
    } else {
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
