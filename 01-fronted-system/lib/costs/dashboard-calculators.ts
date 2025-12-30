/**
 * Dashboard Cost Calculators
 *
 * Centralized calculation helpers for cost dashboard pages.
 * Eliminates hardcoded calculations from individual dashboard components.
 *
 * @example
 * ```typescript
 * import {
 *   getDateInfo,
 *   calculateDashboardTableRow,
 *   calculateBreakdownItem,
 *   PROVIDER_CONFIG,
 *   CATEGORY_CONFIG,
 * } from "@/lib/costs/dashboard-calculators"
 *
 * // Get date info once for all calculations
 * const dateInfo = getDateInfo()
 *
 * // Transform provider to table row
 * const row = calculateDashboardTableRow(provider, dateInfo, PROVIDER_CONFIG)
 *
 * // Transform to breakdown item for charts
 * const item = calculateBreakdownItem(category, CATEGORY_CONFIG)
 * ```
 */

import type { BreakdownItem, CostTableRow } from "@/components/costs"

// ============================================
// Types
// ============================================

export interface DateInfo {
  /** Current date object (cached for consistency) */
  now: Date
  /** Number of days in current month */
  daysInMonth: number
  /** Days elapsed in current month (min 1 to avoid division by zero) */
  daysElapsed: number
  /** First day of current month (UTC) */
  monthStart: Date
  /** Last day of current month (UTC) */
  monthEnd: Date
  /** Current year */
  year: number
  /** Current month (0-indexed) */
  month: number
}

export interface ProviderData {
  provider: string
  total_cost: number
  record_count?: number
  percentage?: number
}

export interface CategoryData {
  category: string
  total_cost: number
  count?: number
  percentage?: number
}

export interface EntityConfig {
  names: Record<string, string>
  colors: Record<string, string>
  defaultColor: string
  defaultType?: string
}

// ============================================
// Provider Configuration (GenAI + Cloud)
// ============================================

export const GENAI_PROVIDER_CONFIG: EntityConfig = {
  names: {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google AI",
    gemini: "Google Gemini",
    cohere: "Cohere",
    mistral: "Mistral AI",
    azure_openai: "Azure OpenAI",
    aws_bedrock: "AWS Bedrock",
  },
  colors: {
    openai: "#10A37F",
    anthropic: "#D97757",
    google: "#4285F4",
    gemini: "#8E75B2",
    cohere: "#5046E5",
    mistral: "#FF7000",
    azure_openai: "#0078D4",
    aws_bedrock: "#FF9900",
  },
  defaultColor: "#94a3b8",
  defaultType: "LLM API",
}

export const CLOUD_PROVIDER_CONFIG: EntityConfig = {
  names: {
    gcp: "Google Cloud",
    aws: "Amazon Web Services",
    azure: "Microsoft Azure",
    google_cloud: "Google Cloud",
    amazon_web_services: "Amazon Web Services",
    microsoft_azure: "Microsoft Azure",
  },
  colors: {
    gcp: "#4285F4",
    google_cloud: "#4285F4",
    aws: "#FF9900",
    amazon_web_services: "#FF9900",
    azure: "#0078D4",
    microsoft_azure: "#0078D4",
  },
  defaultColor: "#94a3b8",
  defaultType: "Cloud Infrastructure",
}

// ============================================
// Category Configuration (Subscriptions)
// ============================================

export const CATEGORY_CONFIG: EntityConfig = {
  names: {
    ai: "AI & ML",
    design: "Design",
    productivity: "Productivity",
    communication: "Communication",
    development: "Development",
    cloud: "Cloud & Infrastructure",
    other: "Other",
  },
  colors: {
    ai: "#10A37F",
    design: "#F24E1E",
    productivity: "#4285F4",
    communication: "#4A154B",
    development: "#181717",
    cloud: "#3ECF8E",
    other: "#94a3b8",
  },
  defaultColor: "#94a3b8",
}

// ============================================
// Overview Category Configuration
// ============================================

export const OVERVIEW_CATEGORY_CONFIG: EntityConfig = {
  names: {
    genai: "GenAI",
    cloud: "Cloud",
    saas: "SaaS",
  },
  colors: {
    genai: "#10A37F",
    cloud: "#4285F4",
    saas: "#FF6C5E",
  },
  defaultColor: "#94a3b8",
}

// ============================================
// Date Calculations
// ============================================

/**
 * Get cached date information for consistent calculations.
 * Call once per render cycle and pass to all calculation functions.
 */
export function getDateInfo(): DateInfo {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Days elapsed (min 1 to avoid division by zero)
  const daysElapsed = Math.max(1, now.getDate())

  // Month boundaries (UTC)
  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))

  return {
    now,
    daysInMonth,
    daysElapsed,
    monthStart,
    monthEnd,
    year,
    month,
  }
}

/**
 * Check if a date string is within current month
 */
export function isInCurrentMonth(dateStr: string | null | undefined, dateInfo: DateInfo): boolean {
  if (!dateStr) return false

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return false

  return date.getTime() >= dateInfo.monthStart.getTime() &&
         date.getTime() <= dateInfo.monthEnd.getTime()
}

