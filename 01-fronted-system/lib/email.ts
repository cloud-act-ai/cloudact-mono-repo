import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { site } from "./site"

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
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com"
    const smtpPort = Number(process.env.SMTP_PORT) || 587
    // Port 465 uses implicit TLS (secure=true), port 587 uses STARTTLS (secure=false)
    const useImplicitTls = smtpPort === 465
    console.log("[Email] Creating SMTP transporter...")
    console.log(`[Email] SMTP_HOST: ${smtpHost}`)
    console.log(`[Email] SMTP_PORT: ${smtpPort}`)
    console.log(`[Email] SMTP_USERNAME: ${process.env.SMTP_USERNAME ? "SET" : "NOT SET"}`)
    console.log(`[Email] SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? "SET" : "NOT SET"}`)

    _transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: useImplicitTls,
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
  return process.env.FROM_NAME || site.name
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string           // Reply-To address (defaults to support@cloudact.ai)
  category?: "transactional" | "notification" | "marketing"  // Email category for tracking
  preheader?: string         // Preview text shown in email clients
}

// Generate RFC 2822 compliant Message-ID
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 15)
  const domain = process.env.EMAIL_DOMAIN || "cloudact.ai"
  return `<${timestamp}.${random}@${domain}>`
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  category = "transactional",
  preheader
}: SendEmailOptions): Promise<boolean> {
  console.log(`[Email] sendEmail called - to: ${to}, subject: ${subject}, category: ${category}`)

  if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    console.error("[Email] SMTP not configured: Missing SMTP_USERNAME or SMTP_PASSWORD environment variables")
    return false
  }

  try {
    // Get transporter lazily to ensure env vars are loaded
    const transporter = getTransporter()
    const fromEmail = getFromEmail()
    const fromName = getFromName()
    const messageId = generateMessageId()
    const replyToAddress = replyTo || process.env.REPLY_TO_EMAIL || "support@cloudact.ai"

    console.log(`[Email] Sending from: "${fromName}" <${fromEmail}>`)
    console.log(`[Email] Reply-To: ${replyToAddress}`)
    console.log(`[Email] Message-ID: ${messageId}`)
    console.log(`[Email] Attempting to send via SMTP...`)

    // Inject preheader into HTML if provided
    let finalHtml = html
    if (preheader) {
      // Add hidden preheader text at the start of body
      const preheaderHtml = `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}${"&nbsp;&zwnj;".repeat(50)}</div>`
      finalHtml = html.replace(/<body([^>]*)>/, `<body$1>${preheaderHtml}`)
    }

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      replyTo: replyToAddress,
      subject,
      html: finalHtml,
      text: text || subject,
      messageId,
      headers: {
        // Email authentication headers
        "X-Mailer": `${site.name}/1.0`,
        "X-Priority": "3", // Normal priority (1=high, 3=normal, 5=low)
        "X-Entity-Ref-ID": messageId.replace(/[<>]/g, ""), // Unique reference
        // List-Unsubscribe for marketing/notification emails only (NOT transactional)
        // Transactional emails (password reset, invite, payment) must NOT have unsubscribe
        ...(category === "marketing" && {
          "List-Unsubscribe": `<mailto:unsubscribe@${site.supportEmail?.split('@')[1] || 'cloudact.ai'}?subject=Unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }),
        // Precedence header
        "Precedence": category === "transactional" ? "transactional" : "bulk",
        // Auto-submitted for automated emails (helps with spam filters)
        "Auto-Submitted": "auto-generated",
        // Feedback-ID for Gmail postmaster tools (format: campaign:department:mailer:sender)
        "Feedback-ID": `${category}:cloudact:nodemailer:cloudact.ai`,
      },
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
  // Assets - logo with fallback text
  logoUrl: site.logo.png,
  siteUrl: site.url,
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
  <title>${title} - ${site.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${BRAND.gray[100]};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: ${BRAND.white}; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo (fallback to styled text) -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid ${BRAND.gray[200]};">
              <a href="${BRAND.siteUrl}" style="text-decoration: none; display: inline-block;">
                <!--[if mso]>
                <span style="font-size: 24px; font-weight: 700; color: ${BRAND.gray[900]};">${site.name}</span>
                <![endif]-->
                <!--[if !mso]><!-->
                <img src="${BRAND.logoUrl}" alt="${site.name}" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';" />
                <span style="display: none; font-size: 24px; font-weight: 700; color: ${BRAND.gray[900]}; letter-spacing: -0.5px;">
                  Cloud<span style="color: ${BRAND.mintDark};">Act</span>.AI
                </span>
                <!--<![endif]-->
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
                    <a href="${BRAND.siteUrl}" style="text-decoration: none;">
                      <img src="${BRAND.logoUrl}" alt="${site.name}" width="100" height="25" style="display: inline-block; max-width: 100px; height: auto; border: 0; margin-bottom: 8px;" />
                    </a>
                    <p style="margin: 0; font-size: 12px; color: ${BRAND.gray[500]};">
                      Enterprise GenAI, Cloud & Subscription Cost Management
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Legal Footer -->
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td align="center">
              <p style="margin: 0; font-size: 11px; color: ${BRAND.gray[400]}; line-height: 1.6;">
                This email was sent by ${site.name} • <a href="${BRAND.siteUrl}/privacy" style="color: ${BRAND.gray[500]}; text-decoration: none;">Privacy Policy</a> • <a href="${BRAND.siteUrl}/terms" style="color: ${BRAND.gray[500]}; text-decoration: none;">Terms of Service</a><br>
                © ${new Date().getFullYear()} ${site.company} All rights reserved.<br>
                ${site.company}, ${site.address}
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
                <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on ${site.name}.
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
    subject: `You're invited to join ${safeOrgName} on ${site.name}`,
    html,
    text: `${inviterName} has invited you to join ${orgName} on ${site.name} as ${roleDisplay}. Accept your invitation: ${inviteLink}`,
    category: "transactional",
    preheader: `${inviterName} invited you to join ${orgName} as ${roleDisplay}`,
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
                We received a request to reset your password for your ${site.name} account.
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
    ctaLink: encodeURI(resetLink),
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Reset Your Password - ${site.name}`,
    html,
    text: `Reset your ${site.name} password: ${resetLink}`,
    category: "transactional",
    preheader: "Click the link to reset your password. This link expires in 24 hours.",
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
  const safeBillingLink = encodeURI(billingLink)
  const daysRemaining = Math.max(0, Math.floor((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const formattedDate = trialEndsAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Your free trial for <strong>${safeOrgName}</strong> on ${site.name} will end in <strong>${daysRemaining} days</strong> (${formattedDate}).
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
    subject: `Your ${site.name} trial ends in ${daysRemaining} days`,
    html,
    text: `Your free trial for ${orgName} on ${site.name} will end in ${daysRemaining} days (${formattedDate}). Subscribe now to avoid service interruption: ${billingLink}`,
    category: "notification",
    preheader: `Your trial ends ${formattedDate}. Subscribe now to keep your access.`,
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
  const safeBillingLink = encodeURI(billingLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                We were unable to process your payment for <strong>${safeOrgName}</strong> on ${site.name}.
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
    text: `We were unable to process your payment for ${orgName} on ${site.name}. Please update your payment method to avoid service interruption: ${billingLink}`,
    category: "transactional",
    preheader: "Payment failed. Update your payment method to avoid service interruption.",
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
  const safeDashboardLink = encodeURI(dashboardLink)

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
    title: `Welcome to ${site.name}!`,
    content,
    ctaText: "Go to Dashboard",
    ctaLink: safeDashboardLink,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Welcome to ${safeOrgName} on ${site.name}!`,
    html,
    text: `Welcome to ${orgName} on ${site.name}! Go to your dashboard: ${dashboardLink}`,
    category: "transactional",
    preheader: `Your account for ${orgName} is ready. Start managing your cloud costs today.`,
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
  const safeDashboardLink = encodeURI(dashboardLink)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Hi ${safeName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Thank you for subscribing to <strong>${safeOrgName}</strong> on ${site.name}!
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
    subject: `Subscription confirmed for ${safeOrgName} - ${site.name}`,
    html,
    text: `Thank you for subscribing to ${orgName} on ${site.name}! Your plan: ${planName}. Go to your dashboard: ${dashboardLink}`,
    category: "transactional",
    preheader: `Your ${planName} subscription is now active. Welcome to CloudAct!`,
  })
}

// =============================================
// CONTACT FORM EMAIL (Internal notification)
// =============================================
export async function sendContactFormEmail({
  firstName,
  lastName,
  email,
  company,
  inquiryType,
  message,
}: {
  firstName: string
  lastName: string
  email: string
  company?: string
  inquiryType: string
  message: string
}): Promise<boolean> {
  const safeFirstName = escapeHtml(firstName.trim())
  const safeLastName = escapeHtml(lastName.trim())
  const safeEmail = escapeHtml(email.trim())
  const safeCompany = company ? escapeHtml(company.trim()) : "Not provided"
  const safeMessage = escapeHtml(message.trim())

  // Format inquiry type for display
  const inquiryLabel = inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1).replace(/_/g, " ")

  const content = `
              <div style="margin-bottom: 24px; padding: 20px; background-color: ${BRAND.gray[100]}; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Inquiry Type</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND.gray[900]};">${inquiryLabel}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">From</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: ${BRAND.mintDark}; text-decoration: none;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Company</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeCompany}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Message</p>
                <div style="padding: 16px; background-color: ${BRAND.gray[50]}; border-radius: 8px; border-left: 4px solid ${BRAND.mint};">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${BRAND.gray[700]}; white-space: pre-wrap;">${safeMessage}</p>
                </div>
              </div>`

  const html = baseEmailLayout({
    title: "New Contact Form Submission",
    content,
    ctaText: `Reply to ${safeFirstName}`,
    ctaLink: `mailto:${safeEmail}?subject=Re: ${encodeURIComponent(`${inquiryLabel} Inquiry - ${site.name}`)}`,
    ctaStyle: "dark",
  })

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

  return sendEmail({
    to: "support@cloudact.ai",
    subject: `[Contact Form] ${inquiryLabel}: ${firstName} ${lastName}`,
    html,
    text: textContent,
    replyTo: email, // Reply directly to the person who submitted
    category: "notification",
    preheader: `${inquiryLabel} inquiry from ${firstName} ${lastName} (${company || "No company"})`,
  })
}

// =============================================
// ACCOUNT DELETION EMAIL
// =============================================
export async function sendAccountDeletionEmail({
  to,
  deleteLink,
}: {
  to: string
  deleteLink: string
}): Promise<boolean> {
  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                You have requested to delete your ${site.name} account.
              </p>
              <div style="margin: 0 0 24px 0; padding: 20px; background-color: rgba(239, 68, 68, 0.1); border-radius: 8px; border-left: 4px solid ${BRAND.error};">
                <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #991b1b;">
                  ⚠️ This action is permanent and cannot be undone.
                </p>
                <p style="margin: 0; font-size: 14px; color: #991b1b;">
                  All your data will be permanently deleted including:
                </p>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #991b1b;">
                  <li>Your profile information</li>
                  <li>Organization memberships</li>
                  <li>Activity history</li>
                </ul>
              </div>
              <p style="margin: 24px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                This link expires in 30 minutes. If you did not request this, you can safely ignore this email.
              </p>`

  const html = baseEmailLayout({
    title: "Account Deletion Request",
    content,
    ctaText: "Confirm Account Deletion",
    ctaLink: encodeURI(deleteLink),
    ctaStyle: "coral",
  })

  return sendEmail({
    to,
    subject: `Confirm Account Deletion - ${site.name}`,
    html,
    text: `Account Deletion Request\n\nYou have requested to delete your ${site.name} account.\n\nThis action is permanent and cannot be undone.\n\nIf you want to proceed, visit this link within 30 minutes:\n${deleteLink}\n\nIf you did not request this, you can safely ignore this email.`,
    category: "transactional",
    preheader: "Confirm your account deletion request. This action cannot be undone.",
  })
}

// =============================================
// DEMO REQUEST EMAIL (Internal notification)
// =============================================
export async function sendDemoRequestEmail({
  firstName,
  lastName,
  email,
  company,
  companySize,
  role,
  interests,
  message,
}: {
  firstName: string
  lastName: string
  email: string
  company: string
  companySize?: string
  role?: string
  interests?: string[]
  message?: string
}): Promise<boolean> {
  const safeFirstName = escapeHtml(firstName.trim())
  const safeLastName = escapeHtml(lastName.trim())
  const safeEmail = escapeHtml(email.trim())
  const safeCompany = escapeHtml(company.trim())
  const safeCompanySize = companySize ? escapeHtml(companySize) : "Not specified"
  const safeRole = role ? escapeHtml(role) : "Not specified"
  const safeInterests = interests?.map(i => escapeHtml(i)).join(", ") || "Not specified"
  const safeMessage = message ? escapeHtml(message.trim()) : "No additional message"

  const content = `
              <div style="margin-bottom: 20px; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid ${BRAND.warning};">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400e;">
                  🔥 HIGH PRIORITY - Schedule within 24 hours
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Contact</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: ${BRAND.mintDark}; text-decoration: none;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Company</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeCompany}</p>
              </div>

              <div style="display: flex; gap: 24px; margin-bottom: 24px;">
                <div style="flex: 1;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Company Size</p>
                  <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeCompanySize}</p>
                </div>
                <div style="flex: 1;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Role</p>
                  <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeRole}</p>
                </div>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Areas of Interest</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeInterests}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Additional Notes</p>
                <div style="padding: 16px; background-color: ${BRAND.gray[50]}; border-radius: 8px; border-left: 4px solid ${BRAND.mint};">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${BRAND.gray[700]}; white-space: pre-wrap;">${safeMessage}</p>
                </div>
              </div>`

  const html = baseEmailLayout({
    title: "New Demo Request",
    content,
    ctaText: `Schedule Demo with ${safeFirstName}`,
    ctaLink: `mailto:${safeEmail}?subject=Your ${site.name} Demo - Let's Schedule!`,
    ctaStyle: "mint",
  })

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

  return sendEmail({
    to: "sales@cloudact.ai",
    subject: `[Demo Request] ${company} - ${firstName} ${lastName}`,
    html,
    text: textContent,
    replyTo: email,
    category: "notification",
    preheader: `Demo request from ${firstName} ${lastName} at ${company}`,
  })
}

