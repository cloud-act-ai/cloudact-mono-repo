import { NextRequest, NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// HTML escape function to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

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

    // Escape user input for email
    const safeFirstName = escapeHtml(firstName.trim())
    const safeLastName = escapeHtml(lastName.trim())
    const safeEmail = escapeHtml(email.trim())
    const safeCompany = company ? escapeHtml(company.trim()) : "Not provided"
    const safeInquiryType = escapeHtml(inquiryType)
    const safeMessage = escapeHtml(message.trim())

    // Build email
    const inquiryLabel = VALID_INQUIRY_TYPES.find(t => t === inquiryType)
      ? inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1).replace(/_/g, " ")
      : inquiryType

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #90FCA6; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #000000; font-size: 24px; font-weight: bold;">📧</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">New Contact Form Submission</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="margin-bottom: 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Inquiry Type</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${inquiryLabel}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">From</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: #18181b;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Company</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${safeCompany}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Message</p>
                <div style="padding: 16px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid #90FCA6;">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #3f3f46; white-space: pre-wrap;">${safeMessage}</p>
                </div>
              </div>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="mailto:${safeEmail}?subject=Re: ${encodeURIComponent(inquiryLabel + " Inquiry - CloudAct.ai")}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reply to ${safeFirstName}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                CloudAct.AI Contact Form Submission
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const textContent = `
New Contact Form Submission

Inquiry Type: ${inquiryLabel}

From: ${firstName} ${lastName}
Email: ${email}
Company: ${company || "Not provided"}

Message:
${message}

---
Reply to: ${email}
    `.trim()

    // Send email to support
    console.log("[Contact API] Attempting to send contact form email...")
    console.log(`[Contact API] From: ${firstName} ${lastName} <${email}>`)
    console.log(`[Contact API] Inquiry Type: ${inquiryLabel}`)

    const emailSent = await sendEmail({
      to: "support@cloudact.ai",
      subject: `[Contact Form] ${inquiryLabel}: ${firstName} ${lastName}`,
      html,
      text: textContent,
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
