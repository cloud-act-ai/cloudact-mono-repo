/**
 * Dashboard Cost Calculators
 *
 * Centralized calculation helpers for cost dashboard pages.
 * Eliminates hardcoded calculations from individual dashboard components.
 * Uses FinOps standard 30-day months for all forecasts.
 *
 * @example
 * ```typescript
 * import {
 *   getDateInfo,
 *   calculateDashboardTableRow,
 *   calculateBreakdownItem,
 *   PROVIDER_CONFIG,
 *   CATEGORY_CONFIG,
 *   FINOPS,
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
 *
 * // Use FinOps constants
 * const dailyRate = totalCost / FINOPS.DAYS_PER_YEAR
 * ```
 */

import type { BreakdownItem, CostTableRow } from "@/components/charts"
import { FINOPS, isValidNumber, calculateAllForecasts as calculateFinOpsForecasts } from "./constants"

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

// SaaS Provider Configuration
export const SAAS_PROVIDER_CONFIG: EntityConfig = {
  names: {}, // Use provider names as-is
  colors: {
    slack: "#4A154B",
    notion: "#000000",
    figma: "#F24E1E",
    github: "#24292F",
    atlassian: "#0052CC",
    salesforce: "#00A1E0",
    zoom: "#2D8CFF",
    hubspot: "#FF7A59",
    zendesk: "#03363D",
    intercom: "#1F8DED",
    asana: "#F06A6A",
    monday: "#FF3D57",
    linear: "#5E6AD2",
    jira: "#0052CC",
    confluence: "#172B4D",
    dropbox: "#0061FF",
    box: "#0061D5",
    google_workspace: "#4285F4",
    microsoft_365: "#D83B01",
  },
  defaultColor: "#FF6C5E",
  defaultType: "SaaS Subscription",
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
    subscription: "Subscriptions",
  },
  colors: {
    genai: "#10A37F",
    cloud: "#4285F4",
    subscription: "#FF6C5E",
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
// Rate & Forecast Calculations (FinOps Standard)
// ============================================

/**
 * Calculate daily rate from MTD cost.
 * Uses actual days elapsed for accurate daily rate.
 */
export function calculateDailyRateFromMTD(mtdCost: number, daysElapsed: number): number {
  if (!isValidNumber(mtdCost) || !isValidNumber(daysElapsed) || daysElapsed <= 0) return 0
  return mtdCost / daysElapsed
}

/**
 * Calculate monthly forecast from daily rate.
 * Uses FinOps standard 30-day month for consistency.
 *
 * Note: daysInMonth parameter is IGNORED - we always use FINOPS.DAYS_PER_MONTH (30)
 * for standardized forecasting. Parameter kept for backward compatibility.
 */
export function calculateMonthlyForecast(dailyRate: number, _daysInMonth?: number): number {
  if (!isValidNumber(dailyRate)) return 0
  return dailyRate * FINOPS.DAYS_PER_MONTH
}

/**
 * Calculate annual forecast from monthly forecast.
 * Uses 12 months per year.
 */
export function calculateAnnualForecast(monthlyForecast: number): number {
  if (!isValidNumber(monthlyForecast)) return 0
  return monthlyForecast * FINOPS.MONTHS_PER_YEAR
}

/**
 * Calculate all forecast values from MTD cost.
 * Uses FinOps standard 30-day month for monthly forecasts.
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
  // Use FinOps 30-day standard, not actual days in month
  const monthlyForecast = calculateMonthlyForecast(dailyRate)
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
 * Transform provider data to cost table row with forecasts.
 * Uses FinOps standard 30-day months for all forecasts.
 *
 * @param provider - Provider data from API
 * @param _dateInfo - Date info (kept for backward compatibility, not used)
 * @param config - Entity configuration for names/colors
 * @param daysInPeriod - Days in the data period (default: 365)
 */
export function calculateProviderTableRow(
  provider: ProviderData,
  _dateInfo: DateInfo,
  config: EntityConfig,
  daysInPeriod: number = FINOPS.DAYS_PER_YEAR
): CostTableRow {
  // Calculate forecasts using FinOps standards
  const { dailyRate, monthlyForecast, annualForecast } = calculateFinOpsForecasts(
    provider.total_cost,
    daysInPeriod
  )

  return {
    id: provider.provider,
    name: getEntityName(provider.provider, config),
    type: config.defaultType,
    count: provider.record_count,
    value: provider.total_cost, // Show actual total in Amount column
    dailyCost: dailyRate,
    monthlyCost: monthlyForecast,
    annualCost: annualForecast,
  }
}

/**
 * Transform category data to cost table row with forecasts.
 * Uses FinOps standard 30-day months for all forecasts.
 *
 * @param category - Category data from API
 * @param _dateInfo - Date info (kept for backward compatibility, not used)
 * @param config - Entity configuration for names/colors
 * @param daysInPeriod - Days in the data period (default: 365)
 */
export function calculateCategoryTableRow(
  category: CategoryData,
  _dateInfo: DateInfo,
  config: EntityConfig = CATEGORY_CONFIG,
  daysInPeriod: number = FINOPS.DAYS_PER_YEAR
): CostTableRow {
  // Calculate forecasts using FinOps standards
  const { dailyRate, monthlyForecast, annualForecast } = calculateFinOpsForecasts(
    category.total_cost,
    daysInPeriod
  )

  return {
    id: category.category,
    name: getEntityName(category.category, config),
    count: category.count,
    value: category.total_cost, // Show actual total in Amount column
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
 * Handles null/undefined providers array safely
 */
export function transformProvidersToTableRows(
  providers: ProviderData[] | null | undefined,
  dateInfo: DateInfo,
  config: EntityConfig
): CostTableRow[] {
  if (!providers || !Array.isArray(providers)) return []
  return providers.map(p => calculateProviderTableRow(p, dateInfo, config))
}

/**
 * Transform array of categories to table rows
 * Handles null/undefined categories array safely
 */
export function transformCategoriesToTableRows(
  categories: CategoryData[] | null | undefined,
  dateInfo: DateInfo,
  config: EntityConfig = CATEGORY_CONFIG
): CostTableRow[] {
  if (!categories || !Array.isArray(categories)) return []
  return categories.map(c => calculateCategoryTableRow(c, dateInfo, config))
}

/**
 * Transform array of providers to breakdown items (sorted by value)
 * Handles null/undefined providers array safely
 */
export function transformProvidersToBreakdownItems(
  providers: ProviderData[] | null | undefined,
  config: EntityConfig
): BreakdownItem[] {
  if (!providers || !Array.isArray(providers)) return []
  return [...providers]
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(p => calculateProviderBreakdownItem(p, config))
}

/**
 * Transform array of categories to breakdown items (sorted by value)
 * Handles null/undefined categories array safely
 */
export function transformCategoriesToBreakdownItems(
  categories: CategoryData[] | null | undefined,
  config: EntityConfig = CATEGORY_CONFIG
): BreakdownItem[] {
  if (!categories || !Array.isArray(categories)) return []
  return [...categories]
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(c => calculateCategoryBreakdownItem(c, config))
}

// ============================================
// Provider Categorization (Future-Proof)
// ============================================

/**
 * Cloud provider identifiers - canonical names
 * Backend should ideally provide `category` field, this is fallback
 */
export const CLOUD_PROVIDER_SET = new Set([
  // Primary identifiers
  "gcp", "aws", "azure", "oci",
  // Alternative names
  "google_cloud", "google-cloud", "googlecloud",
  "amazon_web_services", "amazon-web-services", "amazonwebservices",
  "microsoft_azure", "microsoft-azure", "microsoftazure",
  "oracle_cloud", "oracle-cloud", "oraclecloud",
  // Service-specific
  "gcp_billing", "aws_billing", "azure_billing", "oci_billing",
])

/**
 * GenAI/LLM provider identifiers - canonical names
 * Backend should ideally provide `category` field, this is fallback
 */
export const GENAI_PROVIDER_SET = new Set([
  // Primary identifiers
  "openai", "anthropic", "gemini", "deepseek", "perplexity",
  "cohere", "mistral", "groq", "together", "replicate",
  // Alternative names
  "google_ai", "google-ai", "claude",
  // Hosted/Managed variants
  "azure_openai", "azure-openai", "azureopenai",
  "aws_bedrock", "aws-bedrock", "awsbedrock",
  "gcp_vertex", "gcp-vertex", "vertexai", "vertex_ai",
])

/**
 * Pattern-based provider detection for unknown providers
 * Returns: "cloud" | "genai" | "subscription" | null
 */
export function detectProviderCategory(provider: string): "cloud" | "genai" | "subscription" | null {
  if (!provider || typeof provider !== "string") return null

  const normalized = provider.toLowerCase().trim()

  // Check exact match first
  if (CLOUD_PROVIDER_SET.has(normalized)) return "cloud"
  if (GENAI_PROVIDER_SET.has(normalized)) return "genai"

  // Pattern-based detection for unknown providers
  const cloudPatterns = [
    /^(gcp|aws|azure|oci)[-_]?/,  // Starts with cloud prefix
    /[-_](cloud|billing|infrastructure)$/,  // Ends with cloud suffix
    /^(google|amazon|microsoft|oracle)[-_]?(cloud|web|azure)/,  // Full names
  ]

  const genaiPatterns = [
    /[-_]?(ai|llm|gpt|chat|completion)[-_]?/,  // AI-related keywords
    /^(openai|anthropic|claude|gemini|deepseek|mistral|cohere)/,  // Known AI prefixes
    /(bedrock|vertex|sagemaker)[-_]?(ai)?$/,  // Managed AI services
  ]

  for (const pattern of cloudPatterns) {
    if (pattern.test(normalized)) return "cloud"
  }

  for (const pattern of genaiPatterns) {
    if (pattern.test(normalized)) return "genai"
  }

  // Unknown provider - assume subscription (SaaS)
  return null
}

/**
 * Check if provider is cloud type
 */
export function isCloudProvider(provider: string | null | undefined): boolean {
  if (!provider) return false
  return detectProviderCategory(provider) === "cloud"
}

/**
 * Check if provider is GenAI type
 */
export function isGenAIProvider(provider: string | null | undefined): boolean {
  if (!provider) return false
  return detectProviderCategory(provider) === "genai"
}

/**
 * Filter providers to only cloud providers
 * Handles null/undefined providers array safely
 * Uses pattern matching for unknown providers
 */
export function filterCloudProviders<T extends { provider?: string | null }>(
  providers: T[] | null | undefined
): T[] {
  if (!providers || !Array.isArray(providers)) return []
  return providers.filter(p => isCloudProvider(p.provider))
}

/**
 * Filter providers to only GenAI/LLM providers
 * Handles null/undefined providers array safely
 * Uses pattern matching for unknown providers
 */
export function filterGenAIProviders<T extends { provider?: string | null }>(
  providers: T[] | null | undefined
): T[] {
  if (!providers || !Array.isArray(providers)) return []
  return providers.filter(p => isGenAIProvider(p.provider))
}

/**
 * Filter providers to subscription (not cloud, not genai)
 */
export function filterSubscriptionProviders<T extends { provider?: string | null }>(
  providers: T[] | null | undefined
): T[] {
  if (!providers || !Array.isArray(providers)) return []
  return providers.filter(p => {
    if (!p.provider) return false
    const category = detectProviderCategory(p.provider)
    return category === null || category === "subscription"
  })
}

// ============================================
// NOTE: Aggregation functions removed
// Backend handles all aggregations via /api/v1/costs/*
// Use summary.by_category and summary.by_provider from API response
// ============================================

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

// ============================================
// Extended Period Date Calculations
// ============================================

export interface PeriodDateRange {
  /** Start date (YYYY-MM-DD format for API) */
  startDate: string
  /** End date (YYYY-MM-DD format for API) */
  endDate: string
  /** Display label */
  label: string
  /** Number of days in period */
  days: number
}

/**
 * Format date as YYYY-MM-DD for API calls
 */
function formatDateForApi(date: Date): string {
  return date.toISOString().split("T")[0]
}

/**
 * Get yesterday's date range (data is always up to yesterday due to pipeline processing)
 */
export function getYesterdayRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  return {
    startDate: formatDateForApi(yesterday),
    endDate: formatDateForApi(yesterday),
    label: "Yesterday",
    days: 1,
  }
}

/**
 * Get week to date range (Monday to yesterday)
 */
export function getWTDRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  // Find Monday of current week
  const dayOfWeek = yesterday.getDay()
  const monday = new Date(yesterday)
  monday.setDate(yesterday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  monday.setHours(0, 0, 0, 0)

  const days = Math.ceil((yesterday.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(monday),
    endDate: formatDateForApi(yesterday),
    label: "WTD",
    days: Math.max(1, days),
  }
}

/**
 * Get last week's full date range (previous Monday to Sunday)
 */
export function getLastWeekRange(): PeriodDateRange {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  // Find Monday of current week
  const dayOfWeek = today.getDay()
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  // Last week's Monday and Sunday
  const lastMonday = new Date(currentMonday)
  lastMonday.setDate(currentMonday.getDate() - 7)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)

  return {
    startDate: formatDateForApi(lastMonday),
    endDate: formatDateForApi(lastSunday),
    label: "Last Week",
    days: 7,
  }
}

/**
 * Get month to date range (1st of month to yesterday)
 */
export function getMTDRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1)
  const days = Math.ceil((yesterday.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(monthStart),
    endDate: formatDateForApi(yesterday),
    label: "MTD",
    days: Math.max(1, days),
  }
}

/**
 * Get previous month's full date range
 */
export function getPreviousMonthRange(): PeriodDateRange {
  const now = new Date()
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of prev month
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1)

  const monthName = prevMonthStart.toLocaleDateString("en-US", { month: "short" })

  return {
    startDate: formatDateForApi(prevMonthStart),
    endDate: formatDateForApi(prevMonthEnd),
    label: monthName,
    days: prevMonthEnd.getDate(),
  }
}

