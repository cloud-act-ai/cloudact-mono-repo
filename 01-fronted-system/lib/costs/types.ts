/**
 * Cost Helper Types
 *
 * Shared types for the cost helper library.
 * Re-exports types from actions/costs.ts for convenience.
 */

// Re-export from server actions for consistency
export type {
  CostSummary as ApiCostSummary,
  CostRecord,
  ProviderBreakdown,
  ServiceBreakdown,
  CostTrendPoint,
  CostDataResponse,
  TotalCostSummary,
} from "@/actions/costs"

/**
 * Date range with start, end, and display label
 */
export interface DateRange {
  start: Date
  end: Date
  label: string
}

/**
 * Period comparison result
 */
export interface PeriodComparison {
  current: {
    total: number
    label: string
    recordCount: number
  }
  previous: {
    total: number
    label: string
    recordCount: number
  }
  change: number
  changePercent: number
  trend: "up" | "down" | "flat"
}

/**
 * Calculated cost summary (frontend)
 */
export interface CostSummary {
  total: number
  dailyAverage: number
  monthlyRunRate: number
  annualRunRate: number
  mtd: number
  ytd: number
  forecastMonthly: number
  forecastAnnual: number
  byProvider: Map<string, number>
  byCategory: Map<string, number>
  recordCount: number
  dateRange: DateRange
}

/**
 * Grouped cost data for charts
 */
export interface GroupedCostData {
  key: string
  total: number
  percentage: number
  recordCount: number
}

/**
 * Time series data point for trend charts
 */
export interface TimeSeriesPoint {
  date: string
  total: number
  providers?: Record<string, number>
  categories?: Record<string, number>
}

/**
 * Cost filter options
 */
export interface CostFilterOptions {
  dateRange?: DateRange
  providers?: string[]
  categories?: ("Cloud" | "SaaS" | "LLM")[]
  minAmount?: number
  maxAmount?: number
}

/**
 * Fiscal year configuration
 */
export interface FiscalYearConfig {
  startMonth: number // 1-12 (e.g., 4 for April)
  startDay: number // 1-31
}

/**
 * Default fiscal year: April 1 - March 31
 */
export const DEFAULT_FISCAL_YEAR_CONFIG: FiscalYearConfig = {
  startMonth: 4,
  startDay: 1,
}