// =============================================
// JOB APPLICATION EMAIL (Internal notification)
// =============================================
export async function sendJobApplicationEmail({
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
}: {
  firstName: string
  lastName: string
  email: string
  phone?: string
  position: string
  linkedin?: string
  github?: string
  portfolio?: string
  resumeFileName?: string
  coverLetter?: string
}): Promise<boolean> {
  const safeFirstName = escapeHtml(firstName.trim())
  const safeLastName = escapeHtml(lastName.trim())
  const safeEmail = escapeHtml(email.trim())
  const safePhone = phone ? escapeHtml(phone) : "Not provided"
  const safePosition = escapeHtml(position)
  const safeLinkedin = linkedin ? escapeHtml(linkedin) : null
  const safeGithub = github ? escapeHtml(github) : null
  const safePortfolio = portfolio ? escapeHtml(portfolio) : null
  const safeResume = resumeFileName ? escapeHtml(resumeFileName) : "Not attached"
  const safeCoverLetter = coverLetter ? escapeHtml(coverLetter.trim()) : "Not provided"

  const content = `
              <div style="margin-bottom: 24px; padding: 20px; background-color: ${BRAND.gray[100]}; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Position</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${BRAND.gray[900]};">${safePosition}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Candidate</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">
                  <strong>${safeFirstName} ${safeLastName}</strong><br />
                  <a href="mailto:${safeEmail}" style="color: ${BRAND.mintDark}; text-decoration: none;">${safeEmail}</a><br />
                  ${safePhone}
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Online Profiles</p>
                <p style="margin: 0; font-size: 15px; line-height: 1.8; color: ${BRAND.gray[700]};">
                  ${safeLinkedin ? `<a href="${safeLinkedin}" style="color: ${BRAND.mintDark};">LinkedIn</a>` : "LinkedIn: Not provided"}<br />
                  ${safeGithub ? `<a href="${safeGithub}" style="color: ${BRAND.mintDark};">GitHub</a>` : "GitHub: Not provided"}<br />
                  ${safePortfolio ? `<a href="${safePortfolio}" style="color: ${BRAND.mintDark};">Portfolio</a>` : "Portfolio: Not provided"}
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Resume</p>
                <p style="margin: 0; font-size: 15px; color: ${BRAND.gray[700]};">${safeResume}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Cover Letter</p>
                <div style="padding: 16px; background-color: ${BRAND.gray[50]}; border-radius: 8px; border-left: 4px solid ${BRAND.mint};">
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${BRAND.gray[700]}; white-space: pre-wrap;">${safeCoverLetter}</p>
                </div>
              </div>`

  const html = baseEmailLayout({
    title: "New Job Application",
    content,
    ctaText: `Reply to ${safeFirstName}`,
    ctaLink: `mailto:${safeEmail}?subject=Re: ${encodeURIComponent(`${position} Application - ${site.name}`)}`,
    ctaStyle: "dark",
  })

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
${resumeFileName || "Not attached"}

COVER LETTER
------------
${coverLetter || "Not provided"}

---
Reply to: ${email}
  `.trim()

  return sendEmail({
    to: "careers@cloudact.ai",
    subject: `[Application] ${position}: ${firstName} ${lastName}`,
    html,
    text: textContent,
    replyTo: email,
    category: "notification",
    preheader: `${position} application from ${firstName} ${lastName}`,
  })
}

// =============================================
// APPLICATION CONFIRMATION EMAIL
// =============================================
export async function sendApplicationConfirmationEmail({
  to,
  firstName,
  position,
}: {
  to: string
  firstName: string
  position: string
}): Promise<boolean> {
  const safeFirstName = escapeHtml(firstName.trim())
  const safePosition = escapeHtml(position)

  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Hi ${safeFirstName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Thank you for applying for the <strong>${safePosition}</strong> position at ${site.name}! We've received your application and our hiring team will review it carefully.
              </p>

              <div style="margin: 0 0 24px 0; padding: 20px; background-color: ${BRAND.gray[100]}; border-radius: 8px;">
                <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: ${BRAND.gray[900]};">What's next?</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: ${BRAND.gray[700]};">
                  <li>We'll review your application within 48 hours</li>
                  <li>If there's a good fit, we'll reach out to schedule an interview</li>
                  <li>Either way, you'll hear back from us</li>
                </ul>
              </div>

              <p style="margin: 0; font-size: 14px; color: ${BRAND.gray[500]};">
                If you have any questions, reach out to us at <a href="mailto:careers@cloudact.ai" style="color: ${BRAND.mintDark}; text-decoration: none;">careers@cloudact.ai</a>.
              </p>`

  const html = baseEmailLayout({
    title: "Application Received!",
    content,
    ctaText: "Explore Our Culture",
    ctaLink: `${site.url}/about`,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Application Received: ${position} at ${site.name}`,
    html,
    text: `Hi ${firstName}, Thank you for applying for the ${position} position at ${site.name}! We've received your application and our hiring team will review it within 48 hours. You'll hear back from us either way.`,
    category: "transactional",
    preheader: `We received your application for ${position}. Here's what happens next.`,
  })
}

