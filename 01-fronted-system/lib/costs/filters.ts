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
 * TZ-004 FIX: Convert Date to local YYYY-MM-DD string (shared helper for CostRecord filters)
 */
function toLocalDateStr(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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

  // TZ-004 FIX: Use local date conversion instead of toISOString() to avoid timezone shifts
  const startDateStr = toLocalDateStr(range.start)
  const endDateStr = toLocalDateStr(range.end)

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
 * FILTER-001 FIX: Filter out empty strings to prevent false positive matches
 */
export function filterByProvider(records: CostRecord[], providers: string[]): CostRecord[] {
  // FILTER-001 FIX: Filter out empty strings from providers to prevent matching null/undefined
  const lowerProviders = providers
    .filter((p) => p && p.trim())
    .map((p) => p.toLowerCase())
  if (lowerProviders.length === 0) return records
  return records.filter((r) =>
    r.ServiceProviderName && lowerProviders.includes(r.ServiceProviderName.toLowerCase())
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
 * TZ-002 FIX: Use local date conversion instead of toISOString()
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
    // TZ-002 FIX: Use local date string to avoid timezone shifts
    const weekKey = toLocalDateStr(monday)

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
 * TZ-003 FIX: Use local date conversion for weekly granularity
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
        // TZ-003 FIX: Use local date string to avoid timezone shifts
        dateKey = toLocalDateStr(monday)
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
 * FIX-012: Use undefined locale to use user's browser locale
 * FIX-013: Use UTC parsing to avoid timezone offset issues
 */
export function getDateRangeFromRecords(records: CostRecord[]): DateRange | null {
  if (!records || !Array.isArray(records) || records.length === 0) return null

  // Find first valid date to initialize min/max
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const record of records) {
    if (!record.ChargePeriodStart) continue

    // FIX-013: Parse date string as UTC to avoid timezone offset
    const dateStr = record.ChargePeriodStart.split("T")[0]
    const [year, month, day] = dateStr.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (isNaN(date.getTime())) continue

    if (minDate === null || date < minDate) minDate = date
    if (maxDate === null || date > maxDate) maxDate = date
  }

  // No valid dates found
  if (minDate === null || maxDate === null) return null

  // FIX-012: Use undefined locale to use user's browser locale
  return {
    start: minDate,
    end: maxDate,
    label: `${minDate.toLocaleDateString(undefined, { dateStyle: "medium" })} - ${maxDate.toLocaleDateString(undefined, { dateStyle: "medium" })}`,
  }
}

// ============================================
// Granular Data Filters (for trend-granular endpoint)
// ============================================

/**
 * Granular cost data row from /costs/{org}/trend-granular endpoint.
 * Pre-aggregated by date + provider + hierarchy for client-side filtering.
 *
 * FE-001 FIX: Updated to use new 5-field hierarchy model instead of
 * old dept_id/project_id/team_id fields. This supports the unified
 * hierarchy entity model with flexible levels.
 */
export interface GranularCostRow {
  date: string  // "2024-01-15"
  provider: string  // "openai"
  category: "genai" | "cloud" | "subscription" | "other"
  // New 5-field hierarchy model (FE-001)
  hierarchy_entity_id: string | null      // e.g., "DEPT-001", "PROJ-002", "TEAM-003"
  hierarchy_entity_name: string | null    // e.g., "Engineering", "Project Alpha"
  hierarchy_level_code: string | null     // "DEPT", "PROJ", "TEAM"
  hierarchy_path: string | null           // "/DEPT-001/PROJ-002/TEAM-003"
  hierarchy_path_names: string | null     // "/Engineering/Project Alpha/Backend Team"
  total_cost: number
  record_count: number
}

/**
 * Filter options for granular data
 *
 * Uses unified N-level hierarchy filters.
 */
export interface GranularFilterOptions {
  dateRange?: DateRange
  providers?: string[]
  categories?: ("genai" | "cloud" | "subscription" | "other")[]
  // Unified N-level hierarchy filter options
  hierarchyEntityId?: string      // Filter by specific entity ID
  hierarchyLevelCode?: string     // Filter by level (e.g., "department", "project", "team")
  hierarchyPathPrefix?: string    // Filter by path prefix (e.g., "/DEPT-001")
}

/**
 * TZ-001 FIX: Convert Date to local YYYY-MM-DD string without timezone shift
 * Using toISOString() can shift dates when user is in negative UTC offset
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

  // TZ-001 FIX: Use local date conversion instead of toISOString() to avoid timezone shifts
  // toISOString() converts to UTC which can shift the date by one day for users in
  // negative UTC offsets (e.g., 2024-01-15 00:00:00 PST becomes 2024-01-14 in UTC)
  const startDateStr = toLocalDateString(range.start)
  const endDateStr = toLocalDateString(range.end)

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
 * CHART-FIX: Case-insensitive matching to handle backend variations
 */
export function filterGranularByCategory(
  data: GranularCostRow[],
  categories: ("genai" | "cloud" | "subscription" | "other")[]
): GranularCostRow[] {
  if (!data || !categories || categories.length === 0) return data || []

  // CHART-FIX: Normalize to lowercase for case-insensitive matching
  const categorySet = new Set(categories.map(c => c.toLowerCase()))
  return data.filter(row => {
    const rowCategory = (row.category || "").toLowerCase()
    return categorySet.has(rowCategory)
  })
}

/**
 * EDGE-002/003/004 FIX: Level code normalization map.
 * Maps various level code formats to canonical forms for consistent filtering.
 * Supports both old (DEPT/PROJ/TEAM) and new (c_suite/business_unit/function) level codes.
 */
const LEVEL_CODE_ALIASES: Record<string, string[]> = {
  // Level 1: Department / C-Suite
  "department": ["department", "dept", "c_suite", "csuite", "c-suite"],
  "c_suite": ["department", "dept", "c_suite", "csuite", "c-suite"],
  "dept": ["department", "dept", "c_suite", "csuite", "c-suite"],
  // Level 2: Project / Business Unit
  "project": ["project", "proj", "business_unit", "businessunit", "business-unit"],
  "business_unit": ["project", "proj", "business_unit", "businessunit", "business-unit"],
  "proj": ["project", "proj", "business_unit", "businessunit", "business-unit"],
  // Level 3: Team / Function
  "team": ["team", "function", "func"],
  "function": ["team", "function", "func"],
  "func": ["team", "function", "func"],
}

/**
 * VAL-002 FIX: Validate entity ID format.
 * Entity IDs should be alphanumeric with optional hyphens/underscores.
 */
function isValidEntityId(entityId: string): boolean {
  if (!entityId || typeof entityId !== "string") return false
  // Allow alphanumeric, hyphens, underscores, max 100 chars
  return /^[a-zA-Z0-9_-]{1,100}$/.test(entityId)
}

/**
 * SEC-001 FIX: Validate path prefix to prevent traversal attacks.
 * Path must start with / and contain only valid characters.
 */
function isValidPathPrefix(pathPrefix: string): boolean {
  if (!pathPrefix || typeof pathPrefix !== "string") return false
  // Must start with /, no .., only alphanumeric/hyphen/underscore/slash
  if (pathPrefix.includes("..")) return false
  return /^\/[a-zA-Z0-9_\-\/]*$/.test(pathPrefix)
}

/**
 * EDGE-002/003/004 FIX: Normalize level code for comparison.
 * Returns all possible aliases for a given level code.
 */
function getLevelCodeAliases(levelCode: string): string[] {
  const normalized = levelCode.toLowerCase().trim()
  return LEVEL_CODE_ALIASES[normalized] || [normalized]
}

/**
 * FE-002 FIX: New generic hierarchy filter supporting the 5-field model.
 * Filters granular data by entity ID, level code, and/or path prefix.
 *
 * EDGE-002/003/004 FIX: Supports multiple level code formats:
 * - Old format: DEPT, PROJ, TEAM
 * - New format: c_suite, business_unit, function
 * - Legacy: department, project, team
 *
 * VAL-002 FIX: Validates entityId format before filtering.
 * SEC-001 FIX: Validates pathPrefix to prevent traversal attacks.
 *
 * @param data - Array of GranularCostRow to filter
 * @param entityId - Filter by specific hierarchy_entity_id (e.g., "DEPT-001")
 * @param levelCode - Filter by hierarchy_level_code (supports aliases)
 * @param pathPrefix - Filter rows where hierarchy_path starts with this prefix
 * @returns Filtered array of GranularCostRow
 */
export function filterGranularByHierarchy(
  data: GranularCostRow[],
  entityId?: string,
  levelCode?: string,
  pathPrefix?: string
): GranularCostRow[] {
  if (!data || !Array.isArray(data)) return []
  if (!entityId && !levelCode && !pathPrefix) return data

  // VAL-002 FIX: Validate entityId if provided
  if (entityId && !isValidEntityId(entityId)) {
    console.warn(`[filterGranularByHierarchy] Invalid entityId format: ${entityId}`)
    return []
  }

  // SEC-001 FIX: Validate pathPrefix if provided
  if (pathPrefix && !isValidPathPrefix(pathPrefix)) {
    console.warn(`[filterGranularByHierarchy] Invalid pathPrefix format: ${pathPrefix}`)
    return []
  }

  // EDGE-002/003/004 FIX: Get all aliases for the level code
  const levelCodeAliases = levelCode ? getLevelCodeAliases(levelCode) : null

  return data.filter(row => {
    // Filter by entity ID (exact match)
    if (entityId && row.hierarchy_entity_id !== entityId) return false

    // EDGE-002/003/004 FIX: Filter by level code with alias support (case-insensitive)
    if (levelCodeAliases && row.hierarchy_level_code) {
      const rowLevelLower = row.hierarchy_level_code.toLowerCase()
      if (!levelCodeAliases.includes(rowLevelLower)) return false
    } else if (levelCodeAliases && !row.hierarchy_level_code) {
      return false
    }

    // Filter by path prefix
    if (pathPrefix && !row.hierarchy_path?.startsWith(pathPrefix)) return false

    return true
  })
}

/**
 * Apply all granular filters at once
 * This is the main function for client-side filtering of granular data
 *
 * SCALE-001 FIX: Optimized from O(4n) to O(n) by combining all filters into single pass.
 * PERF-002 FIX: Single iteration instead of separate filter calls.
 * Uses unified N-level hierarchy filters.
 */
export function applyGranularFilters(
  data: GranularCostRow[],
  options: GranularFilterOptions
): GranularCostRow[] {
  if (!data || !Array.isArray(data)) return []

  // Early return if no filters
  const hasDateFilter = !!options.dateRange
  const hasProviderFilter = options.providers && options.providers.length > 0
  const hasCategoryFilter = options.categories && options.categories.length > 0
  const hasHierarchyFilter = options.hierarchyEntityId || options.hierarchyLevelCode || options.hierarchyPathPrefix

  if (!hasDateFilter && !hasProviderFilter && !hasCategoryFilter && !hasHierarchyFilter) {
    return data
  }

  // Pre-compute filter values for O(n) single pass (SCALE-001 FIX)
  let startDateStr: string | null = null
  let endDateStr: string | null = null
  if (hasDateFilter && options.dateRange) {
    startDateStr = toLocalDateString(options.dateRange.start)
    endDateStr = toLocalDateString(options.dateRange.end)
  }

  const lowerProviders = hasProviderFilter
    ? new Set(options.providers!.map(p => p.toLowerCase()))
    : null

  const lowerCategories = hasCategoryFilter
    ? new Set(options.categories!.map(c => c.toLowerCase()))
    : null

  // Pre-compute hierarchy filter values (unified N-level)
  let hierarchyEntityId: string | null = null
  let hierarchyLevelAliases: string[] | null = null
  let hierarchyPathPrefix: string | null = null

  if (hasHierarchyFilter) {
    hierarchyEntityId = options.hierarchyEntityId || null
    hierarchyLevelAliases = options.hierarchyLevelCode ? getLevelCodeAliases(options.hierarchyLevelCode) : null
    hierarchyPathPrefix = options.hierarchyPathPrefix || null

    // VAL-002 FIX: Validate inputs
    if (hierarchyEntityId && !isValidEntityId(hierarchyEntityId)) {
      console.warn(`[applyGranularFilters] Invalid entityId: ${hierarchyEntityId}`)
      return []
    }
    // FILTER-004 FIX: Only validate pathPrefix if it's a non-empty string
    // Allow null/undefined to mean "no path filter" rather than "invalid"
    if (hierarchyPathPrefix && hierarchyPathPrefix.length > 0 && !isValidPathPrefix(hierarchyPathPrefix)) {
      console.warn(`[applyGranularFilters] Invalid pathPrefix: ${hierarchyPathPrefix}`)
      // FILTER-004 FIX: Skip path filter rather than return empty - entity ID filter may still apply
      hierarchyPathPrefix = null
    }
  }

  // SCALE-001 FIX: Single pass filtering
  return data.filter(row => {
    // Date filter
    if (startDateStr && endDateStr) {
      if (!row.date || row.date < startDateStr || row.date > endDateStr) {
        return false
      }
    }

    // Provider filter
    if (lowerProviders) {
      if (!lowerProviders.has(row.provider?.toLowerCase() || "")) {
        return false
      }
    }

    // Category filter
    if (lowerCategories) {
      if (!lowerCategories.has((row.category || "").toLowerCase())) {
        return false
      }
    }

    // Hierarchy filter (supports both new and legacy via conversion above)
    if (hierarchyEntityId) {
      if (row.hierarchy_entity_id !== hierarchyEntityId) {
        return false
      }
    }

    if (hierarchyLevelAliases) {
      const rowLevelLower = row.hierarchy_level_code?.toLowerCase() || ""
      if (!hierarchyLevelAliases.includes(rowLevelLower)) {
        return false
      }
    }

    if (hierarchyPathPrefix) {
      if (!row.hierarchy_path?.startsWith(hierarchyPathPrefix)) {
        return false
      }
    }

    return true
  })
}

/**
 * Aggregate granular data to time series (sum by date)
 * FIX-022: Added null checks before array operations
 * FIX-023: Use safeNumber for edge case handling
 */
export function granularToTimeSeries(data: GranularCostRow[]): { date: string; total: number }[] {
  if (!data || !Array.isArray(data) || data.length === 0) return []

  const byDate = new Map<string, number>()

  for (const row of data) {
    // FIX-022: Skip rows with missing date
    if (!row?.date) continue
    const current = byDate.get(row.date) || 0
    // FIX-023: Use safeNumber to handle NaN/Infinity
    byDate.set(row.date, current + safeNumber(row.total_cost))
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
      // EDGE-004 FIX: Use row's record_count if available (pre-aggregated data)
      record_count: current.record_count + (row.record_count || 1),
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
