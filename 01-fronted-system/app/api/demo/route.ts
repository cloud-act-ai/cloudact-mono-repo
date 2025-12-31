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

    // Escape user input for email
    const safeFirstName = escapeHtml(firstName.trim())
    const safeLastName = escapeHtml(lastName.trim())
    const safeEmail = escapeHtml(email.trim())
    const safeCompany = escapeHtml(company.trim())
    const safeCompanySize = companySize && VALID_COMPANY_SIZES.includes(companySize)
      ? escapeHtml(companySize)
      : "Not specified"
    const safeRole = role ? escapeHtml(role.trim()) : "Not specified"
    const safeInterests = interests && Array.isArray(interests)
      ? interests.map(i => escapeHtml(String(i))).join(", ")
      : "Not specified"
    const safeMessage = message ? escapeHtml(message.trim()) : "No additional message"

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
                <span style="color: #000000; font-size: 24px; font-weight: bold;">🎬</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">New Demo Request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="margin-bottom: 24px; padding: 16px; background-color: #ecfdf5; border-radius: 8px; border-left: 4px solid #90FCA6;">
                <p style="margin: 0; font-size: 14px; color: #065f46;">
                  <strong>High Priority Lead</strong> - Schedule demo within 24 hours
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Contact</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: #18181b;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Company</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">
                  <strong>${safeCompany}</strong><br />
                  Size: ${safeCompanySize}
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Role</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${safeRole}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Areas of Interest</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${safeInterests}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Additional Notes</p>
                <div style="padding: 16px; background-color: #fafafa; border-radius: 8px;">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #3f3f46; white-space: pre-wrap;">${safeMessage}</p>
                </div>
              </div>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="mailto:${safeEmail}?subject=Your CloudAct.ai Demo - Let's Schedule!" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Schedule Demo with ${safeFirstName}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                CloudAct.AI Demo Request
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
New Demo Request - HIGH PRIORITY

Contact: ${firstName} ${lastName}
Email: ${email}
Company: ${company}
Company Size: ${companySize || "Not specified"}
Role: ${role || "Not specified"}
Areas of Interest: ${interests?.join(", ") || "Not specified"}

Additional Notes:
${message || "No additional message"}

---
Action: Schedule demo within 24 hours
Reply to: ${email}
    `.trim()

    // Send email to sales
    const emailSent = await sendEmail({
      to: "sales@cloudact.ai",
      subject: `[Demo Request] ${company} - ${firstName} ${lastName}`,
      html,
      text: textContent,
    })

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
