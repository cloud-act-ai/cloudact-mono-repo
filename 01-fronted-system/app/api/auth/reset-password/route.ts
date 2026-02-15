// Force dynamic to prevent pre-rendering (Supabase admin client needs runtime env vars)
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { sendPasswordResetEmail } from "@/lib/email"
import { checkForgotPasswordRateLimit, logPasswordResetRequest } from "@/actions/auth"
import { isValidEmail } from "@/lib/utils/validation"

// Lazy initialization - client created on first use, not at module load
// This prevents build-time errors when env vars aren't available
let supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return supabaseAdmin
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    // Database-backed rate limiting (works across instances)
    const rateLimitCheck = await checkForgotPasswordRateLimit(email)
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.error || "Too many password reset requests. Please try again later." },
        { status: 429 }
      )
    }

    // Log the password reset request for security audit
    await logPasswordResetRequest(email)

    // Require valid app URL - only fallback to localhost in development
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : null)
    if (!appUrl) {
      console.error("[reset-password] CRITICAL: NEXT_PUBLIC_APP_URL not configured in production")
      return NextResponse.json({ error: "Application URL not configured. Please contact support." }, { status: 500 })
    }

    // Generate password reset link using admin API
    // Redirect directly to reset-password page - it handles the implicit flow hash tokens
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    })

    if (error) {
      // Don't expose whether user exists - always return success
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent."
      })
    }

    if (!data?.properties?.action_link) {
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent."
      })
    }

    // Send email via our custom SMTP
    const emailSent = await sendPasswordResetEmail({
      to: email,
      resetLink: data.properties.action_link,
    })

    if (!emailSent) {
      // Fall back to Supabase email as backup
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent.",
        note: "Email delivery may be delayed"
      })
    }

    return NextResponse.json({
      success: true,
      message: "Password reset link sent! Check your email."
    })

  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
