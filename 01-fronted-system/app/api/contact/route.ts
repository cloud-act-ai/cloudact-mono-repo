import { NextRequest, NextResponse } from "next/server"
import { sendContactFormEmail } from "@/lib/email"

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

interface ContactFormData {
  firstName: string
  lastName: string
  email: string
  company?: string
  inquiryType: string
  message: string
}

const VALID_INQUIRY_TYPES = [
  "general",
  "sales",
  "demo",
  "bug",
  "support",
  "partnership",
  "investment",
  "feature",
  "press",
  "careers",
  "other",
]

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
    let body: ContactFormData
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const { firstName, lastName, email, company, inquiryType, message } = body

    // Validation
    const errors: Record<string, string> = {}

    if (!firstName?.trim()) errors.firstName = "First name is required"
    if (!lastName?.trim()) errors.lastName = "Last name is required"
    if (!email?.trim()) {
      errors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      errors.email = "Please enter a valid email"
    }
    if (!inquiryType || !VALID_INQUIRY_TYPES.includes(inquiryType)) {
      errors.inquiryType = "Please select a valid inquiry type"
    }
    if (!message?.trim()) errors.message = "Message is required"
    if (message && message.length > 5000) errors.message = "Message is too long (max 5000 characters)"

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    // Send email using standard template
    console.log("[Contact API] Attempting to send contact form email...")
    console.log(`[Contact API] From: ${firstName} ${lastName} <${email}>`)
    console.log(`[Contact API] Inquiry Type: ${inquiryType}`)

    const emailSent = await sendContactFormEmail({
      firstName,
      lastName,
      email,
      company,
      inquiryType,
      message,
    })

    console.log(`[Contact API] Email send result: ${emailSent ? "SUCCESS" : "FAILED"}`)

    if (!emailSent) {
      // Log for monitoring but still return success to user
      console.error("[Contact API] Failed to send email notification - check SMTP configuration")
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for your message. We'll get back to you within 24 hours.",
    })
  } catch (error) {
    console.error("[Contact API] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
