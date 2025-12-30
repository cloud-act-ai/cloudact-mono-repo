"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertCircle,
  Ban,
  SkipForward,
  Circle,
} from "lucide-react"

export type StatusType =
  | "completed"
  | "success"
  | "failed"
  | "error"
  | "running"
  | "pending"
  | "cancelled"
  | "ready"
  | "active"
  | "inactive"
  | "warning"
  | "skipped"
  | "timeout"
  | "cancelling"

interface StatusBadgeProps {
  status: StatusType | string
  showIcon?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

const statusConfig: Record<
  string,
  { bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  completed: {
    bg: "bg-[#B8FDCA]",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  success: {
    bg: "bg-[#B8FDCA]",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  ready: {
    bg: "bg-[#B8FDCA]",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  active: {
    bg: "bg-[#B8FDCA]",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <Circle className="h-3.5 w-3.5 fill-current" />,
  },
  failed: {
    bg: "bg-[var(--cloudact-coral)]/10",
    text: "text-[var(--cloudact-coral)]",
    border: "border-[var(--cloudact-coral)]/20",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  error: {
    bg: "bg-[var(--cloudact-coral)]/10",
    text: "text-[var(--cloudact-coral)]",
    border: "border-[var(--cloudact-coral)]/20",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  timeout: {
    bg: "bg-[var(--cloudact-coral)]/10",
    text: "text-[var(--cloudact-coral)]",
    border: "border-[var(--cloudact-coral)]/20",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  running: {
    bg: "bg-[var(--cloudact-mint)]/10",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  pending: {
    bg: "bg-[var(--cloudact-mint)]/10",
    text: "text-[#1a7a3a]",
    border: "border-[var(--cloudact-mint)]/20",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  cancelling: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  cancelled: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <Ban className="h-3.5 w-3.5" />,
  },
  warning: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  skipped: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: <SkipForward className="h-3.5 w-3.5" />,
  },
  inactive: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: <Circle className="h-3.5 w-3.5" />,
  },
  default: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
}

const sizeClasses = {
  sm: "px-2 py-0.5 text-[10px] gap-1",
  md: "px-2.5 py-1 text-[11px] gap-1.5",
  lg: "px-3 py-1.5 text-[12px] gap-2",
}

export function StatusBadge({
  status,
  showIcon = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase()
  const config = statusConfig[normalizedStatus] || statusConfig.default
  const displayText = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        config.bg,
        config.text,
        config.border,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && config.icon}
      {displayText}
    </span>
  )
}

// Export status helper function for external use
export function getStatusConfig(status: string) {
  const normalizedStatus = status.toLowerCase()
  return statusConfig[normalizedStatus] || statusConfig.default
}