/**
 * Get last 2 months date range
 */
export function getLast2MonthsRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const twoMonthsAgo = new Date(yesterday)
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  twoMonthsAgo.setDate(1) // Start of that month

  const days = Math.ceil((yesterday.getTime() - twoMonthsAgo.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(twoMonthsAgo),
    endDate: formatDateForApi(yesterday),
    label: "Last 2 Months",
    days,
  }
}

/**
 * Get year to date range (Jan 1 to yesterday)
 */
export function getYTDRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const yearStart = new Date(yesterday.getFullYear(), 0, 1) // Jan 1
  const days = Math.ceil((yesterday.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(yearStart),
    endDate: formatDateForApi(yesterday),
    label: "YTD",
    days,
  }
}

/**
 * Get fiscal year date range (Apr 1 to Mar 31 by default)
 * For forecasting, we use the current fiscal year boundaries
 */
export function getFiscalYearRange(fiscalStartMonth: number = 4): PeriodDateRange {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  // Determine fiscal year start
  let fyStartYear = currentYear
  if (currentMonth < fiscalStartMonth) {
    fyStartYear = currentYear - 1
  }

  const fyStart = new Date(fyStartYear, fiscalStartMonth - 1, 1)
  const fyEnd = new Date(fyStartYear + 1, fiscalStartMonth - 1, 0) // Last day before next FY

  const days = Math.ceil((fyEnd.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(fyStart),
    endDate: formatDateForApi(fyEnd),
    label: `FY${fyStartYear + 1}`,
    days,
  }
}

/**
 * Get fiscal year to date range (FY start to yesterday)
 */
export function getFYTDRange(fiscalStartMonth: number = 4): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const currentYear = yesterday.getFullYear()
  const currentMonth = yesterday.getMonth() + 1 // 1-12

  // Determine fiscal year start
  let fyStartYear = currentYear
  if (currentMonth < fiscalStartMonth) {
    fyStartYear = currentYear - 1
  }

  const fyStart = new Date(fyStartYear, fiscalStartMonth - 1, 1)
  const days = Math.ceil((yesterday.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return {
    startDate: formatDateForApi(fyStart),
    endDate: formatDateForApi(yesterday),
    label: "FYTD",
    days: Math.max(1, days),
  }
}

/**
 * Calculate fiscal year forecast based on FYTD spend and days remaining
 */
export function calculateFiscalYearForecast(
  fytdCost: number,
  fytdDays: number,
  fyTotalDays: number
): number {
  if (!Number.isFinite(fytdCost) || fytdDays <= 0 || fyTotalDays <= 0) {
    return 0
  }
  const dailyRate = fytdCost / fytdDays
  return dailyRate * fyTotalDays
}

/**
 * Get last 30 days range
 */
export function getLast30DaysRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const thirtyDaysAgo = new Date(yesterday)
  thirtyDaysAgo.setDate(yesterday.getDate() - 29) // 30 days including yesterday

  return {
    startDate: formatDateForApi(thirtyDaysAgo),
    endDate: formatDateForApi(yesterday),
    label: "Last 30 Days",
    days: 30,
  }
}

/**
 * Get previous 30 days range (30 days before last 30 days)
 */
export function getPrevious30DaysRange(): PeriodDateRange {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  // End of previous period = 30 days ago
  const periodEnd = new Date(yesterday)
  periodEnd.setDate(yesterday.getDate() - 30)

  // Start of previous period = 59 days ago
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodEnd.getDate() - 29)

  return {
    startDate: formatDateForApi(periodStart),
    endDate: formatDateForApi(periodEnd),
    label: "Previous 30 Days",
    days: 30,
  }
}

