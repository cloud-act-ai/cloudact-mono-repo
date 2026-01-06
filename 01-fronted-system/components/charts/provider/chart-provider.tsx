"use client"

/**
 * Chart Provider
 *
 * Global context for unified chart configuration including:
 * - Currency formatting (from CostDataContext)
 * - Theme colors (CloudAct design system)
 * - Time range state (synced with zoom/brush)
 * - Filter state passthrough
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import { useCostDataOptional, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { formatCost, formatCostCompact } from "@/lib/costs/formatters"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// ============================================
// Theme Configuration
// ============================================

export interface ChartTheme {
  /** Primary brand color (Mint) */
  primary: string
  /** Primary light (hover) */
  primaryLight: string
  /** Primary dark (pressed) */
  primaryDark: string
  /** Secondary color (Blue) */
  secondary: string
  /** Accent color (Coral) */
  accent: string
  /** Background color */
  background: string
  /** Card background */
  cardBackground: string
  /** Grid line color */
  grid: string
  /** Text color */
  text: string
  /** Muted text color */
  mutedText: string
  /** Category-specific colors */
  categories: {
    genai: string
    cloud: string
    subscription: string
  }
  /** Default color palette for series */
  palette: string[]
  /** Animation durations */
  animation: {
    fast: number
    normal: number
    slow: number
  }
  /** Border radius tokens */
  radius: {
    sm: number
    md: number
    lg: number
  }
  /** Shadow tokens */
  shadows: {
    tooltip: string
    card: string
    cardHover: string
    glow: string
  }
}

export const defaultChartTheme: ChartTheme = {
  // Brand colors
  primary: "#90FCA6",        // Mint
  primaryLight: "#B8FDCA",   // Mint Light
  primaryDark: "#6EE890",    // Mint Dark
  secondary: "#4285F4",      // Blue
  accent: "#FF6C5E",         // Coral

  // Backgrounds
  background: "#FFFFFF",
  cardBackground: "#FAFAFA",
  grid: "#E2E8F0",

  // Text
  text: "#1E293B",
  mutedText: "#64748B",

  // Category colors
  categories: {
    genai: "#10A37F",        // OpenAI Green
    cloud: "#4285F4",        // Google Blue
    subscription: "#FF6C5E", // Coral
  },

  // VIS-007: Sharpened brand colors for chart palette
  // Using CloudAct brand colors with higher saturation for visual impact
  palette: [
    "#10A37F",  // GenAI Green (OpenAI)
    "#4285F4",  // Cloud Blue (Google)
    "#FF6C5E",  // Coral (Subscription/Warnings)
    "#7C3AED",  // Purple (High contrast)
    "#FF9900",  // AWS Orange
    "#0078D4",  // Azure Blue
    "#90FCA6",  // Mint (Brand primary)
    "#1DA1F2",  // Twitter Blue (SaaS)
  ],

  // Animation timings (ms)
  animation: {
    fast: 150,
    normal: 300,
    slow: 500,
  },

  // Border radius (px)
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },

  // Premium shadows
  shadows: {
    tooltip: "0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
    card: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
    cardHover: "0 12px 32px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04)",
    glow: "0 0 40px rgba(144, 252, 166, 0.25)",
  },
}

// ============================================
// Context Types
// ============================================

export interface ChartContextValue {
  /** Current currency code */
  currency: string
  /** Theme configuration */
  theme: ChartTheme
  /** Format number as full currency (e.g., $1,234.56) */
  formatValue: (value: number) => string
  /** Format number as compact currency (e.g., $1.2K) */
  formatValueCompact: (value: number) => string
  /** Current time range */
  timeRange: TimeRange
  /** Custom date range (when timeRange is "custom") */
  customRange: CustomDateRange | undefined
  /** Update time range (syncs with context) */
  setTimeRange: (range: TimeRange, custom?: CustomDateRange) => void
  /** Whether responsive sizing is enabled */
  responsive: boolean
  /** Whether data is loading */
  isLoading: boolean
}

