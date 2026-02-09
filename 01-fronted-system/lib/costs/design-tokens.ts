/**
 * Cost Dashboard Design Tokens
 *
 * Centralized color definitions and chart palettes for cost analytics.
 * Single source of truth for all provider and category colors.
 *
 * Usage:
 * ```typescript
 * import { PROVIDER_COLORS, getProviderColor, getChartColors } from "@/lib/costs/design-tokens"
 *
 * // Get specific provider color
 * const color = getProviderColor("openai") // "#10A37F"
 *
 * // Get chart colors for a list of items
 * const colors = getChartColors(providers, "genai")
 * ```
 */

// ============================================
// Provider Colors (GenAI)
// ============================================

export const GENAI_PROVIDER_COLORS = {
  // Primary LLM Providers
  openai: "#10A37F",
  anthropic: "#D97757",
  google: "#4285F4",
  google_ai: "#4285F4",
  gemini: "#8E75B2",
  deepseek: "#5865F2",
  perplexity: "#1FB8CD",

  // Secondary LLM Providers
  cohere: "#5046E5",
  mistral: "#FF7000",
  groq: "#F55036",
  together: "#6366F1",
  replicate: "#000000",

  // Managed/Hosted LLM
  azure_openai: "#0078D4",
  aws_bedrock: "#FF9900",
  gcp_vertex: "#4285F4",
  vertex_ai: "#4285F4",
} as const

// ============================================
// Provider Colors (Cloud)
// ============================================

export const CLOUD_PROVIDER_COLORS = {
  // Primary Cloud Providers
  gcp: "#4285F4",
  google_cloud: "#4285F4",
  aws: "#FF9900",
  amazon_web_services: "#FF9900",
  azure: "#0078D4",
  microsoft_azure: "#0078D4",

  // Secondary Cloud Providers
  oci: "#F80000",
  oracle_cloud: "#F80000",
  digitalocean: "#0080FF",
  linode: "#00A95C",
  vultr: "#007BFC",
} as const

// ============================================
// Provider Colors (SaaS/Subscriptions)
// ============================================

export const SAAS_PROVIDER_COLORS = {
  // Productivity
  slack: "#4A154B",
  notion: "#000000",
  asana: "#F06A6A",
  monday: "#FF3D57",
  linear: "#5E6AD2",

  // Development
  github: "#24292F",
  gitlab: "#FC6D26",
  atlassian: "#0052CC",
  jira: "#0052CC",
  confluence: "#172B4D",
  bitbucket: "#0052CC",

  // Design
  figma: "#F24E1E",
  canva: "#00C4CC",
  adobe: "#FF0000",
  miro: "#FFD02F",

  // Communication
  zoom: "#2D8CFF",
  teams: "#6264A7",
  google_meet: "#00897B",
  webex: "#00CF64",

  // CRM & Sales
  salesforce: "#00A1E0",
  hubspot: "#FF7A59",
  zendesk: "#03363D",
  intercom: "#1F8DED",

  // Cloud Storage
  dropbox: "#0061FF",
  box: "#0061D5",
  google_workspace: "#4285F4",
  microsoft_365: "#D83B01",
} as const

// ============================================
// Combined Provider Colors
// ============================================

export const PROVIDER_COLORS = {
  ...GENAI_PROVIDER_COLORS,
  ...CLOUD_PROVIDER_COLORS,
  ...SAAS_PROVIDER_COLORS,
} as const

// ============================================
// Category Colors
// ============================================

export const CATEGORY_COLORS = {
  // High-level cost categories
  genai: "#10A37F",
  cloud: "#4285F4",
  subscription: "#FF6C5E",

  // Subscription categories
  ai: "#10A37F",
  design: "#F24E1E",
  productivity: "#4285F4",
  communication: "#4A154B",
  development: "#24292F",
  infrastructure: "#3ECF8E",
  other: "#94a3b8",
} as const

// ============================================
// Chart Palettes
// ============================================

/**
 * Default chart color palette (8 colors)
 * Used when category is not specified
 */
