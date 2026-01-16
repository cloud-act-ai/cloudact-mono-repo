#!/usr/bin/env npx tsx
/**
 * Email & Auth Configuration Verification Script
 *
 * Checks:
 * 1. Environment variables
 * 2. SMTP connection
 * 3. DNS records (SPF, DKIM, DMARC)
 * 4. Supabase auth settings
 * 5. Email template existence
 * 6. Test email sending
 *
 * Usage:
 *   npx tsx scripts/verify-email-config.ts
 *   npx tsx scripts/verify-email-config.ts --send-test your@email.com
 *   npx tsx scripts/verify-email-config.ts --env prod
 */

import * as dns from 'dns'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const resolveTxt = promisify(dns.resolveTxt)
const resolveMx = promisify(dns.resolveMx)

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  divider: () => console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`),
}

interface VerificationResult {
  category: string
  check: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  details?: string
}

const results: VerificationResult[] = []

function addResult(category: string, check: string, status: 'pass' | 'fail' | 'warn', message: string, details?: string) {
  results.push({ category, check, status, message, details })
  if (status === 'pass') log.success(message)
  else if (status === 'fail') log.error(message)
  else log.warn(message)
  if (details) console.log(`   ${colors.dim}${details}${colors.reset}`)
}

// ============================================
// 1. Environment Variables Check
// ============================================
async function checkEnvVariables(envFile: string): Promise<void> {
  log.header('Environment Variables')

  const envPath = path.join(process.cwd(), envFile)

  if (!fs.existsSync(envPath)) {
    addResult('ENV', 'File exists', 'fail', `Environment file not found: ${envFile}`)
    return
  }

  addResult('ENV', 'File exists', 'pass', `Found ${envFile}`)

  const envContent = fs.readFileSync(envPath, 'utf-8')
  const envVars: Record<string, string> = {}

  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      envVars[match[1].trim()] = match[2].trim()
    }
  })

  // Required SMTP variables
  const smtpVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'FROM_EMAIL', 'FROM_NAME']
  for (const varName of smtpVars) {
    if (envVars[varName]) {
      const displayValue = varName.includes('PASSWORD') ? '****' : envVars[varName]
      addResult('ENV', varName, 'pass', `${varName} = ${displayValue}`)
    } else {
      addResult('ENV', varName, 'fail', `${varName} is not set`)
    }
  }

  // Supabase variables
  const supabaseVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  for (const varName of supabaseVars) {
    if (envVars[varName]) {
      addResult('ENV', varName, 'pass', `${varName} is configured`)
    } else {
      addResult('ENV', varName, 'fail', `${varName} is not set`)
    }
  }

  // App URL
  if (envVars['NEXT_PUBLIC_APP_URL']) {
    addResult('ENV', 'NEXT_PUBLIC_APP_URL', 'pass', `App URL: ${envVars['NEXT_PUBLIC_APP_URL']}`)
  } else {
    addResult('ENV', 'NEXT_PUBLIC_APP_URL', 'fail', 'NEXT_PUBLIC_APP_URL is not set (required for reset links)')
  }

  return
}

// ============================================
// 2. SMTP Connection Test
// ============================================
async function checkSMTPConnection(): Promise<void> {
  log.header('SMTP Connection')

  try {
    const nodemailer = await import('nodemailer')

    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = Number(process.env.SMTP_PORT) || 587
    const user = process.env.SMTP_USERNAME
    const pass = process.env.SMTP_PASSWORD

    if (!user || !pass) {
      addResult('SMTP', 'Credentials', 'fail', 'SMTP credentials not found in environment')
      return
    }

    log.info(`Testing connection to ${host}:${port}...`)

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      connectionTimeout: 10000,
    })

    await transporter.verify()
    addResult('SMTP', 'Connection', 'pass', `SMTP connection successful to ${host}:${port}`)
    addResult('SMTP', 'Authentication', 'pass', `Authenticated as ${user}`)

    transporter.close()
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    addResult('SMTP', 'Connection', 'fail', `SMTP connection failed: ${errMsg}`)

    if (errMsg.includes('Invalid login')) {
      addResult('SMTP', 'Authentication', 'fail', 'Invalid SMTP credentials - check app password')
    } else if (errMsg.includes('ECONNREFUSED')) {
      addResult('SMTP', 'Network', 'fail', 'Connection refused - check host/port')
    } else if (errMsg.includes('ETIMEDOUT')) {
      addResult('SMTP', 'Network', 'fail', 'Connection timed out - check firewall')
    }
  }
}

// ============================================
// 3. DNS Records Check
// ============================================
async function checkDNSRecords(domain: string): Promise<void> {
  log.header(`DNS Records (${domain})`)

  // MX Records
  try {
    const mxRecords = await resolveMx(domain)
    if (mxRecords.length > 0) {
      addResult('DNS', 'MX Records', 'pass', `MX records found: ${mxRecords.map(r => r.exchange).join(', ')}`)
    } else {
      addResult('DNS', 'MX Records', 'warn', 'No MX records found')
    }
  } catch {
    addResult('DNS', 'MX Records', 'warn', 'Could not resolve MX records')
  }

  // SPF Record
  try {
    const txtRecords = await resolveTxt(domain)
    const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'))

    if (spfRecord) {
      addResult('DNS', 'SPF Record', 'pass', 'SPF record found', spfRecord)

      // Check if Google is included (for Gmail SMTP)
      if (spfRecord.includes('google.com') || spfRecord.includes('_spf.google.com')) {
        addResult('DNS', 'SPF Gmail', 'pass', 'SPF includes Google (required for Gmail SMTP)')
      } else {
        addResult('DNS', 'SPF Gmail', 'warn', 'SPF does not include Google - add "include:_spf.google.com"')
      }
    } else {
      addResult('DNS', 'SPF Record', 'fail', 'No SPF record found',
        'Add TXT record: v=spf1 include:_spf.google.com ~all')
    }
  } catch {
    addResult('DNS', 'SPF Record', 'warn', 'Could not resolve TXT records')
  }

  // DMARC Record
  try {
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`)
    const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'))

    if (dmarcRecord) {
      addResult('DNS', 'DMARC Record', 'pass', 'DMARC record found', dmarcRecord)
    } else {
      addResult('DNS', 'DMARC Record', 'warn', 'No DMARC record found',
        'Add TXT record at _dmarc: v=DMARC1; p=none; rua=mailto:dmarc@cloudact.ai')
    }
  } catch {
    addResult('DNS', 'DMARC Record', 'warn', 'No DMARC record found (recommended for deliverability)')
  }

  // DKIM (check for Google selector)
  try {
    const dkimRecords = await resolveTxt(`google._domainkey.${domain}`)
    if (dkimRecords.length > 0) {
      addResult('DNS', 'DKIM (Google)', 'pass', 'Google DKIM record found')
    }
  } catch {
    addResult('DNS', 'DKIM (Google)', 'warn', 'No Google DKIM record found',
      'Configure DKIM in Google Workspace Admin console')
  }
}