const ChartContext = createContext<ChartContextValue | null>(null)

// ============================================
// Hook
// ============================================

/**
 * Hook to access chart configuration
 * Falls back to sensible defaults if used outside provider
 */
export function useChartConfig(): ChartContextValue {
  const context = useContext(ChartContext)

  // Fallback for charts used outside provider
  if (!context) {
    return {
      currency: DEFAULT_CURRENCY,
      theme: defaultChartTheme,
      formatValue: (v: number) => formatCost(v, DEFAULT_CURRENCY),
      formatValueCompact: (v: number) => formatCostCompact(v, DEFAULT_CURRENCY),
      timeRange: "30",
      customRange: undefined,
      setTimeRange: () => {
        console.warn("ChartProvider not found - setTimeRange is a no-op")
      },
      responsive: true,
      isLoading: false,
    }
  }

  return context
}

// ============================================
// Provider
// ============================================

interface ChartProviderProps {
  children: ReactNode
  /** Override currency (defaults to CostDataContext.currency) */
  currency?: string
  /** Override theme colors */
  theme?: Partial<ChartTheme>
  /** Enable responsive sizing (default: true) */
  responsive?: boolean
}

export function ChartProvider({
  children,
  currency: overrideCurrency,
  theme: overrideTheme,
  responsive = true,
}: ChartProviderProps) {
  // Get data from CostDataContext if available
  const costData = useCostDataOptional()

  // Currency priority: prop > context > default
  const currency = overrideCurrency || costData?.currency || DEFAULT_CURRENCY

  // Time range: use unified filters from context if available, otherwise use defaults
  const timeRange = costData?.filters?.timeRange ?? "30"
  const customRange = costData?.filters?.customRange

  // Merge theme with overrides
  const theme = useMemo<ChartTheme>(() => ({
    ...defaultChartTheme,
    ...overrideTheme,
    categories: {
      ...defaultChartTheme.categories,
      ...overrideTheme?.categories,
    },
  }), [overrideTheme])

  // Memoized formatters
  const formatValue = useCallback(
    (value: number) => formatCost(value, currency),
    [currency]
  )

  const formatValueCompact = useCallback(
    (value: number) => formatCostCompact(value, currency),
    [currency]
  )

  // Time range setter that syncs with CostDataContext via unified filters
  const setTimeRange = useCallback((range: TimeRange, custom?: CustomDateRange) => {
    // Sync with CostDataContext's unified filters if available
    if (costData?.setUnifiedFilters) {
      costData.setUnifiedFilters({ timeRange: range, customRange: custom })
    }
  }, [costData])

  const value = useMemo<ChartContextValue>(() => ({
    currency,
    theme,
    formatValue,
    formatValueCompact,
    timeRange,
    customRange,
    setTimeRange,
    responsive,
    isLoading: costData?.isLoading ?? false,
  }), [
    currency,
    theme,
    formatValue,
    formatValueCompact,
    timeRange,
    customRange,
    setTimeRange,
    responsive,
    costData?.isLoading,
  ])

  return (
    <ChartContext.Provider value={value}>
      {children}
    </ChartContext.Provider>
  )
}

// ============================================
// Utilities
// ============================================

/**
 * Get color for a category
 */
export function getCategoryColor(
  category: "genai" | "cloud" | "subscription",
  theme: ChartTheme = defaultChartTheme
): string {
  return theme.categories[category]
}

/**
 * Get color from palette by index
 */
export function getPaletteColor(
  index: number,
  theme: ChartTheme = defaultChartTheme
): string {
  return theme.palette[index % theme.palette.length]
}

/**
 * Generate gradient ID for SVG defs
 */
export function getGradientId(color: string, suffix: string = ""): string {
  const colorHash = color.replace("#", "")
  return `gradient-${colorHash}${suffix ? `-${suffix}` : ""}`
}
