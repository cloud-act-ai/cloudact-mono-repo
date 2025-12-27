import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendPasswordResetEmail } from "@/lib/email"

// Use admin client to generate password reset link
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Simple rate limiting for password reset (per IP)
const resetRateLimits = new Map<string, { count: number; resetAt: number }>()
const MAX_RESETS_PER_HOUR = 5

function checkResetRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = resetRateLimits.get(ip)

  if (!record || now > record.resetAt) {
    resetRateLimits.set(ip, { count: 1, resetAt: now + 3600000 }) // 1 hour
    return true
  }

  if (record.count >= MAX_RESETS_PER_HOUR) {
    return false
  }

  record.count++
  return true
}

// Email validation
const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"
    if (!checkResetRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later." },
        { status: 429 }
      )
    }

    const { email } = await request.json()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
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
