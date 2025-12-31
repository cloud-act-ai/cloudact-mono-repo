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

    // Escape user input for email
    const safeFirstName = escapeHtml(firstName.trim())
    const safeLastName = escapeHtml(lastName.trim())
    const safeEmail = escapeHtml(email.trim())
    const safePhone = phone ? escapeHtml(phone.trim()) : "Not provided"
    const safePosition = escapeHtml(position)
    const safeLinkedin = linkedin ? escapeHtml(linkedin.trim()) : null
    const safeGithub = github ? escapeHtml(github.trim()) : null
    const safePortfolio = portfolio ? escapeHtml(portfolio.trim()) : null
    const safeCoverLetter = coverLetter ? escapeHtml(coverLetter.trim()) : "Not provided"
    const safeResumeFileName = resumeFileName ? escapeHtml(resumeFileName) : "Not attached"

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
                <span style="color: #000000; font-size: 24px; font-weight: bold;">💼</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">New Job Application</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="margin-bottom: 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Position</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${safePosition}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Candidate</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: #18181b;">${safeEmail}</a><br />
                  ${safePhone}
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Online Profiles</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">
                  ${safeLinkedin ? `LinkedIn: <a href="${safeLinkedin}" style="color: #18181b;">${safeLinkedin}</a><br />` : ""}
                  ${safeGithub ? `GitHub: <a href="${safeGithub}" style="color: #18181b;">${safeGithub}</a><br />` : ""}
                  ${safePortfolio ? `Portfolio: <a href="${safePortfolio}" style="color: #18181b;">${safePortfolio}</a><br />` : ""}
                  ${!safeLinkedin && !safeGithub && !safePortfolio ? "Not provided" : ""}
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Resume</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${safeResumeFileName}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Cover Letter</p>
                <div style="padding: 16px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid #90FCA6;">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #3f3f46; white-space: pre-wrap;">${safeCoverLetter}</p>
                </div>
              </div>

              <div style="margin-bottom: 24px; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Note:</strong> The candidate may send their resume as a follow-up email. Request it if not attached.
                </p>
              </div>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="mailto:${safeEmail}?subject=Your Application for ${encodeURIComponent(position)} at CloudAct.ai" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
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
                CloudAct.AI Job Application
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
New Job Application

Position: ${position}

CANDIDATE INFORMATION
---------------------
Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone || "Not provided"}

ONLINE PROFILES
---------------
LinkedIn: ${linkedin || "Not provided"}
GitHub: ${github || "Not provided"}
Portfolio: ${portfolio || "Not provided"}

RESUME
------
${resumeFileName || "Not attached - candidate may send as follow-up email"}

COVER LETTER
------------
${coverLetter || "Not provided"}

---
Reply to: ${email}
    `.trim()

    // Send email to HR/careers
    const emailSent = await sendEmail({
      to: "careers@cloudact.ai",
      subject: `[Application] ${position}: ${firstName} ${lastName}`,
      html,
      text: textContent,
    })

    if (!emailSent) {
      console.error("[Careers API] Failed to send email notification")
    }

    // Send confirmation to applicant
    const confirmationHtml = `
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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #18181b; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">C</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Application Received!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Hi ${safeFirstName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Thank you for applying for the <strong>${safePosition}</strong> position at CloudAct.ai! We've received your application and our hiring team will review it carefully.
              </p>

              <div style="margin: 0 0 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">What's next?</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #3f3f46;">
                  <li>We'll review your application within 48 hours</li>
                  <li>If there's a good fit, we'll reach out to schedule an interview</li>
                  <li>Either way, you'll hear back from us</li>
                </ul>
              </div>

              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                In the meantime, feel free to explore our <a href="https://cloudact.ai/about" style="color: #18181b;">company culture</a> and <a href="https://cloudact.ai/resources" style="color: #18181b;">latest updates</a>.
              </p>

              <p style="margin: 0; font-size: 14px; color: #71717a;">
                If you have any questions, don't hesitate to reach out to us at <a href="mailto:careers@cloudact.ai" style="color: #18181b;">careers@cloudact.ai</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                CloudAct.AI - Enterprise Cloud Cost Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const confirmationSent = await sendEmail({
      to: email,
      subject: `Application Received: ${position} at CloudAct.ai`,
      html: confirmationHtml,
      text: `Hi ${firstName}, Thank you for applying for the ${position} position at CloudAct.ai! We've received your application and our hiring team will review it within 48 hours. You'll hear back from us either way.`,
    })

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