export const DEFAULT_CHART_PALETTE = [
  "#4285F4", // Blue
  "#FF9900", // Orange
  "#10A37F", // Green
  "#D97757", // Coral
  "#8E75B2", // Purple
  "#00CED1", // Cyan
  "#FF6C5E", // Red
  "#FFD700", // Gold
] as const

/**
 * GenAI-themed chart palette
 */
export const GENAI_CHART_PALETTE = [
  "#10A37F", // OpenAI Green
  "#D97757", // Anthropic Coral
  "#4285F4", // Google Blue
  "#8E75B2", // Gemini Purple
  "#FF7000", // Mistral Orange
  "#5046E5", // Cohere Indigo
  "#0078D4", // Azure Blue
  "#FF9900", // AWS Orange
] as const

/**
 * Cloud-themed chart palette
 */
export const CLOUD_CHART_PALETTE = [
  "#4285F4", // GCP Blue
  "#FF9900", // AWS Orange
  "#0078D4", // Azure Blue
  "#F80000", // Oracle Red
  "#0080FF", // DigitalOcean Blue
  "#00A95C", // Linode Green
  "#00CED1", // Teal
  "#FF69B4", // Pink
] as const

/**
 * Subscription-themed chart palette
 */
export const SUBSCRIPTION_CHART_PALETTE = [
  "#FF6C5E", // Coral (primary)
  "#4A154B", // Slack Purple
  "#F24E1E", // Figma Orange
  "#24292F", // GitHub Dark
  "#0052CC", // Atlassian Blue
  "#00A1E0", // Salesforce Blue
  "#FF7A59", // HubSpot Orange
  "#5E6AD2", // Linear Purple
] as const

/**
 * Overview category palette (3 colors)
 */
export const OVERVIEW_CHART_PALETTE = [
  "#10A37F", // GenAI Green
  "#4285F4", // Cloud Blue
  "#FF6C5E", // Subscription Coral
] as const

// ============================================
// Monochromatic Ring Palettes (professional, single-hue)
// Each category gets shades from saturated → light for ring chart segments
// ============================================

/** GenAI green shades (dark → light) */
export const GENAI_MONO_PALETTE = [
  "#0D8A65",
  "#10A37F",
  "#40B89A",
  "#70CDB5",
  "#A0E2D0",
  "#D0F7EB",
] as const

/** Cloud blue shades (dark → light) */
export const CLOUD_MONO_PALETTE = [
  "#2968C8",
  "#4285F4",
  "#6BA0F6",
  "#94BBF8",
  "#BDD6FA",
  "#E6F1FC",
] as const

/** Subscription coral shades (dark → light) */
export const SUBSCRIPTION_MONO_PALETTE = [
  "#E0483C",
  "#FF6C5E",
  "#FF8E82",
  "#FFB0A6",
  "#FFD2CA",
  "#FFF4EE",
] as const

/**
 * Get monochromatic shade for ring chart segments
 * Gives each segment a distinct shade within the same color family
 */
export function getMonoShade(
  index: number,
  category: "genai" | "cloud" | "subscription"
): string {
  const palettes = {
    genai: GENAI_MONO_PALETTE,
    cloud: CLOUD_MONO_PALETTE,
    subscription: SUBSCRIPTION_MONO_PALETTE,
  }
  const palette = palettes[category]
  return palette[index % palette.length]
}

// ============================================
// Chart Palette Map
// ============================================

export const CHART_PALETTES = {
  default: DEFAULT_CHART_PALETTE,
  genai: GENAI_CHART_PALETTE,
  cloud: CLOUD_CHART_PALETTE,
  subscription: SUBSCRIPTION_CHART_PALETTE,
  overview: OVERVIEW_CHART_PALETTE,
} as const

export type ChartPaletteType = keyof typeof CHART_PALETTES

// ============================================
// Color Helper Functions
// ============================================

/**
 * Default color for unknown providers/categories
 */
export const DEFAULT_COLOR = "#94a3b8" // Slate gray