// =============================================
// NEWSLETTER NOTIFICATION EMAIL (Internal)
// =============================================
export async function sendNewsletterNotificationEmail({
  email,
  source,
}: {
  email: string
  source?: string
}): Promise<boolean> {
  const safeEmail = escapeHtml(email.trim())
  const safeSource = source ? escapeHtml(source) : "Website"

  const content = `
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Email</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">
                  <a href="mailto:${safeEmail}" style="color: ${BRAND.mintDark}; text-decoration: none;">${safeEmail}</a>
                </p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Source</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${safeSource}</p>
              </div>

              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND.gray[500]};">Subscribed At</p>
                <p style="margin: 0; font-size: 16px; color: ${BRAND.gray[900]};">${new Date().toISOString()}</p>
              </div>

              <div style="padding: 16px; background-color: rgba(144, 252, 166, 0.15); border-radius: 8px; border-left: 4px solid ${BRAND.mint};">
                <p style="margin: 0; font-size: 14px; color: #047857;">
                  <strong>Action:</strong> Add to newsletter list in your email marketing platform.
                </p>
              </div>`

  const html = baseEmailLayout({
    title: "New Newsletter Subscriber",
    content,
  })

  return sendEmail({
    to: "marketing@cloudact.ai",
    subject: `[Newsletter] New Subscriber: ${email}`,
    html,
    text: `New Newsletter Subscriber\n\nEmail: ${email}\nSource: ${source || "Website"}\nSubscribed At: ${new Date().toISOString()}\n\nAction: Add to newsletter list.`,
    category: "notification",
    preheader: `New subscriber: ${email}`,
  })
}

