import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host") // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development"

      // Determine redirect URL
      let redirectPath = next
      if (!redirectPath || redirectPath === "/dashboard") {
        // Get user's first org for proper redirect
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: membership } = await supabase
            .from("organization_members")
            .select("organizations(org_slug)")
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1)
            .single()

          const orgSlug = (membership?.organizations as { org_slug: string } | null)?.org_slug
          if (orgSlug) {
            redirectPath = `/${orgSlug}/dashboard`
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
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
