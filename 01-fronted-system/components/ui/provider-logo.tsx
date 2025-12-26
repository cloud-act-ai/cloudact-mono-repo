"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Brain, Sparkles, Cloud, Code, MessageSquare,
  Palette, FileText, Layers, Box
} from "lucide-react"

/**
 * Provider Logo Component
 *
 * Uses local SVG files from /public/logos/providers/ for 100% reliability.
 * Falls back to Lucide icons for any providers without logos.
 *
 * Logo files location: public/logos/providers/{provider_id}.svg
 * Source: Downloaded from jsdelivr.net/npm/simple-icons
 */

// Map provider IDs to their local SVG filename
// Source of truth: data/seed/provider-logos.csv
const PROVIDER_LOGO_FILES: Record<string, string> = {
  // GenAI API Providers
  openai: "openai.svg",
  anthropic: "anthropic.svg",
  gemini: "gemini.svg",
  google_gemini: "gemini.svg",
  deepseek: "deepseek.svg",

  // AI Subscription Services
  chatgpt: "openai.svg",
  chatgpt_plus: "openai.svg",
  claude: "anthropic.svg",
  claude_pro: "anthropic.svg",
  gemini_advanced: "gemini.svg",
  copilot: "copilot.svg",
  github_copilot: "copilot.svg",
  cursor: "cursor.svg",
  replit: "replit.svg",
  windsurf: "windsurf.svg",
  v0: "v0.svg",
  lovable: "lovable.svg",

  // Design
  figma: "figma.svg",
  canva: "canva.svg",
  miro: "miro.svg",
  adobe_cc: "adobe_cc.svg",
  adobe_creative_cloud: "adobe_cc.svg",

  // Communication
  slack: "slack.svg",
  zoom: "zoom.svg",
  teams: "teams.svg",
  microsoft_teams: "teams.svg",

  // Development
  github: "github.svg",
  gitlab: "gitlab.svg",
  jira: "jira.svg",
  linear: "linear.svg",
  vercel: "v0.svg",
  supabase: "supabase.svg",

  // Productivity
  notion: "notion.svg",
  asana: "asana.svg",

  // Other
  zapier: "zapier.svg",
  adobe: "adobe.svg",
}

// Fallback Lucide icons by category
const CATEGORY_FALLBACKS: Record<string, React.ReactNode> = {
  ai: <Brain className="h-full w-full" />,
  genai: <Sparkles className="h-full w-full" />,
  design: <Palette className="h-full w-full" />,
  productivity: <FileText className="h-full w-full" />,
  communication: <MessageSquare className="h-full w-full" />,
  development: <Code className="h-full w-full" />,
  cloud: <Cloud className="h-full w-full" />,
  other: <Layers className="h-full w-full" />,
  default: <Box className="h-full w-full" />,
}

interface ProviderLogoProps {
  provider: string
  category?: string
  size?: number
  className?: string
  fallbackColor?: string
}

export function ProviderLogo({
  provider,
  category = "other",
  size = 20,
  className = "",
  fallbackColor = "currentColor",
}: ProviderLogoProps) {
  const [hasError, setHasError] = useState(false)

  // Normalize provider name for lookup
  const normalizedProvider = provider.toLowerCase().replace(/[\s-]+/g, "_")
  const logoFile = PROVIDER_LOGO_FILES[normalizedProvider]

  // If we have a logo file and no error, render the local SVG
  if (logoFile && !hasError) {
    const logoUrl = `/logos/providers/${logoFile}`

    return (
      <Image
        src={logoUrl}
        alt={`${provider} logo`}
        width={size}
        height={size}
        className={className}
        onError={() => setHasError(true)}
      />
    )
  }

  // Fallback to category-based Lucide icon
  const FallbackIcon = CATEGORY_FALLBACKS[category.toLowerCase()] || CATEGORY_FALLBACKS.default

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        color: fallbackColor
      }}
    >
      {FallbackIcon}
    </div>
  )
}

// Export the mapping for external use
export { PROVIDER_LOGO_FILES, CATEGORY_FALLBACKS }
