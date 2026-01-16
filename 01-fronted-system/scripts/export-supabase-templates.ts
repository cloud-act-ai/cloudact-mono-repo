#!/usr/bin/env npx tsx
/**
 * Export Supabase Email Templates for Dashboard
 *
 * Generates copy-paste ready HTML templates for Supabase Dashboard
 *
 * Usage:
 *   npx tsx scripts/export-supabase-templates.ts
 *   npx tsx scripts/export-supabase-templates.ts --template recovery
 *   npx tsx scripts/export-supabase-templates.ts --output templates-export.md
 */

import * as fs from 'fs'
import * as path from 'path'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

interface TemplateConfig {
  name: string
  subject: string
  file: string
  description: string
}

const templates: TemplateConfig[] = [
  {
    name: 'Confirm signup',
    subject: 'Confirm Your Email - CloudAct.AI',
    file: 'confirmation.html',
    description: 'Sent when a new user signs up',
  },
  {
    name: 'Reset password (Recovery)',
    subject: 'Reset Your Password - CloudAct.AI',
    file: 'recovery.html',
    description: 'Sent when user requests password reset',
  },
  {
    name: 'Invite user',
    subject: "You're Invited to CloudAct.AI",
    file: 'invite.html',
    description: 'Sent when inviting a user to join organization',
  },
  {
    name: 'Magic Link',
    subject: 'Sign In to CloudAct.AI',
    file: 'magic_link.html',
    description: 'Sent for passwordless login',
  },
  {
    name: 'Change Email Address',
    subject: 'Confirm Email Change - CloudAct.AI',
    file: 'email_change.html',
    description: 'Sent when user changes their email',
  },
]

function main() {
  const args = process.argv.slice(2)
  let specificTemplate: string | null = null
  let outputFile: string | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template' && args[i + 1]) {
      specificTemplate = args[i + 1]
      i++
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1]
      i++
    }
  }

  const templatesDir = path.join(process.cwd(), 'supabase', 'templates')

  let output = ''

  output += `# Supabase Dashboard Email Templates\n\n`
  output += `Copy these templates to your Supabase Dashboard:\n\n`
  output += `**Stage/Local:** https://supabase.com/dashboard/project/kwroaccbrxppfiysqlzs/auth/templates\n`
  output += `**Production:** https://supabase.com/dashboard/project/ovfxswhkkshouhsryzaf/auth/templates\n\n`
  output += `---\n\n`

  for (const template of templates) {
    if (specificTemplate && !template.file.includes(specificTemplate) && !template.name.toLowerCase().includes(specificTemplate.toLowerCase())) {
      continue
    }

    const filePath = path.join(templatesDir, template.file)

    if (!fs.existsSync(filePath)) {
      console.error(`Template not found: ${filePath}`)
      continue
    }

    const content = fs.readFileSync(filePath, 'utf-8')

    output += `## ${template.name}\n\n`
    output += `**Description:** ${template.description}\n\n`
    output += `**Subject:** \`${template.subject}\`\n\n`
    output += `**HTML Body:**\n\n`
    output += `\`\`\`html\n${content}\`\`\`\n\n`
    output += `---\n\n`
  }

  // Add SMTP settings section
  output += `## SMTP Settings (Optional but Recommended)\n\n`
  output += `Configure custom SMTP in Supabase for better deliverability:\n\n`
  output += `**Location:** Project Settings → Authentication → SMTP Settings\n\n`
  output += `| Setting | Value |\n`
  output += `|---------|-------|\n`
  output += `| Enable Custom SMTP | ✓ Enabled |\n`
  output += `| Host | smtp.gmail.com |\n`
  output += `| Port | 587 |\n`
  output += `| Username | support@cloudact.ai |\n`
  output += `| Password | (Use app password) |\n`
  output += `| Sender email | support@cloudact.ai |\n`
  output += `| Sender name | CloudAct.AI |\n\n`

  output += `---\n\n`
  output += `## Auth Settings Checklist\n\n`
  output += `**Location:** Authentication → Email Auth\n\n`
  output += `- [ ] Enable email confirmations (production)\n`
  output += `- [ ] Secure email change enabled\n`
  output += `- [ ] Minimum password length: 8\n`
  output += `- [ ] Site URL: https://cloudact.ai\n`
  output += `- [ ] Redirect URLs include:\n`
  output += `  - https://cloudact.ai/reset-password\n`
  output += `  - https://cloudact.ai/auth/callback\n`
  output += `  - https://cloudact.ai/invite/*\n\n`

  if (outputFile) {
    fs.writeFileSync(outputFile, output)
    console.log(`${colors.green}✓${colors.reset} Templates exported to ${outputFile}`)
  } else {
    // Print to console with nice formatting
    console.log(`${colors.bold}${colors.cyan}`)
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║      Supabase Dashboard Email Templates Export         ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log(colors.reset)

    console.log(`${colors.yellow}Copy these to your Supabase Dashboard:${colors.reset}\n`)
    console.log(`${colors.cyan}Stage/Local:${colors.reset} https://supabase.com/dashboard/project/kwroaccbrxppfiysqlzs/auth/templates`)
    console.log(`${colors.cyan}Production:${colors.reset}  https://supabase.com/dashboard/project/ovfxswhkkshouhsryzaf/auth/templates\n`)

    for (const template of templates) {
      if (specificTemplate && !template.file.includes(specificTemplate) && !template.name.toLowerCase().includes(specificTemplate.toLowerCase())) {
        continue
      }

      const filePath = path.join(templatesDir, template.file)

      if (!fs.existsSync(filePath)) {
        continue
      }

      console.log(`${colors.bold}═══ ${template.name} ═══${colors.reset}`)
      console.log(`${colors.dim}${template.description}${colors.reset}`)
      console.log(`${colors.cyan}Subject:${colors.reset} ${template.subject}`)
      console.log(`${colors.cyan}Source:${colors.reset}  ${template.file}`)
      console.log('')
    }

    console.log(`\n${colors.green}Tip:${colors.reset} Run with --output to export to a file:`)
    console.log(`  npx tsx scripts/export-supabase-templates.ts --output supabase-templates.md\n`)
  }
}

main()
