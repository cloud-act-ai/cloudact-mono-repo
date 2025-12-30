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
 */
export function filterByDateRange(records: CostRecord[], range: DateRange): CostRecord[] {
  if (!records || !Array.isArray(records)) return []
  if (!range || !range.start || !range.end) return records

  return records.filter((r) => {
    if (!r.ChargePeriodStart) return false
    const date = new Date(r.ChargePeriodStart)
    if (isNaN(date.getTime())) return false
    return date >= range.start && date <= range.end
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
 */
export function groupByWeek(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()

  for (const record of records) {
    const date = new Date(record.ChargePeriodStart)
    // Get Monday of the week
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date)
    monday.setDate(diff)
    const weekKey = monday.toISOString().split("T")[0]

    const current = grouped.get(weekKey) || 0
    grouped.set(weekKey, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  return grouped
}

/**
 * Group records by month
 */
export function groupByMonth(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()

  for (const record of records) {
    const date = new Date(record.ChargePeriodStart)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

    const current = grouped.get(monthKey) || 0
    grouped.set(monthKey, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  return grouped
}

/**
 * Group records by provider
 */
export function groupByProvider(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()

  for (const record of records) {
    const provider = record.ServiceProviderName || "Unknown"
    const current = grouped.get(provider) || 0
    grouped.set(provider, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  return grouped
}

/**
 * Group records by category
 */
export function groupByCategory(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()

  for (const record of records) {
    const category = record.ServiceCategory || "Unknown"
    const current = grouped.get(category) || 0
    grouped.set(category, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  return grouped
}

/**
 * Group records by service
 */
export function groupByService(records: CostRecord[]): Map<string, number> {
  const grouped = new Map<string, number>()

  for (const record of records) {
    const service = record.ServiceName || "Unknown"
    const current = grouped.get(service) || 0
    grouped.set(service, current + (record.EffectiveCost || record.BilledCost || 0))
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
 */
export function toTimeSeriesWithProviders(
  records: CostRecord[],
  granularity: "daily" | "weekly" | "monthly" = "daily"
): TimeSeriesPoint[] {
  const grouped = new Map<string, { total: number; providers: Record<string, number> }>()

  for (const record of records) {
    const date = new Date(record.ChargePeriodStart)
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

    const cost = record.EffectiveCost || record.BilledCost || 0
    const provider = record.ServiceProviderName || "Unknown"

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { total: 0, providers: {} })
    }

    const entry = grouped.get(dateKey)!
    entry.total += cost
    entry.providers[provider] = (entry.providers[provider] || 0) + cost
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
 */
export function getDateRangeFromRecords(records: CostRecord[]): DateRange | null {
  if (records.length === 0) return null

  let minDate = new Date(records[0].ChargePeriodStart)
  let maxDate = new Date(records[0].ChargePeriodStart)

  for (const record of records) {
    const date = new Date(record.ChargePeriodStart)
    if (date < minDate) minDate = date
    if (date > maxDate) maxDate = date
  }

  return {
    start: minDate,
    end: maxDate,
    label: `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`,
  }
}
