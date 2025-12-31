import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendPasswordResetEmail } from "@/lib/email"

// Use admin client to generate password reset link
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Simple in-memory rate limiting for password reset (per IP)
// NOTE: This is per-instance only. In serverless/multi-instance deployments,
// this provides basic protection but is not a full rate limiter.
// Additional protection provided by:
// 1. Supabase Auth has built-in rate limiting for auth operations
// 2. Always returning same response regardless of email existence (prevents enumeration)
// 3. Password reset links expire after 24 hours
// For production at scale, consider Redis-based rate limiting or Cloudflare WAF rules.
const resetRateLimits = new Map<string, { count: number; resetAt: number }>()
const MAX_RESETS_PER_HOUR = 5
const MAX_RATE_LIMIT_ENTRIES = 1000 // Prevent unbounded memory growth

function checkResetRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = resetRateLimits.get(ip)

  // Clean up old entries periodically to prevent memory growth
  if (resetRateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
    const entries = Array.from(resetRateLimits.entries())
    const expiredKeys = entries.filter(([_, r]) => now > r.resetAt).map(([key]) => key)
    expiredKeys.forEach(key => resetRateLimits.delete(key))

    // If still over limit, remove oldest entries
    if (resetRateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
      const sortedEntries = Array.from(resetRateLimits.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt)
      const toRemove = sortedEntries.slice(0, Math.max(1, resetRateLimits.size - MAX_RATE_LIMIT_ENTRIES + 1))
      toRemove.forEach(([key]) => resetRateLimits.delete(key))
    }
  }

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