// =============================================
// NEWSLETTER WELCOME EMAIL
// =============================================
export async function sendNewsletterWelcomeEmail({
  to,
}: {
  to: string
}): Promise<boolean> {
  const content = `
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.gray[700]};">
                Thanks for subscribing to our newsletter! You'll receive weekly insights on:
              </p>

              <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: ${BRAND.gray[700]};">
                <li>Cloud cost optimization strategies</li>
                <li>GenAI spending best practices</li>
                <li>FinOps industry trends</li>
                <li>Product updates and new features</li>
              </ul>

              <p style="margin: 24px 0 0 0; font-size: 14px; color: ${BRAND.gray[500]};">
                You can unsubscribe at any time by clicking the link at the bottom of any email.
              </p>`

  const html = baseEmailLayout({
    title: `Welcome to ${site.name}!`,
    content,
    ctaText: "Explore Our Resources",
    ctaLink: `${site.url}/resources`,
    ctaStyle: "mint",
  })

  return sendEmail({
    to,
    subject: `Welcome to ${site.name} Newsletter!`,
    html,
    text: `Thanks for subscribing to the ${site.name} newsletter! You'll receive weekly insights on cloud cost optimization, GenAI spending, and FinOps best practices.`,
    category: "marketing",
    preheader: "Welcome! Get weekly insights on cloud cost optimization and FinOps.",
  })
}