// ============================================
// 4. Email Templates Check
// ============================================
async function checkEmailTemplates(): Promise<void> {
  log.header('Email Templates')

  const templatesDir = path.join(process.cwd(), 'supabase', 'templates')

  if (!fs.existsSync(templatesDir)) {
    addResult('Templates', 'Directory', 'fail', `Templates directory not found: ${templatesDir}`)
    return
  }

  addResult('Templates', 'Directory', 'pass', 'Templates directory exists')

  const requiredTemplates = [
    'confirmation.html',
    'recovery.html',
    'invite.html',
    'magic_link.html',
    'email_change.html',
    'password_changed.html',
  ]

  for (const template of requiredTemplates) {
    const templatePath = path.join(templatesDir, template)
    if (fs.existsSync(templatePath)) {
      const content = fs.readFileSync(templatePath, 'utf-8')
      const hasCloudActBranding = content.includes('CloudAct') || content.includes('cloudact')

      if (hasCloudActBranding) {
        addResult('Templates', template, 'pass', `${template} exists with CloudAct branding`)
      } else {
        addResult('Templates', template, 'warn', `${template} exists but may use default template`)
      }
    } else {
      addResult('Templates', template, 'fail', `${template} not found`)
    }
  }
}

// ============================================
// 5. Supabase Config Check
// ============================================
async function checkSupabaseConfig(): Promise<void> {
  log.header('Supabase Configuration')

  const configPath = path.join(process.cwd(), 'supabase', 'config.toml')

  if (!fs.existsSync(configPath)) {
    addResult('Supabase', 'config.toml', 'warn', 'Local Supabase config not found (only needed for local dev)')
    return
  }

  const config = fs.readFileSync(configPath, 'utf-8')

  addResult('Supabase', 'config.toml', 'pass', 'Local Supabase config found')

  // Check auth settings
  if (config.includes('enable_confirmations = true')) {
    addResult('Supabase', 'Email Confirmations', 'pass', 'Email confirmations enabled')
  } else if (config.includes('enable_confirmations = false')) {
    addResult('Supabase', 'Email Confirmations', 'warn', 'Email confirmations disabled (OK for dev)')
  }

  if (config.includes('minimum_password_length = 8')) {
    addResult('Supabase', 'Password Policy', 'pass', 'Minimum password length: 8 characters')
  }

  // Check template paths
  if (config.includes('content_path = "./supabase/templates/recovery.html"')) {
    addResult('Supabase', 'Recovery Template', 'pass', 'Custom recovery template configured')
  }
}

