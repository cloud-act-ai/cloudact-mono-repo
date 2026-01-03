import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

// HTML escape function to prevent XSS in email templates
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Lazy transporter initialization - created on first use to ensure env vars are loaded
let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!_transporter) {
    console.log("[Email] Creating SMTP transporter...")
    console.log(`[Email] SMTP_HOST: ${process.env.SMTP_HOST || "smtp.gmail.com"}`)
    console.log(`[Email] SMTP_PORT: ${process.env.SMTP_PORT || "587"}`)
    console.log(`[Email] SMTP_USERNAME: ${process.env.SMTP_USERNAME ? "SET" : "NOT SET"}`)
    console.log(`[Email] SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? "SET" : "NOT SET"}`)

    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  }
  return _transporter
}

function getFromEmail(): string {
  return process.env.FROM_EMAIL || "support@cloudact.ai"
}

function getFromName(): string {
  return process.env.FROM_NAME || "CloudAct.ai"
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  console.log(`[Email] sendEmail called - to: ${to}, subject: ${subject}`)

  if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    console.error("[Email] SMTP not configured: Missing SMTP_USERNAME or SMTP_PASSWORD environment variables")
    return false
  }

  try {
    // Get transporter lazily to ensure env vars are loaded
    const transporter = getTransporter()
    const fromEmail = getFromEmail()
    const fromName = getFromName()

    console.log(`[Email] Sending from: "${fromName}" <${fromEmail}>`)
    console.log(`[Email] Attempting to send via SMTP...`)

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text: text || subject,
    })
    console.log(`[Email] ✅ Sent successfully to ${to}`)
    console.log(`[Email] MessageId: ${info.messageId}`)
    console.log(`[Email] Response: ${info.response}`)
    console.log(`[Email] Accepted: ${JSON.stringify(info.accepted)}`)
    console.log(`[Email] Rejected: ${JSON.stringify(info.rejected)}`)
    return true
  } catch (emailError) {
    console.error("[Email] ❌ Failed to send email to", to)
    console.error("[Email] Error:", emailError instanceof Error ? emailError.message : emailError)
    if (emailError instanceof Error && emailError.stack) {
      console.error("[Email] Stack:", emailError.stack)
    }
    return false
  }
}

// =============================================
// BRAND COLORS - CloudAct Design System
// =============================================
const BRAND = {
  mint: "#90FCA6",           // Primary buttons, success states
  mintDark: "#1a7a3a",       // Dark green for text on mint
  obsidian: "#0a0a0b",       // Icon backgrounds, premium dark
  coral: "#FF6C5E",          // Warnings, destructive actions
  black: "#000000",          // Text on mint buttons
  white: "#ffffff",          // Text on dark buttons
  gray: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    400: "#a1a1aa",
    500: "#71717a",
    600: "#52525b",
    700: "#3f3f46",
    900: "#18181b",
  },
  success: "#10b981",        // Green for confirmations
  warning: "#f59e0b",        // Amber for warnings
  error: "#ef4444",          // Red for errors
  siteUrl: "https://cloudact.ai",
} as const

// =============================================
// BASE EMAIL LAYOUT - Single Brand Template
// =============================================
interface BaseEmailLayoutOptions {
  title: string
  content: string      // Main email body HTML
  ctaText?: string     // Call-to-action button text
  ctaLink?: string     // Call-to-action button link
  ctaStyle?: "mint" | "dark" | "coral"  // Button style (default: mint)
}

