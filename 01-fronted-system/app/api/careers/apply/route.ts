import { NextRequest, NextResponse } from "next/server"
import { sendJobApplicationEmail, sendApplicationConfirmationEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Rate limiting - simple in-memory store
const rateLimit = new Map<string, { count: number; timestamp: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 3 // max 3 applications per minute

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

interface CareerApplicationData {
  firstName: string
  lastName: string
  email: string
  phone?: string
  position: string
  linkedin?: string
  github?: string
  portfolio?: string
  coverLetter?: string
  resumeFileName?: string
}

const VALID_POSITIONS = [
  "Senior Backend Engineer",
  "Senior Frontend Engineer",
  "Product Manager",
  "Solutions Engineer",
  "General Application",
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
    let body: CareerApplicationData
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      position,
      linkedin,
      github,
      portfolio,
      coverLetter,
      resumeFileName,
    } = body

    // Validation
    const errors: Record<string, string> = {}

    if (!firstName?.trim()) errors.firstName = "First name is required"
    if (!lastName?.trim()) errors.lastName = "Last name is required"
    if (!email?.trim()) {
      errors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      errors.email = "Please enter a valid email"
    }
    if (!position || !VALID_POSITIONS.includes(position)) {
      errors.position = "Please select a valid position"
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    // Validate URL formats if provided
    const urlPattern = /^https?:\/\/.+/i
    if (linkedin && !urlPattern.test(linkedin)) {
      errors.linkedin = "Please enter a valid LinkedIn URL"
    }
    if (github && !urlPattern.test(github)) {
      errors.github = "Please enter a valid GitHub URL"
    }
    if (portfolio && !urlPattern.test(portfolio)) {
      errors.portfolio = "Please enter a valid portfolio URL"
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    // Send email to HR/careers using standard template
    console.log("[Careers API] Attempting to send job application email...")
    console.log(`[Careers API] From: ${firstName} ${lastName} <${email}>`)
    console.log(`[Careers API] Position: ${position}`)

    const emailSent = await sendJobApplicationEmail({
      firstName,
      lastName,
      email,
      phone,
      position,
      linkedin,
      github,
      portfolio,
      resumeFileName,
      coverLetter,
    })

    console.log(`[Careers API] Application email result: ${emailSent ? "SUCCESS" : "FAILED"}`)

    if (!emailSent) {
      console.error("[Careers API] Failed to send email notification")
    }

    // Send confirmation to applicant
    const confirmationSent = await sendApplicationConfirmationEmail({
      to: email,
      firstName,
      position,
    })

    console.log(`[Careers API] Confirmation email result: ${confirmationSent ? "SUCCESS" : "FAILED"}`)

    if (!confirmationSent) {
      console.error("[Careers API] Failed to send confirmation email")
    }

    return NextResponse.json({
      success: true,
      message: "Application submitted successfully! Check your email for confirmation.",
    })
  } catch (error) {
    console.error("[Careers API] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
