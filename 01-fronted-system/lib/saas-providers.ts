/**
 * SaaS Provider Configuration
 *
 * This file contains the list of common SaaS providers for subscription tracking.
 * Separated from server actions to allow client-side imports.
 *
 * NOTE: These are fixed-cost SUBSCRIPTIONS (monthly/annual fees), NOT API integrations.
 * - AI Subscriptions: ChatGPT Plus ($20/mo), Claude Pro ($20/mo) - different from API keys
 * - LLM API integrations are handled separately in Settings > Integrations > LLM Providers
 *
 * Logo System:
 * - logo_slug: Simple Icons slug (https://simpleicons.org/) for CDN-hosted SVG logos
 * - logo_color: Brand color hex code (without #)
 * - Falls back to Lucide icon if logo_slug is not found or fails to load
 */

// Common SaaS providers for quick add
// NOTE: These match the providers in api-service/configs/saas/seed/data/default_subscriptions.csv
// Only includes consumer subscriptions (NOT LLM API tiers which are in separate integration flow)
export const COMMON_SAAS_PROVIDERS = [
  // Design Tools
  { id: "canva", name: "Canva", category: "design", icon: "palette", logo_slug: "canva", logo_color: "00C4CC" },
  { id: "adobe_cc", name: "Adobe Creative Cloud", category: "design", icon: "palette", logo_slug: "adobecreativecloud", logo_color: "DA1F26" },
  { id: "figma", name: "Figma", category: "design", icon: "palette", logo_slug: "figma", logo_color: "F24E1E" },
  { id: "miro", name: "Miro", category: "design", icon: "palette", logo_slug: "miro", logo_color: "050038" },
  // AI Subscriptions (fixed monthly, NOT per-token API usage)
  { id: "chatgpt_plus", name: "ChatGPT Plus", category: "ai", icon: "brain", logo_slug: "openai", logo_color: "412991" },
  { id: "claude_pro", name: "Claude Pro", category: "ai", icon: "sparkles", logo_slug: "anthropic", logo_color: "191919" },
  { id: "gemini_advanced", name: "Gemini Advanced", category: "ai", icon: "gem", logo_slug: "googlegemini", logo_color: "8E75B2" },
  { id: "copilot", name: "GitHub Copilot", category: "ai", icon: "code", logo_slug: "githubcopilot", logo_color: "000000" },
  { id: "cursor", name: "Cursor", category: "ai", icon: "code", logo_slug: "cursor", logo_color: "000000" },
  { id: "lovable", name: "Lovable", category: "ai", icon: "sparkles", logo_slug: null, logo_color: "FF6B6B" }, // No Simple Icons logo yet
  { id: "v0", name: "v0", category: "ai", icon: "sparkles", logo_slug: "vercel", logo_color: "000000" },
  { id: "windsurf", name: "Windsurf", category: "ai", icon: "code", logo_slug: "codeium", logo_color: "09B6A2" },
  { id: "replit", name: "Replit", category: "ai", icon: "code", logo_slug: "replit", logo_color: "F26207" },
  // Productivity
  { id: "notion", name: "Notion", category: "productivity", icon: "file-text", logo_slug: "notion", logo_color: "000000" },
  { id: "confluence", name: "Confluence", category: "productivity", icon: "file-text", logo_slug: "confluence", logo_color: "172B4D" },
  { id: "asana", name: "Asana", category: "productivity", icon: "check-square", logo_slug: "asana", logo_color: "F06A6A" },
  { id: "monday", name: "Monday.com", category: "productivity", icon: "check-square", logo_slug: "monday", logo_color: "FF3D57" },
  // Communication
  { id: "slack", name: "Slack", category: "communication", icon: "message-square", logo_slug: "slack", logo_color: "4A154B" },
  { id: "zoom", name: "Zoom", category: "communication", icon: "video", logo_slug: "zoom", logo_color: "0B5CFF" },
  { id: "teams", name: "Microsoft Teams", category: "communication", icon: "users", logo_slug: "microsoftteams", logo_color: "6264A7" },
  // Development
  { id: "github", name: "GitHub", category: "development", icon: "github", logo_slug: "github", logo_color: "181717" },
  { id: "gitlab", name: "GitLab", category: "development", icon: "gitlab", logo_slug: "gitlab", logo_color: "FC6D26" },
  { id: "jira", name: "Jira", category: "development", icon: "clipboard", logo_slug: "jira", logo_color: "0052CC" },
  { id: "linear", name: "Linear", category: "development", icon: "clipboard", logo_slug: "linear", logo_color: "5E6AD2" },
  { id: "vercel", name: "Vercel", category: "development", icon: "triangle", logo_slug: "vercel", logo_color: "000000" },
  { id: "netlify", name: "Netlify", category: "development", icon: "globe", logo_slug: "netlify", logo_color: "00C7B7" },
  { id: "railway", name: "Railway", category: "development", icon: "server", logo_slug: "railway", logo_color: "0B0D0E" },
  { id: "supabase", name: "Supabase", category: "development", icon: "database", logo_slug: "supabase", logo_color: "3FCF8E" },
  // Video
  { id: "loom", name: "Loom", category: "video", icon: "video", logo_slug: "loom", logo_color: "625DF5" },
  // Custom
  { id: "custom", name: "Custom", category: "other", icon: "plus", logo_slug: null, logo_color: "64748B" },
] as const

export type SaaSProvider = typeof COMMON_SAAS_PROVIDERS[number]
export type SaaSCategory = SaaSProvider["category"]

// Helper to get provider logo URL from Simple Icons CDN
export function getProviderLogoUrl(logoSlug: string | null, logoColor: string): string | null {
  if (!logoSlug) return null
  return `https://cdn.simpleicons.org/${logoSlug}/${logoColor}`
}