function baseEmailLayout({
  title,
  content,
  ctaText,
  ctaLink,
  ctaStyle = "mint",
}: BaseEmailLayoutOptions): string {
  // Button styles based on brand
  const buttonStyles = {
    mint: `background-color: ${BRAND.mint}; color: ${BRAND.black};`,
    dark: `background-color: ${BRAND.obsidian}; color: ${BRAND.white};`,
    coral: `background-color: ${BRAND.coral}; color: ${BRAND.white};`,
  }

  const ctaButton = ctaText && ctaLink ? `
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaLink}" style="display: inline-block; padding: 14px 32px; ${buttonStyles[ctaStyle]} text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>` : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${BRAND.gray[100]};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: ${BRAND.white}; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Text Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid ${BRAND.gray[200]};">
              <a href="${BRAND.siteUrl}" style="text-decoration: none;">
                <span style="display: inline-block; font-size: 24px; font-weight: 700; color: ${BRAND.gray[900]}; letter-spacing: -0.5px;">
                  Cloud<span style="color: ${BRAND.mintDark};">Act</span>.AI
                </span>
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: ${BRAND.gray[900]}; line-height: 1.3;">${title}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              ${content}
              ${ctaButton}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: ${BRAND.gray[50]}; border-top: 1px solid ${BRAND.gray[200]}; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[700]}; font-weight: 600;">
                      CloudAct.AI
                    </p>
                    <p style="margin: 0 0 12px 0; font-size: 12px; color: ${BRAND.gray[500]};">
                      Enterprise Cloud Cost Management
                    </p>
                    <p style="margin: 0; font-size: 12px; color: ${BRAND.gray[400]};">
                      <a href="${BRAND.siteUrl}" style="color: ${BRAND.mintDark}; text-decoration: none;">cloudact.ai</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Unsubscribe / Legal Footer -->
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td align="center">
              <p style="margin: 0; font-size: 11px; color: ${BRAND.gray[400]}; line-height: 1.5;">
                This email was sent by CloudAct.AI<br>
                © ${new Date().getFullYear()} CloudAct Inc. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// =============================================
// INVITE EMAIL
// =============================================
export async function sendInviteEmail({
  to,
  inviterName,
  orgName,
  role,
  inviteLink,
}: {
  to: string
  inviterName: string
  orgName: string
  role: string
  inviteLink: string
}): Promise<boolean> {
  const roleDisplay = role === "read_only" ? "Read Only" : role.charAt(0).toUpperCase() + role.slice(1)
  const safeInviterName = escapeHtml(inviterName)
  const safeOrgName = escapeHtml(orgName)
  const safeRoleDisplay = escapeHtml(roleDisplay)
  const safeInviteLink = encodeURI(inviteLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on CloudAct.AI.
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: ${BRAND.gray[100]}; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Your role:</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND.gray[900]};">${safeRoleDisplay}</p>
              </div>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                This invitation expires in 48 hours. If you didn't expect this invitation, you can safely ignore this email.
              </p>`

  const html = baseEmailLayout({
    title: "You're Invited!",
    content,
    ctaText: "Accept Invitation",
    ctaLink: safeInviteLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `You're invited to join ${safeOrgName} on CloudAct.AI`,
    html,
    text: `${inviterName} has invited you to join ${orgName} on CloudAct.AI as ${roleDisplay}. Accept your invitation: ${inviteLink}`,
  })
}

