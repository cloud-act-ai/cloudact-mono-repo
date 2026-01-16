# Supabase Dashboard Email Templates

Copy these templates to your Supabase Dashboard:

**Stage/Local:** https://supabase.com/dashboard/project/kwroaccbrxppfiysqlzs/auth/templates
**Production:** https://supabase.com/dashboard/project/ovfxswhkkshouhsryzaf/auth/templates

---

## Confirm signup

**Description:** Sent when a new user signs up

**Subject:** `Confirm Your Email - CloudAct.AI`

**HTML Body:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="{{ .SiteURL }}" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.AI" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0; margin: 0 auto;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">Confirm Your Email</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Welcome to <strong>CloudAct.AI</strong>! Please confirm your email address to complete your account setup.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; color: #71717a;">
                Your email: <strong style="color: #18181b;">{{ .Email }}</strong>
              </p>

              <!-- CTA Button - Mint Green -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Confirm Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- OTP Code -->
              <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a;">Or use this verification code:</p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #18181b;">{{ .Token }}</p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #71717a;">
                This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
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
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This email was sent by CloudAct.AI • <a href="{{ .SiteURL }}/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> • <a href="{{ .SiteURL }}/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                © 2026 CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Reset password (Recovery)

**Description:** Sent when user requests password reset

**Subject:** `Reset Your Password - CloudAct.AI`

**HTML Body:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="{{ .SiteURL }}" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.AI" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0; margin: 0 auto;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">Reset Your Password</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                We received a request to reset your password for your CloudAct.AI account.
              </p>

              <!-- CTA Button - Mint Green -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- OTP Code -->
              <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a;">Or use this verification code:</p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #18181b;">{{ .Token }}</p>
              </div>

              <!-- Security Notice -->
              <div style="margin: 24px 0; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Security Notice:</strong> If you didn't request this, please ignore this email. Your password won't be changed.
                </p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #71717a;">
                This link expires in 24 hours.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
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
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This email was sent by CloudAct.AI • <a href="{{ .SiteURL }}/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> • <a href="{{ .SiteURL }}/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                © 2026 CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Invite user

**Description:** Sent when inviting a user to join organization

**Subject:** `You're Invited to CloudAct.AI`

**HTML Body:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="{{ .SiteURL }}" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.AI" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0; margin: 0 auto;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                You've been invited to join an organization on <strong>CloudAct.AI</strong> - the enterprise platform for GenAI, Cloud & Subscription cost management.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; color: #71717a;">
                This invitation was sent to: <strong style="color: #18181b;">{{ .Email }}</strong>
              </p>

              <!-- CTA Button - Mint Green -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- OTP Code -->
              <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a;">Or use this verification code:</p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #18181b;">{{ .Token }}</p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #71717a;">
                This invitation expires in 48 hours. If you weren't expecting this, you can safely ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
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
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This email was sent by CloudAct.AI • <a href="{{ .SiteURL }}/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> • <a href="{{ .SiteURL }}/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                © 2026 CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Magic Link

**Description:** Sent for passwordless login

**Subject:** `Sign In to CloudAct.AI`

**HTML Body:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="{{ .SiteURL }}" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.AI" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0; margin: 0 auto;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">Sign In to CloudAct.AI</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Click the button below to securely sign in to your CloudAct.AI account. No password required.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; color: #71717a;">
                Account: <strong style="color: #18181b;">{{ .Email }}</strong>
              </p>

              <!-- CTA Button - Mint Green -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Sign In
                    </a>
                  </td>
                </tr>
              </table>

              <!-- OTP Code -->
              <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a;">Or use this one-time code:</p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #18181b;">{{ .Token }}</p>
              </div>

              <!-- Security Notice -->
              <div style="margin: 24px 0; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Security:</strong> This link can only be used once and expires in 1 hour. Open it in the same browser where you requested it.
                </p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #71717a;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
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
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This email was sent by CloudAct.AI • <a href="{{ .SiteURL }}/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> • <a href="{{ .SiteURL }}/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                © 2026 CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Change Email Address

**Description:** Sent when user changes their email

**Subject:** `Confirm Email Change - CloudAct.AI`

**HTML Body:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Email Change - CloudAct.AI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="{{ .SiteURL }}" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.AI" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0; margin: 0 auto;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">Confirm Email Change</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                You requested to change your email address for your CloudAct.AI account.
              </p>

              <div style="margin: 0 0 24px 0; padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">New email address:</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #18181b;">{{ .NewEmail }}</p>
              </div>

              <!-- CTA Button - Mint Green -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Confirm Email Change
                    </a>
                  </td>
                </tr>
              </table>

              <!-- OTP Code -->
              <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a;">Or use this verification code:</p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #18181b;">{{ .Token }}</p>
              </div>

              <!-- Security Notice -->
              <div style="margin: 24px 0; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Security Notice:</strong> If you didn't request this change, please contact support immediately.
                </p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #71717a;">
                This link expires in 24 hours.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
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
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This email was sent by CloudAct.AI • <a href="{{ .SiteURL }}/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> • <a href="{{ .SiteURL }}/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                © 2026 CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## SMTP Settings (Optional but Recommended)

Configure custom SMTP in Supabase for better deliverability:

**Location:** Project Settings → Authentication → SMTP Settings

| Setting | Value |
|---------|-------|
| Enable Custom SMTP | ✓ Enabled |
| Host | smtp.gmail.com |
| Port | 587 |
| Username | support@cloudact.ai |
| Password | (Use app password) |
| Sender email | support@cloudact.ai |
| Sender name | CloudAct.AI |

---

## Auth Settings Checklist

**Location:** Authentication → Email Auth

- [ ] Enable email confirmations (production)
- [ ] Secure email change enabled
- [ ] Minimum password length: 8
- [ ] Site URL: https://cloudact.ai
- [ ] Redirect URLs include:
  - https://cloudact.ai/reset-password
  - https://cloudact.ai/auth/callback
  - https://cloudact.ai/invite/*

