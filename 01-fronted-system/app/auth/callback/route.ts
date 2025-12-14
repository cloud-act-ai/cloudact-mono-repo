import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (sessionError) {
      console.error("[Auth Callback] Session exchange failed:", sessionError.message)
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
        console.error("[Auth Callback] Get user failed:", userError.message)
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
          console.error("[Auth Callback] Membership query failed:", membershipError.message)
          // Still redirect to onboarding on error - user can recover from there
          redirectPath = "/onboarding/organization"
        } else if (membership?.organizations) {
          const orgSlug = (membership.organizations as { org_slug: string })?.org_slug
          redirectPath = orgSlug ? `/${orgSlug}/dashboard` : "/onboarding/organization"
        } else {
          // No org found, redirect to onboarding
          redirectPath = "/onboarding/organization"
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
