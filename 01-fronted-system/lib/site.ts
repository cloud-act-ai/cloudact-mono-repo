/**
 * Site Configuration
 *
 * Centralized site/company details. Use environment variables for flexibility.
 * Import this instead of hardcoding "CloudAct" throughout the codebase.
 */

export const site = {
  // Site name (displayed in UI, emails, etc.)
  name: process.env.NEXT_PUBLIC_SITE_NAME || "CloudAct.ai",

  // Company legal name (footer, terms, etc.)
  company: process.env.NEXT_PUBLIC_COMPANY_NAME || "CloudAct Inc.",

  // Site URL
  url: process.env.NEXT_PUBLIC_APP_URL || "https://cloudact.ai",

  // Support email
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai",

  // Company address (for emails, legal pages)
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086",

  // Logo URLs
  logo: {
    light: "/logos/cloudact-logo-black.svg",
    dark: "/logos/cloudact-logo-white.svg",
    png: "https://cloudact.ai/logos/cloudact-logo-black.png",
  },

  // Social links
  social: {
    twitter: "https://twitter.com/cloudactai",
    linkedin: "https://linkedin.com/company/cloudact",
    github: "https://github.com/cloudact",
  },
} as const

// Type for site config
export type SiteConfig = typeof site

/**
 * Generate a page title with the site name suffix.
 * Usage: siteTitle("Pricing") → "Pricing | CloudAct.ai"
 *        siteTitle("Pricing", "GenAI & Cloud Cost Intelligence") → "Pricing | CloudAct.ai - GenAI & Cloud Cost Intelligence"
 */
export function siteTitle(page: string, subtitle?: string): string {
  return subtitle ? `${page} | ${site.name} - ${subtitle}` : `${page} | ${site.name}`
}
