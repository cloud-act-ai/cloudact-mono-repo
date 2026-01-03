import { NextRequest, NextResponse } from "next/server"
import { sendNewsletterNotificationEmail, sendNewsletterWelcomeEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Rate limiting - simple in-memory store
const rateLimit = new Map<string, { count: number; timestamp: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 5 // max 5 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimit.get(ip)

  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { count: 1, timestamp: now })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false
  }

  record.count++
  return true
}

interface NewsletterFormData {
  email: string
  source?: string
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") ||
               request.headers.get("x-real-ip") ||
               "unknown"

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      )
    }

    // Parse and validate body
    let body: NewsletterFormData
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const { email, source } = body

    // Validation
    if (!email?.trim()) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Send notification to marketing team using standard template
    console.log("[Newsletter API] Attempting to send notification email...")
    console.log(`[Newsletter API] New subscriber: ${normalizedEmail}`)

    const notificationSent = await sendNewsletterNotificationEmail({
      email: normalizedEmail,
      source,
    })

    console.log(`[Newsletter API] Notification email result: ${notificationSent ? "SUCCESS" : "FAILED"}`)

    if (!notificationSent) {
      console.error("[Newsletter API] Failed to send notification")
    }

    // Send welcome email to subscriber
    const welcomeSent = await sendNewsletterWelcomeEmail({
      to: normalizedEmail,
    })

    console.log(`[Newsletter API] Welcome email result: ${welcomeSent ? "SUCCESS" : "FAILED"}`)

    if (!welcomeSent) {
      console.error("[Newsletter API] Failed to send welcome email")
    }

    return NextResponse.json({
      success: true,
      message: "You're subscribed! Check your inbox for a welcome email.",
    })
  } catch (error) {
    console.error("[Newsletter API] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
