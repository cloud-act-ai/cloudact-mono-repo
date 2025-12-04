import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendPasswordResetEmail } from "@/lib/email"

// Use admin client to generate password reset link
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Generate password reset link using admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    })

    if (error) {
      console.error("[v0] Password reset link generation failed:", error.message)
      // Don't expose whether user exists - always return success
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent."
      })
    }

    if (!data?.properties?.action_link) {
      console.error("[v0] No action link returned from Supabase")
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
      console.error("[v0] Failed to send password reset email via SMTP")
      // Fall back to Supabase email as backup
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link will be sent.",
        note: "Email delivery may be delayed"
      })
    }

    console.log("[v0] Password reset email sent to:", email)
    return NextResponse.json({
      success: true,
      message: "Password reset link sent! Check your email."
    })

  } catch (error: any) {
    console.error("[v0] Password reset error:", error.message)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
