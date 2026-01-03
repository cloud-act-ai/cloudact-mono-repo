import { NextRequest, NextResponse } from "next/server"
import { sendDemoRequestEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Rate limiting - simple in-memory store
const rateLimit = new Map<string, { count: number; timestamp: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 3 // max 3 demo requests per minute

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

interface DemoFormData {
  firstName: string
  lastName: string
  email: string
  company: string
  companySize?: string
  role?: string
  interests?: string[]
  message?: string
}

const VALID_COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
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
    let body: DemoFormData
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const { firstName, lastName, email, company, companySize, role, interests, message } = body

    // Validation
    const errors: Record<string, string> = {}

    if (!firstName?.trim()) errors.firstName = "First name is required"
    if (!lastName?.trim()) errors.lastName = "Last name is required"
    if (!email?.trim()) {
      errors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      errors.email = "Please enter a valid work email"
    }
    if (!company?.trim()) errors.company = "Company is required"

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    // Validate company size if provided
    const validCompanySize = companySize && VALID_COMPANY_SIZES.includes(companySize)
      ? companySize
      : undefined

    // Send email using standard template
    console.log("[Demo API] Attempting to send demo request email...")
    console.log(`[Demo API] From: ${firstName} ${lastName} <${email}>`)
    console.log(`[Demo API] Company: ${company}`)

    const emailSent = await sendDemoRequestEmail({
      firstName,
      lastName,
      email,
      company,
      companySize: validCompanySize,
      role,
      interests,
      message,
    })

    console.log(`[Demo API] Email send result: ${emailSent ? "SUCCESS" : "FAILED"}`)

    if (!emailSent) {
      console.error("[Demo API] Failed to send email notification")
    }

    return NextResponse.json({
      success: true,
      message: "Thank you! We'll contact you within 24 hours to schedule your demo.",
    })
  } catch (error) {
    console.error("[Demo API] Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