/**
 * Get specific month range by name
 */
export function getSpecificMonthRange(monthsAgo: number = 0): PeriodDateRange {
  const now = new Date()
  const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)

  const monthName = targetMonth.toLocaleDateString("en-US", { month: "short" })
  const days = monthEnd.getDate()

  return {
    startDate: formatDateForApi(targetMonth),
    endDate: formatDateForApi(monthEnd),
    label: monthName,
    days,
  }
}

/**
 * Get November range (2 months ago from Jan 2026)
 */
export function getNovemberRange(): PeriodDateRange {
  const now = new Date()
  // Calculate November based on current date
  const novYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const novStart = new Date(novYear, 10, 1) // November is month 10 (0-indexed)
  const novEnd = new Date(novYear, 11, 0) // Last day of November

  return {
    startDate: formatDateForApi(novStart),
    endDate: formatDateForApi(novEnd),
    label: "Nov",
    days: 30,
  }
}

/**
 * Get December range (1 month ago from Jan 2026)
 */
export function getDecemberRange(): PeriodDateRange {
  const now = new Date()
  // Calculate December based on current date
  const decYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const decStart = new Date(decYear, 11, 1) // December is month 11 (0-indexed)
  const decEnd = new Date(decYear, 12, 0) // Last day of December

  return {
    startDate: formatDateForApi(decStart),
    endDate: formatDateForApi(decEnd),
    label: "Dec",
    days: 31,
  }
}