// =============================================
// PASSWORD RESET EMAIL
// =============================================
export async function sendPasswordResetEmail({
  to,
  resetLink,
}: {
  to: string
  resetLink: string
}): Promise<boolean> {
  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                We received a request to reset your password for your CloudAct.AI account.
              </p>
              <div style="margin: 30px 0 0 0; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid ${BRAND.warning};">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Security Notice:</strong> If you didn't request this, please ignore this email. Your password won't be changed.
                </p>
              </div>
              <p style="margin: 20px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                This link expires in 24 hours.
              </p>`

  const html = baseEmailLayout({
    title: "Reset Your Password",
    content,
    ctaText: "Reset Password",
    ctaLink: resetLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: "Reset Your Password - CloudAct.AI",
    html,
    text: `Reset your CloudAct.AI password: ${resetLink}`,
  })
}

// =============================================
// TRIAL ENDING EMAIL
// =============================================
export async function sendTrialEndingEmail({
  to,
  orgName,
  trialEndsAt,
  billingLink,
}: {
  to: string
  orgName: string
  trialEndsAt: Date
  billingLink: string
}): Promise<boolean> {
  const safeOrgName = escapeHtml(orgName)
  const safeBillingLink = escapeHtml(billingLink)
  const daysRemaining = Math.max(0, Math.floor((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const formattedDate = trialEndsAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Your free trial for <strong>${safeOrgName}</strong> on CloudAct.AI will end in <strong>${daysRemaining} days</strong> (${formattedDate}).
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid ${BRAND.warning};">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  To avoid any interruption to your service, please add a payment method before your trial ends.
                </p>
              </div>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                If you have any questions about our plans, feel free to reach out to our support team.
              </p>`

  const html = baseEmailLayout({
    title: "Your Trial is Ending Soon",
    content,
    ctaText: "Subscribe Now",
    ctaLink: safeBillingLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Your CloudAct.AI trial ends in ${daysRemaining} days`,
    html,
    text: `Your free trial for ${orgName} on CloudAct.AI will end in ${daysRemaining} days (${formattedDate}). Subscribe now to avoid service interruption: ${billingLink}`,
  })
}

// =============================================
// PAYMENT FAILED EMAIL
// =============================================
export async function sendPaymentFailedEmail({
  to,
  orgName,
  billingLink,
}: {
  to: string
  orgName: string
  billingLink: string
}): Promise<boolean> {
  const safeOrgName = escapeHtml(orgName)
  const safeBillingLink = escapeHtml(billingLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                We were unable to process your payment for <strong>${safeOrgName}</strong> on CloudAct.AI.
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: rgba(239, 68, 68, 0.1); border-radius: 8px; border-left: 4px solid ${BRAND.error};">
                <p style="margin: 0; font-size: 14px; color: #991b1b;">
                  <strong>Action Required:</strong> Please update your payment method to avoid service interruption.
                </p>
              </div>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                If you believe this is an error, please contact your bank or our support team for assistance.
              </p>`

  const html = baseEmailLayout({
    title: "Payment Failed",
    content,
    ctaText: "Update Payment Method",
    ctaLink: safeBillingLink,
    ctaStyle: "coral",
  })

  return sendEmail({
    to,
    subject: `Action Required: Payment failed for ${safeOrgName}`,
    html,
    text: `We were unable to process your payment for ${orgName} on CloudAct.AI. Please update your payment method to avoid service interruption: ${billingLink}`,
  })
}

// =============================================
// WELCOME EMAIL
// =============================================
export async function sendWelcomeEmail({
  to,
  name,
  orgName,
  dashboardLink,
}: {
  to: string
  name: string
  orgName: string
  dashboardLink: string
}): Promise<boolean> {
  const safeName = escapeHtml(name)
  const safeOrgName = escapeHtml(orgName)
  const safeDashboardLink = escapeHtml(dashboardLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Hi ${safeName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Welcome to <strong>${safeOrgName}</strong>! Your account is all set up and ready to go.
              </p>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                Need help getting started? Check out our documentation or contact support.
              </p>`

  const html = baseEmailLayout({
    title: "Welcome to CloudAct.AI!",
    content,
    ctaText: "Go to Dashboard",
    ctaLink: safeDashboardLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Welcome to ${safeOrgName} on CloudAct.AI!`,
    html,
    text: `Welcome to ${orgName} on CloudAct.AI! Go to your dashboard: ${dashboardLink}`,
  })
}

// =============================================
// SUBSCRIPTION CONFIRMED EMAIL
// =============================================
export async function sendSubscriptionConfirmedEmail({
  to,
  name,
  orgName,
  planName,
  dashboardLink,
}: {
  to: string
  name: string
  orgName: string
  planName: string
  dashboardLink: string
}): Promise<boolean> {
  const safeName = escapeHtml(name)
  const safeOrgName = escapeHtml(orgName)
  const safePlanName = escapeHtml(planName)
  const safeDashboardLink = escapeHtml(dashboardLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Hi ${safeName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Thank you for subscribing to <strong>${safeOrgName}</strong> on CloudAct.AI!
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: rgba(144, 252, 166, 0.15); border-radius: 8px; border-left: 4px solid ${BRAND.mint};">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #047857;">Your plan:</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND.gray[900]};">${safePlanName}</p>
              </div>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                You now have full access to all features. If you have any questions, our support team is here to help.
              </p>`

  const html = baseEmailLayout({
    title: "Subscription Confirmed!",
    content,
    ctaText: "Go to Dashboard",
    ctaLink: safeDashboardLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Subscription confirmed for ${safeOrgName} - CloudAct.AI`,
    html,
    text: `Thank you for subscribing to ${orgName} on CloudAct.AI! Your plan: ${planName}. Go to your dashboard: ${dashboardLink}`,
  })
}
