/**
 * Cost Data Filters
 *
 * Filter and group cost records client-side for fast chart interactions.
 */

import type { CostRecord } from "@/actions/costs"
import type { DateRange, GroupedCostData, TimeSeriesPoint, CostFilterOptions } from "./types"

// ============================================
// Filter Functions
// ============================================

/**
 * Filter records by date range
 *
 * DATE-002 FIX: Use string comparison for date boundaries to avoid timezone issues.
 * ChargePeriodStart is in ISO format (YYYY-MM-DDTHH:mm:ss), so we extract the date
 * portion and compare as strings for consistent behavior across timezones.
 */
export function filterByDateRange(records: CostRecord[], range: DateRange): CostRecord[] {
  if (!records || !Array.isArray(records)) return []
  if (!range || !range.start || !range.end) return records

  // DATE-002 FIX: Convert Date objects to YYYY-MM-DD strings for consistent comparison
  const startDateStr = range.start.toISOString().split("T")[0]
  const endDateStr = range.end.toISOString().split("T")[0]

  return records.filter((r) => {
    if (!r.ChargePeriodStart) return false
    // Extract date portion (YYYY-MM-DD) from ISO string
    const recordDateStr = r.ChargePeriodStart.split("T")[0]
    // String comparison is timezone-agnostic for YYYY-MM-DD format
    return recordDateStr >= startDateStr && recordDateStr <= endDateStr
  })
}

/**
 * Filter records by providers
 */
export function filterByProvider(records: CostRecord[], providers: string[]): CostRecord[] {
  const lowerProviders = providers.map((p) => p.toLowerCase())
  return records.filter((r) =>
    lowerProviders.includes(r.ServiceProviderName?.toLowerCase() || "")
  )
}

/**
 * Filter records by categories
 */
export function filterByCategory(
  records: CostRecord[],
  categories: ("Cloud" | "SaaS" | "LLM")[]
): CostRecord[] {
  const lowerCategories = categories.map((c) => c.toLowerCase())
  return records.filter((r) =>
    lowerCategories.includes(r.ServiceCategory?.toLowerCase() || "")
  )
}

/**
 * Filter records by minimum amount
 */
export function filterByMinAmount(records: CostRecord[], minAmount: number): CostRecord[] {
  return records.filter((r) => (r.EffectiveCost || r.BilledCost || 0) >= minAmount)
}

/**
 * Filter records by maximum amount
 */
export function filterByMaxAmount(records: CostRecord[], maxAmount: number): CostRecord[] {
  return records.filter((r) => (r.EffectiveCost || r.BilledCost || 0) <= maxAmount)
}

/**
 * Apply multiple filters at once
 */
export function applyFilters(records: CostRecord[], options: CostFilterOptions): CostRecord[] {
  let filtered = records

  if (options.dateRange) {
    filtered = filterByDateRange(filtered, options.dateRange)
  }

  if (options.providers && options.providers.length > 0) {
    filtered = filterByProvider(filtered, options.providers)
  }

  if (options.categories && options.categories.length > 0) {
    filtered = filterByCategory(filtered, options.categories)
  }

  if (options.minAmount !== undefined) {
    filtered = filterByMinAmount(filtered, options.minAmount)
  }

  if (options.maxAmount !== undefined) {
    filtered = filterByMaxAmount(filtered, options.maxAmount)
  }

  return filtered
}

// ============================================
// Grouping Functions
// ============================================

/**
 * Sum costs from records
 * Handles NaN and null values safely
 */
export function sumCosts(records: CostRecord[]): number {
  if (!records || !Array.isArray(records)) return 0

  return records.reduce((sum, r) => {
    const cost = r.EffectiveCost ?? r.BilledCost ?? 0
    return sum + (Number.isFinite(cost) ? cost : 0)
  }, 0)
}

/**
 * Group records by day
 */
