"use client"

/**
 * Chart Skeleton
 *
 * Loading placeholder for charts with animated pulse effect.
 * Matches the Apple Health dashboard aesthetic.
 */

import React from "react"
import { cn } from "@/lib/utils"

export interface ChartSkeletonProps {
  /** Height of the skeleton */
  height?: number
  /** Show title placeholder */
  showTitle?: boolean
  /** Show legend placeholder */
  showLegend?: boolean
  /** Chart type hint for better placeholder */
  variant?: "bar" | "line" | "pie" | "sparkline"
  /** Additional class names */
  className?: string
}

export function ChartSkeleton({
  height = 280,
  showTitle = true,
  showLegend = false,
  variant = "bar",
  className,
}: ChartSkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] bg-white p-4 sm:p-6",
        className
      )}
    >
      {/* Title */}
      {showTitle && (
        <div className="mb-4 space-y-2">
          <div className="h-5 w-32 rounded bg-[var(--surface-hover)]" />
          <div className="h-3 w-48 rounded bg-[var(--surface-secondary)]" />
        </div>
      )}

      {/* Chart area */}
      <div
        className="relative overflow-hidden rounded-lg bg-[var(--surface-secondary)]"
        style={{ height }}
      >
        {variant === "bar" && <BarSkeletonContent />}
        {variant === "line" && <LineSkeletonContent />}
        {variant === "pie" && <PieSkeletonContent />}
        {variant === "sparkline" && <SparklineSkeletonContent />}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="mt-4 flex items-center justify-center gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-[var(--surface-hover)]" />
              <div className="h-3 w-16 rounded bg-[var(--surface-secondary)]" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BarSkeletonContent() {
  return (
    <div className="absolute inset-0 flex items-end justify-around p-4">
      {[65, 45, 80, 55, 70, 40, 60].map((h, i) => (
        <div
          key={i}
          className="w-8 rounded-t bg-[var(--surface-hover)]"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

function LineSkeletonContent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <svg
        viewBox="0 0 280 100"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <path
          d="M 0 70 Q 40 50 70 60 T 140 40 T 210 55 T 280 30"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 0 70 Q 40 50 70 60 T 140 40 T 210 55 T 280 30 L 280 100 L 0 100 Z"
          fill="#F1F5F9"
          opacity="0.5"
        />
      </svg>
    </div>
  )
}

function PieSkeletonContent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#F1F5F9"
            strokeWidth="12"
          />
          {/* Animated segment */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="12"
            strokeDasharray="125.6 125.6"
            strokeLinecap="round"
          />
        </svg>
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-16 rounded bg-[var(--surface-hover)]" />
        </div>
      </div>
    </div>
  )
}

function SparklineSkeletonContent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <svg
        viewBox="0 0 100 40"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <path
          d="M 0 25 L 20 20 L 40 28 L 60 15 L 80 22 L 100 18"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

// ============================================
// Inline Skeleton (for within cards)
// ============================================

interface InlineSkeletonProps {
  width?: number | string
  height?: number | string
  className?: string
}

export function InlineSkeleton({
  width = "100%",
  height = 20,
  className,
}: InlineSkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded bg-[var(--surface-hover)]", className)}
      style={{ width, height }}
    />
  )
}