/**
 * Get color for a provider (case-insensitive)
 *
 * @param provider - Provider name (e.g., "openai", "AWS", "Slack")
 * @param category - Optional category hint for better color selection
 * @returns Hex color string
 */
export function getProviderColor(
  provider: string | null | undefined,
  category?: "genai" | "cloud" | "subscription"
): string {
  if (!provider) return DEFAULT_COLOR

  const normalized = provider.toLowerCase().trim()

  // Check specific provider colors first
  if (normalized in PROVIDER_COLORS) {
    return PROVIDER_COLORS[normalized as keyof typeof PROVIDER_COLORS]
  }

  // Category-specific fallback colors
  if (category) {
    return CATEGORY_COLORS[category] ?? DEFAULT_COLOR
  }

  return DEFAULT_COLOR
}

/**
 * Get color for a category
 *
 * @param category - Category name
 * @returns Hex color string
 */
export function getCategoryColor(category: string | null | undefined): string {
  if (!category) return DEFAULT_COLOR

  const normalized = category.toLowerCase().trim()

  if (normalized in CATEGORY_COLORS) {
    return CATEGORY_COLORS[normalized as keyof typeof CATEGORY_COLORS]
  }

  return DEFAULT_COLOR
}

/**
 * Get chart colors for a list of items
 * Uses provider colors when available, falls back to palette
 *
 * @param items - Array of items with key/provider property
 * @param category - Chart category for palette selection
 * @returns Array of hex color strings
 */
export function getChartColors(
  items: Array<{ key?: string; provider?: string; category?: string }>,
  category?: ChartPaletteType
): string[] {
  const palette = category ? CHART_PALETTES[category] : DEFAULT_CHART_PALETTE

  return items.map((item, index) => {
    const key = item.key ?? item.provider ?? item.category
    if (key) {
      const providerColor = getProviderColor(key, category as "genai" | "cloud" | "subscription")
      if (providerColor !== DEFAULT_COLOR) {
        return providerColor
      }
    }
    // Fall back to palette color
    return palette[index % palette.length]
  })
}

/**
 * Get a single color from the chart palette at an index
 *
 * @param index - Index in the palette (wraps around)
 * @param category - Chart category for palette selection
 * @returns Hex color string
 */
export function getChartColorAtIndex(
  index: number,
  category?: ChartPaletteType
): string {
  const palette = category ? CHART_PALETTES[category] : DEFAULT_CHART_PALETTE
  return palette[index % palette.length]
}

// ============================================
// Ring Chart Segment Colors
// ============================================

/**
 * Generate colors for ring chart segments
 * Uses provider colors when available, falls back to palette
 *
 * @param segments - Array of segments with key property
 * @param category - Chart category for palette selection
 * @returns Array of segments with colors assigned
 */
export function assignRingChartColors<T extends { key: string }>(
  segments: T[],
  category?: ChartPaletteType
): Array<T & { color: string }> {
  const colors = getChartColors(segments, category)
  return segments.map((segment, index) => ({
    ...segment,
    color: colors[index],
  }))
}

// ============================================
// Trend Line Colors
// ============================================

export const TREND_COLORS = {
  /** Primary trend line (bar chart) */
  primary: "#4285F4",
  /** Rolling average line */
  rollingAverage: "#FF6C5E",
  /** Positive trend */
  positive: "#10A37F",
  /** Negative trend */
  negative: "#FF6C5E",
  /** Neutral/unchanged */
  neutral: "#94a3b8",
} as const

/**
 * Get trend color based on direction
 *
 * @param change - Numeric change value
 * @returns Hex color string
 */
export function getTrendColor(change: number): string {
  if (change > 0) return TREND_COLORS.negative // Cost increase = bad
  if (change < 0) return TREND_COLORS.positive // Cost decrease = good
  return TREND_COLORS.neutral
}

// ============================================
// Status Colors
// ============================================

export const STATUS_COLORS = {
  success: "#10A37F",
  warning: "#FF9900",
  error: "#FF6C5E",
  info: "#4285F4",
  muted: "#94a3b8",
} as const