// ============================================
// Rate & Forecast Calculations
// ============================================

/**
 * Calculate daily rate from MTD cost
 */
export function calculateDailyRateFromMTD(mtdCost: number, daysElapsed: number): number {
  if (!Number.isFinite(mtdCost) || daysElapsed <= 0) return 0
  return mtdCost / daysElapsed
}

/**
 * Calculate monthly forecast from daily rate
 */
export function calculateMonthlyForecast(dailyRate: number, daysInMonth: number): number {
  if (!Number.isFinite(dailyRate) || daysInMonth <= 0) return 0
  return dailyRate * daysInMonth
}

/**
 * Calculate annual forecast from monthly forecast
 */
export function calculateAnnualForecast(monthlyForecast: number): number {
  if (!Number.isFinite(monthlyForecast)) return 0
  return monthlyForecast * 12
}

/**
 * Calculate all forecast values from MTD cost
 */
export function calculateForecasts(
  mtdCost: number,
  dateInfo: DateInfo
): {
  dailyRate: number
  monthlyForecast: number
  annualForecast: number
} {
  const dailyRate = calculateDailyRateFromMTD(mtdCost, dateInfo.daysElapsed)
  const monthlyForecast = calculateMonthlyForecast(dailyRate, dateInfo.daysInMonth)
  const annualForecast = calculateAnnualForecast(monthlyForecast)

  return { dailyRate, monthlyForecast, annualForecast }
}

// ============================================
// Entity Name & Color Resolution
// ============================================

/**
 * Get display name for an entity (provider/category)
 */
export function getEntityName(key: string | null | undefined, config: EntityConfig): string {
  if (!key) return "Unknown"
  const normalizedKey = key.toLowerCase()
  return config.names[normalizedKey] ?? key
}

/**
 * Get color for an entity (provider/category)
 */
export function getEntityColor(key: string | null | undefined, config: EntityConfig): string {
  if (!key) return config.defaultColor
  const normalizedKey = key.toLowerCase()
  return config.colors[normalizedKey] ?? config.defaultColor
}

// ============================================
// Table Row Transformation
// ============================================

/**
 * Transform provider data to cost table row with forecasts
 */
export function calculateProviderTableRow(
  provider: ProviderData,
  dateInfo: DateInfo,
  config: EntityConfig
): CostTableRow {
  const { dailyRate, monthlyForecast, annualForecast } = calculateForecasts(
    provider.total_cost,
    dateInfo
  )

  const providerKey = provider.provider?.toLowerCase() ?? ""

  return {
    id: provider.provider,
    name: getEntityName(provider.provider, config),
    type: config.defaultType,
    count: provider.record_count,
    dailyCost: dailyRate,
    monthlyCost: monthlyForecast,
    annualCost: annualForecast,
  }
}

/**
 * Transform category data to cost table row with forecasts
 */
export function calculateCategoryTableRow(
  category: CategoryData,
  dateInfo: DateInfo,
  config: EntityConfig = CATEGORY_CONFIG
): CostTableRow {
  const { dailyRate, monthlyForecast, annualForecast } = calculateForecasts(
    category.total_cost,
    dateInfo
  )

  return {
    id: category.category,
    name: getEntityName(category.category, config),
    count: category.count,
    dailyCost: dailyRate,
    monthlyCost: monthlyForecast,
    annualCost: annualForecast,
  }
}

// ============================================
// Breakdown Item Transformation
// ============================================

/**
 * Transform provider data to breakdown chart item
 */
export function calculateProviderBreakdownItem(
  provider: ProviderData,
  config: EntityConfig
): BreakdownItem {
  return {
    key: provider.provider,
    name: getEntityName(provider.provider, config),
    value: provider.total_cost,
    count: provider.record_count,
    percentage: provider.percentage ?? 0,
    color: getEntityColor(provider.provider, config),
  }
}

/**
 * Transform category data to breakdown chart item
 */
export function calculateCategoryBreakdownItem(
  category: CategoryData,
  config: EntityConfig = CATEGORY_CONFIG
): BreakdownItem {
  return {
    key: category.category,
    name: getEntityName(category.category, config),
    value: category.total_cost,
    count: category.count,
    percentage: category.percentage ?? 0,
    color: getEntityColor(category.category, config),
  }
}

// ============================================
// Batch Transformations
// ============================================

/**
 * Transform array of providers to table rows
 */
export function transformProvidersToTableRows(
  providers: ProviderData[],
  dateInfo: DateInfo,
  config: EntityConfig
): CostTableRow[] {
  return providers.map(p => calculateProviderTableRow(p, dateInfo, config))
}

/**
 * Transform array of categories to table rows
 */
export function transformCategoriesToTableRows(
  categories: CategoryData[],
  dateInfo: DateInfo,
  config: EntityConfig = CATEGORY_CONFIG
): CostTableRow[] {
  return categories.map(c => calculateCategoryTableRow(c, dateInfo, config))
}

/**
 * Transform array of providers to breakdown items (sorted by value)
 */
export function transformProvidersToBreakdownItems(
  providers: ProviderData[],
  config: EntityConfig
): BreakdownItem[] {
  return [...providers]
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(p => calculateProviderBreakdownItem(p, config))
}