// ============================================
// 6. Test Email Send
// ============================================
async function sendTestEmail(to: string): Promise<void> {
  log.header('Test Email')

  try {
    const nodemailer = await import('nodemailer')

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    })

    const fromEmail = process.env.FROM_EMAIL || 'support@cloudact.ai'
    const fromName = process.env.FROM_NAME || 'CloudAct.AI'

    log.info(`Sending test email to ${to}...`)

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: 'CloudAct.AI - Email Configuration Test',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Email Test</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background-color: #f4f4f5;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h1 style="color: #18181b; margin-bottom: 20px;">Email Configuration Test</h1>
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
      If you're reading this, your email configuration is working correctly.
    </p>
    <div style="margin: 24px 0; padding: 16px; background: #90FCA6; border-radius: 8px;">
      <p style="margin: 0; color: #000; font-weight: 600;">✓ SMTP Connection: Success</p>
      <p style="margin: 8px 0 0 0; color: #000;">Sent via: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}</p>
    </div>
    <p style="color: #71717a; font-size: 14px;">
      Test sent at: ${new Date().toISOString()}<br>
      From: ${fromEmail}
    </p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
    <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
      CloudAct.AI - Enterprise Cloud Cost Management
    </p>
  </div>
</body>
</html>
      `,
      text: `Email Configuration Test\n\nIf you're reading this, your email configuration is working correctly.\n\nSent at: ${new Date().toISOString()}`,
      headers: {
        'X-Mailer': 'CloudAct.AI Email Verification Script',
      },
    })

    addResult('Test Email', 'Send', 'pass', `Test email sent successfully to ${to}`)
    addResult('Test Email', 'Message ID', 'pass', `Message ID: ${info.messageId}`)

    transporter.close()
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    addResult('Test Email', 'Send', 'fail', `Failed to send test email: ${errMsg}`)
  }
}

// ============================================
// 7. Supabase Dashboard Reminder
// ============================================
function showDashboardReminder(): void {
  log.header('Supabase Dashboard Configuration')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'YOUR_PROJECT_REF'

  console.log(`${colors.yellow}⚠ IMPORTANT: Local templates don't sync to Supabase Cloud!${colors.reset}`)
  console.log('')
  console.log('You must manually update templates in the Supabase Dashboard:')
  console.log('')
  console.log(`${colors.cyan}Email Templates:${colors.reset}`)
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/auth/templates`)
  console.log('')
  console.log(`${colors.cyan}SMTP Settings:${colors.reset}`)
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/settings/auth`)
  console.log(`  → Scroll to "SMTP Settings" section`)
  console.log('')
  console.log(`${colors.cyan}Auth Settings:${colors.reset}`)
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/auth/providers`)
  console.log('')
}

// ============================================
// Summary Report
// ============================================
function printSummary(): void {
  log.header('Summary Report')

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const warnings = results.filter(r => r.status === 'warn').length

  console.log(`${colors.green}Passed:${colors.reset}   ${passed}`)
  console.log(`${colors.red}Failed:${colors.reset}   ${failed}`)
  console.log(`${colors.yellow}Warnings:${colors.reset} ${warnings}`)
  console.log('')

  if (failed > 0) {
    console.log(`${colors.red}${colors.bold}Issues to fix:${colors.reset}`)
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  ${colors.red}✗${colors.reset} [${r.category}] ${r.message}`)
      if (r.details) console.log(`    ${colors.dim}${r.details}${colors.reset}`)
    })
    console.log('')
  }

  if (warnings > 0) {
    console.log(`${colors.yellow}${colors.bold}Recommendations:${colors.reset}`)
    results.filter(r => r.status === 'warn').forEach(r => {
      console.log(`  ${colors.yellow}⚠${colors.reset} [${r.category}] ${r.message}`)
      if (r.details) console.log(`    ${colors.dim}${r.details}${colors.reset}`)
    })
  }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log(`${colors.bold}${colors.cyan}`)
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║     CloudAct.AI Email & Auth Configuration Verifier    ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log(colors.reset)

  // Parse arguments
  const args = process.argv.slice(2)
  let envFile = '.env.local'
  let testEmail: string | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      envFile = `.env.${args[i + 1]}`
      i++
    } else if (args[i] === '--send-test' && args[i + 1]) {
      testEmail = args[i + 1]
      i++
    }
  }

  // Load environment variables
  const envPath = path.join(process.cwd(), envFile)
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
    log.info(`Loaded environment from ${envFile}`)
  }

  // Run checks
  await checkEnvVariables(envFile)
  await checkSMTPConnection()
  await checkDNSRecords('cloudact.ai')
  await checkEmailTemplates()
  await checkSupabaseConfig()

  // Send test email if requested
  if (testEmail) {
    await sendTestEmail(testEmail)
  }

  // Show dashboard reminder
  showDashboardReminder()

  // Print summary
  printSummary()

  // Exit code based on failures
  const failCount = results.filter(r => r.status === 'fail').length
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(console.error)
