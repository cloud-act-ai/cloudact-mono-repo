/**
 * SaaS Provider Configuration
 *
 * This file contains the list of common SaaS providers for subscription tracking.
 * Separated from server actions to allow client-side imports.
 *
 * NOTE: These are fixed-cost SUBSCRIPTIONS (monthly/annual fees), NOT API integrations.
 * - AI Subscriptions: ChatGPT Plus ($20/mo), Claude Pro ($20/mo) - different from API keys
 * - LLM API integrations are handled separately in Settings > Integrations > LLM Providers
 */

// Common SaaS providers for quick add
// NOTE: These match the providers in api-service/configs/saas/seed/data/default_subscriptions.csv
// Only includes consumer subscriptions (NOT LLM API tiers which are in separate integration flow)
export const COMMON_SAAS_PROVIDERS = [
  // Design Tools
  { id: "canva", name: "Canva", category: "design", icon: "palette" },
  { id: "adobe_cc", name: "Adobe Creative Cloud", category: "design", icon: "palette" },
  { id: "figma", name: "Figma", category: "design", icon: "palette" },
  { id: "miro", name: "Miro", category: "design", icon: "palette" },
  // AI Subscriptions (fixed monthly, NOT per-token API usage)
  { id: "chatgpt_plus", name: "ChatGPT Plus", category: "ai", icon: "brain" },
  { id: "claude_pro", name: "Claude Pro", category: "ai", icon: "sparkles" },
  { id: "gemini_advanced", name: "Gemini Advanced", category: "ai", icon: "gem" },
  { id: "copilot", name: "GitHub Copilot", category: "ai", icon: "code" },
  { id: "cursor", name: "Cursor", category: "ai", icon: "code" },
  { id: "lovable", name: "Lovable", category: "ai", icon: "sparkles" },
  { id: "v0", name: "v0", category: "ai", icon: "sparkles" },
  { id: "windsurf", name: "Windsurf", category: "ai", icon: "code" },
  { id: "replit", name: "Replit", category: "ai", icon: "code" },
  // Productivity
  { id: "notion", name: "Notion", category: "productivity", icon: "file-text" },
  { id: "confluence", name: "Confluence", category: "productivity", icon: "file-text" },
  { id: "asana", name: "Asana", category: "productivity", icon: "check-square" },
  { id: "monday", name: "Monday.com", category: "productivity", icon: "check-square" },
  // Communication
  { id: "slack", name: "Slack", category: "communication", icon: "message-square" },
  { id: "zoom", name: "Zoom", category: "communication", icon: "video" },
  { id: "teams", name: "Microsoft Teams", category: "communication", icon: "users" },
  // Development
  { id: "github", name: "GitHub", category: "development", icon: "github" },
  { id: "gitlab", name: "GitLab", category: "development", icon: "gitlab" },
  { id: "jira", name: "Jira", category: "development", icon: "clipboard" },
  { id: "linear", name: "Linear", category: "development", icon: "clipboard" },
  { id: "vercel", name: "Vercel", category: "development", icon: "triangle" },
  { id: "netlify", name: "Netlify", category: "development", icon: "globe" },
  { id: "railway", name: "Railway", category: "development", icon: "server" },
  { id: "supabase", name: "Supabase", category: "development", icon: "database" },
  // Custom
  { id: "custom", name: "Custom", category: "other", icon: "plus" },
] as const

export type SaaSProvider = typeof COMMON_SAAS_PROVIDERS[number]
export type SaaSCategory = SaaSProvider["category"]
