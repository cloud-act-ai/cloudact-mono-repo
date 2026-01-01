"use client"

/**
 * CostScoreRing - Apple Health style ring chart for cost visualization
 *
 * Features:
 * - Multi-segment donut chart showing cost breakdown
 * - Score display in center
 * - Category breakdown list with colors
 * - Optional subtitle/insight text
 * - Animated ring segments
 */

import { cn } from "@/lib/utils"
import { formatCost, formatCostCompact } from "@/lib/costs"
import { ChevronRight } from "lucide-react"

// ============================================
// Types
// ============================================

export interface ScoreRingSegment {
  /** Unique key */
  key: string
  /** Display name */
  name: string
  /** Value (cost amount) */
  value: number
  /** Maximum value for this segment (for scoring) */
  maxValue?: number
  /** Segment color (hex) */
  color: string
}

export interface CostScoreRingProps {
  /** Title (e.g., "Cost Score", "Spend Summary") */
  title: string
  /** Score display (number or formatted string) */
  score?: number | string
  /** Score label (e.g., "Good", "High", "On Track") */
  scoreLabel?: string
  /** Ring segments */
  segments: ScoreRingSegment[]
  /** Total value for percentage calculation */
  total?: number
  /** Currency code */
  currency?: string
  /** Optional insight text below breakdown */
  insight?: string
  /** Show chevron for navigation */
  showChevron?: boolean
  /** Click handler */
  onClick?: () => void
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Use compact currency format */
  compact?: boolean
  /** Ring size (diameter in pixels) */
  ringSize?: number
  /** Ring stroke width */
  strokeWidth?: number
  /** Title color (hex color or CSS color value) - defaults to first segment color or slate-600 */
  titleColor?: string
}

// ============================================
// Loading Skeleton
// ============================================

function ScoreRingSkeleton({ ringSize = 100 }: { ringSize?: number }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 animate-pulse">
      <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
      <div className="flex items-center gap-6">
        <div
          className="rounded-full bg-slate-100"
          style={{ width: ringSize, height: ringSize }}
        />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-16 bg-slate-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-200" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================
// SVG Ring Component
// ============================================

interface RingChartProps {
  segments: ScoreRingSegment[]
  total: number
  size: number
  strokeWidth: number
  score?: number | string
}

function RingChart({ segments, total, size, strokeWidth, score }: RingChartProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  // Calculate segment angles
  let currentAngle = -90 // Start from top

  const segmentPaths = segments.map((segment) => {
    const percentage = total > 0 ? (segment.value / total) * 100 : 0
    const segmentAngle = (percentage / 100) * 360
    const startAngle = currentAngle
    currentAngle += segmentAngle

    // Calculate arc
    const startRad = (startAngle * Math.PI) / 180
    const endRad = ((startAngle + segmentAngle) * Math.PI) / 180

    const x1 = center + radius * Math.cos(startRad)
    const y1 = center + radius * Math.sin(startRad)
    const x2 = center + radius * Math.cos(endRad)
    const y2 = center + radius * Math.sin(endRad)

    const largeArc = segmentAngle > 180 ? 1 : 0

    return {
      ...segment,
      d:
        segmentAngle > 0
          ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
          : "",
      percentage,
    }
  })

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-0">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />

        {/* Segment arcs */}
        {segmentPaths.map((segment, index) =>
          segment.d ? (
            <path
              key={segment.key}
              d={segment.d}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            />
          ) : null
        )}
      </svg>

      {/* Center score */}
      {score !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
            {typeof score === "number" ? score.toFixed(0) : score}
          </span>
        </div>
      )}
    </div>
  )
}

// ============================================
// Breakdown Item
// ============================================

interface BreakdownRowProps {
  segment: ScoreRingSegment
  currency: string
  compact: boolean
}

function BreakdownRow({ segment, currency, compact }: BreakdownRowProps) {
  const formattedValue = compact
    ? formatCostCompact(segment.value, currency)
    : formatCost(segment.value, currency)

  // Calculate score if maxValue is provided
  const scoreDisplay =
    segment.maxValue !== undefined
      ? `${Math.round((segment.value / segment.maxValue) * 100)}/${segment.maxValue}`
      : formattedValue

  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: segment.color }}
      />
      <span className="text-slate-600">{segment.name}</span>
      <span className="font-semibold text-slate-900 ml-auto tabular-nums">
        {scoreDisplay}
      </span>
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostScoreRing({
  title,
  score,
  scoreLabel,
  segments,
  total,
  currency = "USD",
  insight,
  showChevron = false,
  onClick,
  loading = false,
  className,
  compact = false,
  ringSize = 100,
  strokeWidth = 12,
  titleColor,
}: CostScoreRingProps) {
  if (loading) {
    return <ScoreRingSkeleton ringSize={ringSize} />
  }

  // Calculate total if not provided
  const calculatedTotal = total ?? segments.reduce((sum, s) => sum + s.value, 0)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6",
        "shadow-sm hover:shadow-md transition-all duration-200",
        onClick && "cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2",
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: titleColor || segments[0]?.color || "#64748b" }}
        >
          {title}
        </h3>
        {showChevron && (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex items-start gap-5">
        {/* Ring Chart */}
        <div className="flex-shrink-0">
          <RingChart
            segments={segments}
            total={calculatedTotal}
            size={ringSize}
            strokeWidth={strokeWidth}
            score={score}
          />
        </div>

        {/* Breakdown */}
        <div className="flex-1 min-w-0">
          {scoreLabel && (
            <div className="text-lg sm:text-xl font-bold text-slate-900 mb-3">
              {scoreLabel}
            </div>
          )}
          <div className="space-y-2">
            {segments.map((segment) => (
              <BreakdownRow
                key={segment.key}
                segment={segment}
                currency={currency}
                compact={compact}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Insight */}
      {insight && (
        <p className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600">
          {insight}
        </p>
      )}
    </div>
  )
}

// ============================================
// Preset: Cost Category Ring
// ============================================

export interface CostCategoryRingProps {
  genaiCost: number
  cloudCost: number
  saasCost: number
  currency?: string
  loading?: boolean
  onClick?: () => void
  className?: string
  /** Title color - defaults to dominant category color */
  titleColor?: string
}

export function CostCategoryRing({
  genaiCost,
  cloudCost,
  saasCost,
  currency = "USD",
  loading = false,
  onClick,
  className,
  titleColor,
}: CostCategoryRingProps) {
  const total = genaiCost + cloudCost + saasCost

  const segments: ScoreRingSegment[] = [
    { key: "genai", name: "GenAI", value: genaiCost, color: "#10A37F" },
    { key: "cloud", name: "Cloud", value: cloudCost, color: "#4285F4" },
    { key: "saas", name: "SaaS", value: saasCost, color: "#FF6C5E" },
  ].filter((s) => s.value > 0)

  // Calculate a spend "score" based on budget efficiency or trend
  // For now, show total as score
  const formattedTotal = formatCostCompact(total, currency)

  return (
    <CostScoreRing
      title="Total Spend"
      score={formattedTotal}
      segments={segments}
      total={total}
      currency={currency}
      loading={loading}
      onClick={onClick}
      className={className}
      compact
      ringSize={88}
      strokeWidth={10}
      titleColor={titleColor || "#1a7a3a"}
    />
  )
}
