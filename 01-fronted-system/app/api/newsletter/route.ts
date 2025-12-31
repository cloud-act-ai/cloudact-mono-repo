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

    // Escape user input
    const safeEmail = escapeHtml(email.trim().toLowerCase())
    const safeSource = source ? escapeHtml(source) : "Website"

    // Send notification to marketing team
    const notificationHtml = `
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
                <span style="color: #000000; font-size: 24px; font-weight: bold;">📬</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">New Newsletter Subscriber</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Email</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">
                  <a href="mailto:${safeEmail}" style="color: #18181b;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Source</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${safeSource}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Subscribed At</p>
                <p style="margin: 0; font-size: 16px; color: #18181b;">${new Date().toISOString()}</p>
              </div>

              <div style="padding: 16px; background-color: #ecfdf5; border-radius: 8px; border-left: 4px solid #90FCA6;">
                <p style="margin: 0; font-size: 14px; color: #065f46;">
                  <strong>Action:</strong> Add to newsletter list in your email marketing platform.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                CloudAct.AI Newsletter Subscription
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
New Newsletter Subscriber

Email: ${email}
Source: ${source || "Website"}
Subscribed At: ${new Date().toISOString()}

Action: Add to newsletter list in your email marketing platform.
    `.trim()

    // Send notification to marketing
    const notificationSent = await sendEmail({
      to: "marketing@cloudact.ai",
      subject: `[Newsletter] New Subscriber: ${email}`,
      html: notificationHtml,
      text: textContent,
    })

    if (!notificationSent) {
      console.error("[Newsletter API] Failed to send notification")
    }

    // Send welcome email to subscriber
    const welcomeHtml = `
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
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Welcome to CloudAct.ai!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Thanks for subscribing to our newsletter! You'll receive weekly insights on:
              </p>

              <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #3f3f46;">
                <li>Cloud cost optimization strategies</li>
                <li>GenAI spending best practices</li>
                <li>FinOps industry trends</li>
                <li>Product updates and new features</li>
              </ul>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="https://cloudact.ai/resources" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Explore Our Resources
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; font-size: 14px; color: #71717a;">
                You can unsubscribe at any time by clicking the link at the bottom of any email.
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

    const welcomeSent = await sendEmail({
      to: email,
      subject: "Welcome to CloudAct.ai Newsletter!",
      html: welcomeHtml,
      text: "Thanks for subscribing to the CloudAct.ai newsletter! You'll receive weekly insights on cloud cost optimization, GenAI spending, and FinOps best practices.",
    })

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