/**
 * Transform array of categories to breakdown items (sorted by value)
 */
export function transformCategoriesToBreakdownItems(
  categories: CategoryData[],
  config: EntityConfig = CATEGORY_CONFIG
): BreakdownItem[] {
  return [...categories]
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(c => calculateCategoryBreakdownItem(c, config))
}

// ============================================
// Provider Sets (for filtering)
// ============================================

export const CLOUD_PROVIDER_SET = new Set([
  "gcp", "aws", "azure",
  "google_cloud", "amazon_web_services", "microsoft_azure"
])

export const GENAI_PROVIDER_SET = new Set([
  "openai", "anthropic", "google", "gemini",
  "cohere", "mistral", "azure_openai", "aws_bedrock"
])

/**
 * Filter providers to only cloud providers
 */
export function filterCloudProviders<T extends { provider?: string | null }>(
  providers: T[]
): T[] {
  return providers.filter(p => {
    if (!p.provider || typeof p.provider !== "string") return false
    return CLOUD_PROVIDER_SET.has(p.provider.toLowerCase())
  })
}

/**
 * Filter providers to only GenAI/LLM providers
 */
export function filterGenAIProviders<T extends { provider?: string | null }>(
  providers: T[]
): T[] {
  return providers.filter(p => {
    if (!p.provider || typeof p.provider !== "string") return false
    return GENAI_PROVIDER_SET.has(p.provider.toLowerCase())
  })
}

// ============================================
// Category Aggregation
// ============================================

export interface RawSubscriptionRecord {
  ServiceCategory?: string | null
  ResourceId?: string | null
  ServiceName?: string | null
  EffectiveCost?: number | null
  ChargePeriodStart?: string | null
}

/**
 * Aggregate raw subscription records into category breakdown
 * Filters to current month and counts unique subscriptions per category
 */
export function aggregateByCategory(
  records: RawSubscriptionRecord[],
  dateInfo: DateInfo
): CategoryData[] {
  if (!records || records.length === 0) return []

  const categoryMap: Record<string, { total: number; uniqueIds: Set<string> }> = {}
  let totalCost = 0

  for (const record of records) {
    // Filter to current month only
    if (!isInCurrentMonth(record.ChargePeriodStart, dateInfo)) {
      continue
    }

    const category = record.ServiceCategory?.toLowerCase() || "other"
    const resourceId = record.ResourceId || record.ServiceName || "unknown"

    if (!categoryMap[category]) {
      categoryMap[category] = { total: 0, uniqueIds: new Set() }
    }

    const cost = record.EffectiveCost ?? 0
    const safeCost = Number.isFinite(cost) ? cost : 0

    categoryMap[category].total += safeCost
    categoryMap[category].uniqueIds.add(resourceId)
    totalCost += safeCost
  }

  return Object.entries(categoryMap)
    .map(([category, data]) => ({
      category,
      total_cost: data.total,
      count: data.uniqueIds.size,
      percentage: totalCost > 0 ? (data.total / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost)
}

/**
 * Aggregate raw subscription records by provider
 * Filters to current month and counts unique subscriptions per provider
 */
export function aggregateByProvider(
  records: RawSubscriptionRecord[],
  dateInfo: DateInfo,
  providerField: keyof RawSubscriptionRecord = "ServiceCategory"
): ProviderData[] {
  if (!records || records.length === 0) return []

  interface ProviderMap {
    totalCost: number
    uniqueIds: Set<string>
  }

  const providerMap: Record<string, ProviderMap> = {}
  let totalCost = 0

  for (const record of records) {
    // Filter to current month only
    if (!isInCurrentMonth(record.ChargePeriodStart, dateInfo)) {
      continue
    }

    const provider = String(record[providerField] || "Unknown")
    const resourceId = record.ResourceId || record.ServiceName || "unknown"

    if (!providerMap[provider]) {
      providerMap[provider] = { totalCost: 0, uniqueIds: new Set() }
    }

    const cost = record.EffectiveCost ?? 0
    const safeCost = Number.isFinite(cost) ? cost : 0

    providerMap[provider].totalCost += safeCost
    providerMap[provider].uniqueIds.add(resourceId)
    totalCost += safeCost
  }

  return Object.entries(providerMap)
    .filter(([name]) => name && name.trim() !== "" && name !== "Unknown")
    .map(([name, data]) => ({
      provider: name,
      total_cost: data.totalCost,
      record_count: data.uniqueIds.size,
      percentage: totalCost > 0 ? (data.totalCost / totalCost) * 100 : 0,
    }))
    .filter(p => p.total_cost > 0)
    .sort((a, b) => b.total_cost - a.total_cost)
}

// ============================================
// Safe Value Extraction
// ============================================

/**
 * Safely extract a numeric value from a nested object
 */
export function getSafeValue(obj: unknown, key: string): number {
  if (obj && typeof obj === "object" && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    return typeof val === "number" && Number.isFinite(val) ? val : 0
  }
  return 0
}

/**
 * Calculate percentage with safety checks
 */
export function calculatePercentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0
  }
  return (value / total) * 100
}
