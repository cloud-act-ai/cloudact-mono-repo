import nodemailer from "nodemailer"

// HTML escape function to prevent XSS in email templates
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// SMTP Configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
})

const fromEmail = process.env.FROM_EMAIL || "support@cloudact.ai"
const fromName = process.env.FROM_NAME || "CloudAct.ai"
const appName = "CloudAct.ai"

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    return false
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text: text || subject,
    })
    return true
  } catch {
    return false
  }
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

  // Escape user-provided content to prevent XSS
  const safeInviterName = escapeHtml(inviterName)
  const safeOrgName = escapeHtml(orgName)
  const safeRoleDisplay = escapeHtml(roleDisplay)
  // inviteLink is server-generated URL - use encodeURI for href attributes
  const safeInviteLink = encodeURI(inviteLink)

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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #18181b; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">C</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">You're Invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on CloudAct.AI.
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Your role:</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${safeRoleDisplay}</p>
              </div>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${safeInviteLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #71717a;">
                This invitation expires in 48 hours. If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 20px 0 0 0; font-size: 12px; color: #a1a1aa; word-break: break-all;">
                Or copy this link: ${safeInviteLink}
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

  return sendEmail({
    to,
    subject: `You're invited to join ${safeOrgName} on CloudAct.AI`,
    html,
    text: `${inviterName} has invited you to join ${orgName} on CloudAct.AI as ${roleDisplay}. Accept your invitation: ${inviteLink}`,
  })
}

// =============================================
// PASSWORD RESET EMAIL (Fallback if Supabase fails)
// =============================================
export async function sendPasswordResetEmail({
  to,
  resetLink,
}: {
  to: string
  resetLink: string
}): Promise<boolean> {
  // Escape the reset link for safety (even though server-generated)
  const safeResetLink = escapeHtml(resetLink)

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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #18181b; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">C</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Reset Your Password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                We received a request to reset your password for your CloudAct.AI account.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${safeResetLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <div style="margin: 30px 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Security Notice:</strong> If you didn't request this, please ignore this email. Your password won't be changed.
                </p>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                This link expires in 1 hour.
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
  const daysRemaining = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const formattedDate = trialEndsAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #f59e0b; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">!</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Your Trial is Ending Soon</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Your free trial for <strong>${safeOrgName}</strong> on CloudAct.AI will end in <strong>${daysRemaining} days</strong> (${formattedDate}).
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  To avoid any interruption to your service, please add a payment method before your trial ends.
                </p>
              </div>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${safeBillingLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Subscribe Now
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #71717a;">
                If you have any questions about our plans, feel free to reach out to our support team.
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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #ef4444; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">!</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Payment Failed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                We were unable to process your payment for <strong>${safeOrgName}</strong> on CloudAct.AI.
              </p>
              <div style="margin: 0 0 30px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; border-left: 4px solid #ef4444;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;">
                  <strong>Action Required:</strong> Please update your payment method to avoid service interruption.
                </p>
              </div>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${safeBillingLink}" style="display: inline-block; padding: 14px 32px; background-color: #ef4444; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #71717a;">
                If you believe this is an error, please contact your bank or our support team for assistance.
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
  // Escape user-provided content to prevent XSS
  const safeName = escapeHtml(name)
  const safeOrgName = escapeHtml(orgName)
  const safeDashboardLink = escapeHtml(dashboardLink)

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
              <div style="display: inline-block; width: 48px; height: 48px; background-color: #18181b; border-radius: 12px; line-height: 48px; text-align: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">C</span>
              </div>
              <h1 style="margin: 20px 0 0 0; font-size: 24px; font-weight: 700; color: #18181b;">Welcome to CloudAct.AI!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Hi ${safeName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Welcome to <strong>${safeOrgName}</strong>! Your account is all set up and ready to go.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${safeDashboardLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #71717a;">
                Need help getting started? Check out our documentation or contact support.
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

  return sendEmail({
    to,
    subject: `Welcome to ${safeOrgName} on CloudAct.AI!`,
    html,
    text: `Welcome to ${orgName} on CloudAct.AI! Go to your dashboard: ${dashboardLink}`,
  })
}
