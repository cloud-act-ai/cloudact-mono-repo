import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const session_id = searchParams.get("session_id")
  const orgSlug = searchParams.get("org")

  console.log("[v0] Success callback hit:", { session_id, orgSlug })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error("[v0] No user found in success callback")
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // If orgSlug provided, redirect to that org's dashboard
  if (orgSlug) {
    const redirectUrl = new URL(`/${orgSlug}/dashboard`, request.url)
    redirectUrl.searchParams.set("success", "true")
    if (session_id) {
      redirectUrl.searchParams.set("session_id", session_id)
    }
    console.log("[v0] Redirecting to org dashboard:", redirectUrl.toString())
    return NextResponse.redirect(redirectUrl)
  }

  // Otherwise, find user's first org
  const { data: memberData } = await supabase
    .from("organization_members")
    .select("org_id, organizations(org_slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .single()

  if (memberData) {
    const org = memberData.organizations as unknown as { org_slug: string } | null
    const slug = org?.org_slug
    if (slug) {
      const redirectUrl = new URL(`/${slug}/dashboard`, request.url)
      redirectUrl.searchParams.set("success", "true")
      if (session_id) {
        redirectUrl.searchParams.set("session_id", session_id)
      }
      console.log("[v0] Redirecting to user's org dashboard:", redirectUrl.toString())
      return NextResponse.redirect(redirectUrl)
    }
  }

  // No org found, redirect to onboarding
  console.log("[v0] No org found, redirecting to onboarding")
  return NextResponse.redirect(new URL("/onboarding/billing", request.url))
}
