"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react"
import { StatusBadge, StatusType } from "@/components/ui/status-badge"

// ============================================================================
// Basic Table Card
// ============================================================================

interface TableCardProps {
  children: React.ReactNode
  onClick?: () => void
  expanded?: boolean
  expandable?: boolean
  className?: string
}

export function TableCard({
  children,
  onClick,
  expanded = false,
  expandable = false,
  className,
}: TableCardProps) {
  return (
    <button
      className={cn(
        "w-full p-4 text-left touch-manipulation",
        "hover:bg-[var(--cloudact-mint)]/5 transition-colors",
        expandable && "cursor-pointer",
        className
      )}
      onClick={onClick}
      disabled={!onClick}
    >
      {children}
    </button>
  )
}

// ============================================================================
// Pipeline Run Card (for subscription-runs, cloud-runs, etc.)
// ============================================================================

interface PipelineRunCardProps {
  id: string
  pipelineId: string
  status: StatusType | string
  startTime?: string
  duration?: number
  error?: string
  expanded?: boolean
  onToggle?: () => void
  expandedContent?: React.ReactNode
  loading?: boolean
  className?: string
}

export function PipelineRunCard({
  id,
  pipelineId,
  status,
  startTime,
  duration,
  error,
  expanded = false,
  onToggle,
  expandedContent,
  loading = false,
  className,
}: PipelineRunCardProps) {
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "-"
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor(diff / (1000 * 60))

      if (minutes < 1) return "Just now"
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`

      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    } catch {
      return dateString
    }
  }

  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return "-"
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const getDurationWidth = (ms?: number) => {
    if (!ms) return "0%"
    const maxMs = 300000 // 5 minutes max
    return `${Math.min((ms / maxMs) * 100, 100)}%`
  }

  const getDurationColor = (statusStr: string) => {
    const s = statusStr.toUpperCase()
    if (s === "COMPLETED") return "bg-[var(--cloudact-mint)]"
    if (s === "FAILED" || s === "TIMEOUT") return "bg-[var(--cloudact-coral)]"
    return "bg-[var(--cloudact-mint)]/50"
  }

  return (
    <div className={cn("border-b border-[#E5E5EA] last:border-b-0", className)}>
      <button
        className="w-full p-4 text-left touch-manipulation hover:bg-[var(--cloudact-mint)]/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-slate-900 truncate">
                {pipelineId}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {id.slice(0, 8)}...
              </div>
            </div>
          </div>
          <StatusBadge status={status} size="md" />
        </div>

        <div className="ml-6 space-y-2">
          {startTime && (
            <div className="text-[13px] text-slate-500">
              {formatDateTime(startTime)}
            </div>
          )}

          {duration !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Duration</span>
                <span className="font-medium text-slate-900">
                  {formatDuration(duration)}
                </span>
              </div>
              <div className="h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getDurationColor(status)
                  )}
                  style={{ width: getDurationWidth(duration) }}
                />
              </div>
            </div>
          )}
        </div>
      </button>

      {expanded && expandedContent && (
        <div className="px-4 pb-4 bg-[var(--cloudact-mint)]/5">
          {expandedContent}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Available Pipeline Card
// ============================================================================

interface AvailablePipelineCardProps {
  id: string
  name: string
  description?: string
  provider: string
  status?: "ready" | "running" | "disabled"
  onRun?: () => void
  running?: boolean
  runIcon?: LucideIcon
  runLabel?: string
  className?: string
}

export function AvailablePipelineCard({
  id,
  name,
  description,
  provider,
  status = "ready",
  onRun,
  running = false,
  runIcon: RunIcon,
  runLabel = "Run Now",
  className,
}: AvailablePipelineCardProps) {
  return (
    <div className={cn("p-4 space-y-3 border-b border-[#E5E5EA] last:border-b-0", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-900">{name}</div>
          {description && (
            <div className="text-[13px] text-slate-500 mt-0.5">{description}</div>
          )}
        </div>
        <StatusBadge status={status} size="md" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--cloudact-mint)]/5 text-slate-500 border border-slate-200">
          {provider}
        </span>
        {onRun && (
          <button
            onClick={onRun}
            disabled={running || status === "disabled"}
            className={cn(
              "inline-flex items-center gap-2 h-11 px-4",
              "bg-[var(--cloudact-mint)] text-slate-900 text-[15px] font-semibold rounded-xl",
              "hover:bg-[var(--cloudact-mint-dark)] transition-all touch-manipulation",
              "shadow-sm hover:shadow-md",
              "disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-70"
            )}
          >
            {running ? (
              <>
                <span className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                {RunIcon && <RunIcon className="h-4 w-4" />}
                {runLabel}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Step Timeline Card (for expanded pipeline details)
// ============================================================================

interface PipelineStep {
  id: string
  index: number
  name: string
  status: StatusType | string
  duration?: number
  error?: string
}

interface StepTimelineProps {
  steps: PipelineStep[]
  error?: string
  className?: string
}

export function StepTimeline({ steps, error, className }: StepTimelineProps) {
  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return "-"
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const getDurationWidth = (ms?: number) => {
    if (!ms) return "0%"
    const maxMs = 60000 // 1 minute max for steps
    return `${Math.min((ms / maxMs) * 100, 100)}%`
  }

  const getDurationColor = (status: string) => {
    const s = status.toUpperCase()
    if (s === "COMPLETED") return "bg-[var(--cloudact-mint)]"
    if (s === "FAILED" || s === "TIMEOUT") return "bg-[var(--cloudact-coral)]"
    return "bg-[var(--cloudact-mint)]/50"
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Error message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl border-l-4 border-l-rose-500">
          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
              <p className="text-[13px] text-slate-600 mt-1 break-words font-mono">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        <h4 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-[var(--cloudact-mint)]/20 flex items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--cloudact-mint-dark)]" />
          </span>
          Pipeline Steps
        </h4>

        {steps.length === 0 ? (
          <p className="text-center text-slate-500 text-[13px] py-4">
            No step logs available
          </p>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className="bg-white rounded-xl border border-slate-200 p-3"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-dark)] text-[11px] font-bold flex-shrink-0">
                      {step.index}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-900 truncate">
                      {step.name}
                    </span>
                  </div>
                  <StatusBadge status={step.status} size="sm" />
                </div>
                {step.duration !== undefined && (
                  <div className="ml-8 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Duration</span>
                      <span className="font-medium text-slate-900">
                        {formatDuration(step.duration)}
                      </span>
                    </div>
                    <div className="h-1 bg-[#E5E5EA] rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", getDurationColor(step.status))}
                        style={{ width: getDurationWidth(step.duration) }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
