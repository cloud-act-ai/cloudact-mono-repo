"use client"

/**
 * Shared hooks for cost dashboard pages.
 *
 * Eliminates duplicated dailyTrendData transformation and summaryData
 * calculation across Overview, GenAI, Cloud, and Subscription pages.
 */

import { useMemo } from "react"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { getRollingAverageLabel, type CostSummaryData } from "@/components/costs"
import { calculateAllForecasts } from "@/lib/costs"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// ============================================
// Types
// ============================================

export interface TrendDataPoint {
  label: string
  value: number
  lineValue: number
  date: string
}

// ============================================
// useDailyTrendData
// ============================================

/**
 * Transform time-filtered time series into chart-ready daily trend data.
 * Handles edge cases: invalid dates, NaN values, locale-aware labels,
 * and adaptive formatting for large datasets (90+ days).
 */
export function useDailyTrendData(): TrendDataPoint[] {
  const { getFilteredTimeSeries } = useCostData()

  return useMemo(() => {
    const timeSeries = getFilteredTimeSeries()
    if (!timeSeries || timeSeries.length === 0) return []

    // Calculate rolling average (overall period average as flat reference line)
    const totalCost = timeSeries.reduce((sum, d) => sum + (Number.isFinite(d.total) ? d.total : 0), 0)
    const avgDaily = timeSeries.length > 0 ? totalCost / timeSeries.length : 0
    const rollingAvg = Number.isFinite(avgDaily) ? avgDaily : 0

    return timeSeries
      .filter((point) => {
        if (!point.date) return false
        const date = new Date(point.date)
        return !isNaN(date.getTime())
      })
      .map((point) => {
        const date = new Date(point.date)
        // Adaptive label: day number for 90+ days, month+day otherwise
        const label = timeSeries.length >= 90
          ? date.toLocaleDateString(undefined, { day: "numeric" })
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

        return {
          label,
          value: Number.isFinite(point.total) ? point.total : 0,
          lineValue: Math.round(rollingAvg * 100) / 100,
          date: point.date,
        }
      })
  }, [getFilteredTimeSeries])
}

// ============================================
// useCostSummary
// ============================================

/**
 * Calculate summary metrics (period spend, daily rate, forecast, YTD)
 * from time-filtered daily trend data. Used by CostSummaryGrid.
 */
export function useCostSummary(
  dailyTrendData: TrendDataPoint[],
  timeRange: TimeRange,
): CostSummaryData {
  const { currency: cachedCurrency } = useCostData()
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY

  return useMemo(() => {
    const filteredTotal = dailyTrendData.reduce((sum, d) => sum + d.value, 0)
    const daysInPeriod = dailyTrendData.length || 1
    const dailyRate = filteredTotal / daysInPeriod

    const { monthlyForecast } = calculateAllForecasts(filteredTotal, daysInPeriod)

    return {
      mtd: filteredTotal,
      dailyRate,
      forecast: monthlyForecast,
      ytd: filteredTotal,
      currency: orgCurrency,
    }
  }, [dailyTrendData, timeRange, orgCurrency])
}

// ============================================
// useRollingAvgLabel
// ============================================

/**
 * Get the rolling average label based on selected time range.
 */
export function useRollingAvgLabel(
  timeRange: TimeRange,
  customRange?: CustomDateRange
): string {
  return useMemo(() => getRollingAverageLabel(timeRange, customRange), [timeRange, customRange])
}