// ============================================
// Daily Trend Data Generation (DEPRECATED)
// ============================================

export interface DailyTrendDataPoint {
  /** Label for X-axis (day number) */
  label: string
  /** Cost value for the day */
  value: number
  /** Full date string (YYYY-MM-DD) */
  date: string
}

/**
 * @deprecated Use `useCostData().getDailyTrendForRange(timeRange)` instead.
 * This function generates fake deterministic data based on MTD cost.
 * The context-based approach uses real daily cost data from the backend.
 *
 * Generate deterministic daily trend data for charts
 * Uses a seeded variance function to ensure consistent rendering
 * across re-renders and page navigations.
 *
 * @param mtdCost - Month-to-date cost total
 * @param days - Number of days to generate (default: 14)
 * @returns Array of daily trend data points
 */
export function generateDailyTrendData(
  mtdCost: number,
  days: number = 14
): DailyTrendDataPoint[] {
  const today = new Date()
  const currentDayOfMonth = today.getDate()
  const dailyAvg = currentDayOfMonth > 0 ? mtdCost / currentDayOfMonth : 0

  // Deterministic seed function based on date
  // Produces consistent values for the same day
  const seededVariance = (dayOffset: number): number => {
    const seed = currentDayOfMonth * 31 + dayOffset * 7
    const x = Math.sin(seed) * 10000
    return 0.7 + (x - Math.floor(x)) * 0.6
  }

  const trendData: DailyTrendDataPoint[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dayLabel = date.getDate().toString()
    const variance = seededVariance(i)
    // Today uses actual daily average, past days use variance
    const dayValue = i === 0 ? dailyAvg : dailyAvg * variance

    trendData.push({
      label: dayLabel,
      value: Math.round(dayValue * 100) / 100,
      date: date.toISOString().split("T")[0],
    })
  }

  return trendData
}

/**
 * Extended period metrics for comprehensive dashboard display
 */
export interface ExtendedPeriodMetrics {
  /** Yesterday's cost */
  yesterday: number
  /** Week to date */
  wtd: number
  /** Last full week */
  lastWeek: number
  /** Month to date */
  mtd: number
  /** Previous full month */
  previousMonth: number
  /** Last 2 months */
  last2Months: number
  /** Year to date */
  ytd: number
  /** Fiscal year to date */
  fytd: number
  /** Forecast for full fiscal year */
  fyForecast: number
  /** Daily average rate */
  dailyRate: number
  /** Monthly forecast */
  monthlyForecast: number
  /** Data last updated date */
  dataAsOf: string
}