export function groupByDay(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    if (!record.ChargePeriodStart) continue
    const dateKey = record.ChargePeriodStart.split("T")[0]
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(dateKey) || 0
    grouped.set(dateKey, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

/**
 * Group records by week (ISO week starting Monday)
 * Handles NaN and null values safely
 */
export function groupByWeek(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    if (!record.ChargePeriodStart) continue
    const date = new Date(record.ChargePeriodStart)
    if (isNaN(date.getTime())) continue

    // Get Monday of the week
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date)
    monday.setDate(diff)
    const weekKey = monday.toISOString().split("T")[0]

    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(weekKey) || 0
    grouped.set(weekKey, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

/**
 * Group records by month
 * Handles NaN and null values safely
 */
export function groupByMonth(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    if (!record.ChargePeriodStart) continue
    const date = new Date(record.ChargePeriodStart)
    if (isNaN(date.getTime())) continue

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(monthKey) || 0
    grouped.set(monthKey, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

/**
 * Group records by provider
 * Handles NaN, null, and empty string values safely
 */
export function groupByProvider(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    // Handle empty string as "Unknown" too
    const provider = record.ServiceProviderName?.trim() || "Unknown"
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(provider) || 0
    grouped.set(provider, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

/**
 * Group records by category
 * Handles NaN, null, and empty string values safely
 */
export function groupByCategory(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    const category = record.ServiceCategory?.trim() || "Unknown"
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(category) || 0
    grouped.set(category, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

/**
 * Group records by service
 * Handles NaN, null, and empty string values safely
 */
export function groupByService(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()
  if (!records || !Array.isArray(records)) return grouped

  for (const record of records) {
    const service = record.ServiceName?.trim() || "Unknown"
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = grouped.get(service) || 0
    grouped.set(service, current + (Number.isFinite(cost) ? cost : 0))
  }

  return grouped
}

// ============================================
// Chart Data Transformations
// ============================================

/**
 * Convert grouped map to sorted array for charts
 */
export function toGroupedArray(
  grouped: Map<string, number>,
  sortBy: "key" | "value" = "value"
): GroupedCostData[] {
  const total = Array.from(grouped.values()).reduce((sum, v) => sum + v, 0)

  const result: GroupedCostData[] = Array.from(grouped.entries()).map(([key, value]) => ({
    key,
    total: value,
    percentage: total > 0 ? (value / total) * 100 : 0,
    recordCount: 0, // Would need to track this separately if needed
  }))

  if (sortBy === "value") {
    result.sort((a, b) => b.total - a.total)
  } else {
    result.sort((a, b) => a.key.localeCompare(b.key))
  }

  return result
}

/**
 * Convert records to time series for trend charts
 */
export function toTimeSeries(
  records: CostRecord[],
  granularity: "daily" | "weekly" | "monthly" = "daily"
): TimeSeriesPoint[] {
  let grouped: Map<string, number>

  switch (granularity) {
    case "weekly":
      grouped = groupByWeek(records)
      break
    case "monthly":
      grouped = groupByMonth(records)
      break
    default:
      grouped = groupByDay(records)
  }

  // Sort by date
  const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return sortedEntries.map(([date, total]) => ({
    date,
    total,
  }))
}

/**
 * Convert records to time series with provider breakdown
 * Handles NaN, null, and empty values safely
 */
export function toTimeSeriesWithProviders(
  records: CostRecord[],
  granularity: "daily" | "weekly" | "monthly" = "daily"
): TimeSeriesPoint[] {
  const grouped = new Map<string, { total: number; providers: Record<string, number> }>()
  if (!records || !Array.isArray(records)) return []

  for (const record of records) {
    // Skip records with missing or invalid ChargePeriodStart
    if (!record.ChargePeriodStart) continue

    const date = new Date(record.ChargePeriodStart)
    if (isNaN(date.getTime())) continue

    let dateKey: string

    switch (granularity) {
      case "weekly": {
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(date)
        monday.setDate(diff)
        dateKey = monday.toISOString().split("T")[0]
        break
      }
      case "monthly":
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        break
      default:
        dateKey = record.ChargePeriodStart.split("T")[0]
    }

    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const safeCost = Number.isFinite(cost) ? cost : 0
    const provider = record.ServiceProviderName?.trim() || "Unknown"

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { total: 0, providers: {} })
    }

    const entry = grouped.get(dateKey)!
    entry.total += safeCost
    entry.providers[provider] = (entry.providers[provider] || 0) + safeCost
  }

  const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return sortedEntries.map(([date, data]) => ({
    date,
    total: data.total,
    providers: data.providers,
  }))
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get unique providers from records
 */
export function getUniqueProviders(records: CostRecord[]): string[] {
  const providers = new Set<string>()
  for (const record of records) {
    if (record.ServiceProviderName) {
      providers.add(record.ServiceProviderName)
    }
  }
  return Array.from(providers).sort()
}

/**
 * Get unique categories from records
 */
export function getUniqueCategories(records: CostRecord[]): string[] {
  const categories = new Set<string>()
  for (const record of records) {
    if (record.ServiceCategory) {
      categories.add(record.ServiceCategory)
    }
  }
  return Array.from(categories).sort()
}

/**
 * Get unique services from records
 */
export function getUniqueServices(records: CostRecord[]): string[] {
  const services = new Set<string>()
  for (const record of records) {
    if (record.ServiceName) {
      services.add(record.ServiceName)
    }
  }
  return Array.from(services).sort()
}

/**
 * Get date range from records
 * Handles null, undefined, and invalid date values safely
 */
export function getDateRangeFromRecords(records: CostRecord[]): DateRange | null {
  if (!records || !Array.isArray(records) || records.length === 0) return null

  // Find first valid date to initialize min/max
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const record of records) {
    if (!record.ChargePeriodStart) continue

    const date = new Date(record.ChargePeriodStart)
    if (isNaN(date.getTime())) continue

    if (minDate === null || date < minDate) minDate = date
    if (maxDate === null || date > maxDate) maxDate = date
  }

  // No valid dates found
  if (minDate === null || maxDate === null) return null

  return {
    start: minDate,
    end: maxDate,
    label: `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`,
  }
}

// ============================================
// Granular Data Filters (for trend-granular endpoint)
// ============================================

/**
 * Granular cost data row from /costs/{org}/trend-granular endpoint.
 * Pre-aggregated by date + provider + hierarchy for client-side filtering.
 */
export interface GranularCostRow {
  date: string  // "2024-01-15"
  provider: string  // "openai"
  category: "genai" | "cloud" | "subscription" | "other"
  dept_id: string | null
  project_id: string | null
  team_id: string | null
  total_cost: number
  record_count: number
}

/**
 * Filter options for granular data
 */
export interface GranularFilterOptions {
  dateRange?: DateRange
  providers?: string[]
  categories?: ("genai" | "cloud" | "subscription" | "other")[]
  departmentId?: string
  projectId?: string
  teamId?: string
}

/**
 * Filter granular data by date range
 *
 * DATE-001 FIX: Use string comparison for date boundaries to avoid timezone issues.
 * Row dates are in "YYYY-MM-DD" format, so we compare against range boundaries
 * also formatted as "YYYY-MM-DD" strings to ensure consistent behavior across timezones.
 */
export function filterGranularByDateRange(
  data: GranularCostRow[],
  range: DateRange
): GranularCostRow[] {
  if (!data || !Array.isArray(data) || !range) return data || []

  // DATE-001 FIX: Convert Date objects to YYYY-MM-DD strings for consistent comparison
  // This avoids timezone boundary issues where new Date("2024-01-15") could be
  // interpreted as a different day depending on local timezone
  const startDateStr = range.start.toISOString().split("T")[0]
  const endDateStr = range.end.toISOString().split("T")[0]

  return data.filter(row => {
    if (!row.date) return false
    // String comparison is timezone-agnostic for YYYY-MM-DD format
    return row.date >= startDateStr && row.date <= endDateStr
  })
}

/**
 * Filter granular data by providers
 */
export function filterGranularByProvider(
  data: GranularCostRow[],
  providers: string[]
): GranularCostRow[] {
  if (!data || !providers || providers.length === 0) return data || []

  const lowerProviders = new Set(providers.map(p => p.toLowerCase()))
  return data.filter(row => lowerProviders.has(row.provider?.toLowerCase() || ""))
}

/**
 * Filter granular data by category (genai, cloud, subscription, other)
 */
export function filterGranularByCategory(
  data: GranularCostRow[],
  categories: ("genai" | "cloud" | "subscription" | "other")[]
): GranularCostRow[] {
  if (!data || !categories || categories.length === 0) return data || []

  const categorySet = new Set(categories)
  return data.filter(row => categorySet.has(row.category))
}

/**
 * Filter granular data by department ID
 */
export function filterGranularByDepartment(
  data: GranularCostRow[],
  departmentId: string
): GranularCostRow[] {
  if (!data || !departmentId) return data || []
  return data.filter(row => row.dept_id === departmentId)
}

/**
 * Filter granular data by project ID
 */
export function filterGranularByProject(
  data: GranularCostRow[],
  projectId: string
): GranularCostRow[] {
  if (!data || !projectId) return data || []
  return data.filter(row => row.project_id === projectId)
}

/**
 * Filter granular data by team ID
 */
export function filterGranularByTeam(
  data: GranularCostRow[],
  teamId: string
): GranularCostRow[] {
  if (!data || !teamId) return data || []
  return data.filter(row => row.team_id === teamId)
}

/**
 * Apply all granular filters at once
 * This is the main function for client-side filtering of granular data
 */
export function applyGranularFilters(
  data: GranularCostRow[],
  options: GranularFilterOptions
): GranularCostRow[] {
  let filtered = data || []

  if (options.dateRange) {
    filtered = filterGranularByDateRange(filtered, options.dateRange)
  }

  if (options.providers && options.providers.length > 0) {
    filtered = filterGranularByProvider(filtered, options.providers)
  }

  if (options.categories && options.categories.length > 0) {
    filtered = filterGranularByCategory(filtered, options.categories)
  }

  if (options.departmentId) {
    filtered = filterGranularByDepartment(filtered, options.departmentId)
  }

  if (options.projectId) {
    filtered = filterGranularByProject(filtered, options.projectId)
  }

  if (options.teamId) {
    filtered = filterGranularByTeam(filtered, options.teamId)
  }

  return filtered
}

/**
 * Aggregate granular data to time series (sum by date)
 */
export function granularToTimeSeries(data: GranularCostRow[]): { date: string; total: number }[] {
  if (!data || !Array.isArray(data)) return []

  const byDate = new Map<string, number>()

  for (const row of data) {
    const current = byDate.get(row.date) || 0
    byDate.set(row.date, current + (row.total_cost || 0))
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }))
}

/**
 * DATA-001 FIX: Safe number extraction that handles NaN/Infinity
 */
function safeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return value
}

/**
 * ROUND-001 FIX: Consistent percentage calculation (0.1% precision)
 */
function calculatePercentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((value / total) * 1000) / 10
}

/**
 * Aggregate granular data to provider breakdown
 */
export function granularToProviderBreakdown(
  data: GranularCostRow[]
): { provider: string; total_cost: number; percentage: number; record_count: number }[] {
  if (!data || !Array.isArray(data)) return []

  const byProvider = new Map<string, { total_cost: number; record_count: number }>()
  let grandTotal = 0

  for (const row of data) {
    // DATA-001 FIX: Use safeNumber to handle NaN/Infinity
    const cost = safeNumber(row.total_cost)
    const current = byProvider.get(row.provider) || { total_cost: 0, record_count: 0 }
    byProvider.set(row.provider, {
      total_cost: current.total_cost + cost,
      record_count: current.record_count + 1,
    })
    grandTotal += cost
  }

  return Array.from(byProvider.entries())
    .sort(([, a], [, b]) => b.total_cost - a.total_cost)
    .map(([provider, { total_cost, record_count }]) => ({
      provider,
      total_cost,
      // ROUND-001 FIX: Use consistent percentage calculation
      percentage: calculatePercentage(total_cost, grandTotal),
      record_count,
    }))
}

/**
 * Aggregate granular data to category breakdown
 */
export function granularToCategoryBreakdown(
  data: GranularCostRow[]
): { category: string; total_cost: number; percentage: number }[] {
  if (!data || !Array.isArray(data)) return []

  const byCategory = new Map<string, number>()
  let grandTotal = 0

  for (const row of data) {
    // DATA-001 FIX: Use safeNumber to handle NaN/Infinity
    const cost = safeNumber(row.total_cost)
    const current = byCategory.get(row.category) || 0
    byCategory.set(row.category, current + cost)
    grandTotal += cost
  }

  return Array.from(byCategory.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, total_cost]) => ({
      category,
      total_cost,
      // ROUND-001 FIX: Use consistent percentage calculation
      percentage: calculatePercentage(total_cost, grandTotal),
    }))
}

/**
 * Calculate total cost from granular data
 */
export function granularTotalCost(data: GranularCostRow[]): number {
  if (!data || !Array.isArray(data)) return 0
  // DATA-001 FIX: Use safeNumber to handle NaN/Infinity
  return data.reduce((sum, row) => sum + safeNumber(row.total_cost), 0)
}
