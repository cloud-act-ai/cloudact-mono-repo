"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface LoadingStateProps {
  message?: string
  size?: "sm" | "md" | "lg"
  className?: string
  variant?: "default" | "card" | "inline" | "overlay"
}

const sizeClasses = {
  sm: {
    container: "min-h-[200px]",
    iconBox: "h-10 w-10 rounded-xl mb-3",
    icon: "h-5 w-5",
    text: "text-[13px]",
  },
  md: {
    container: "min-h-[400px]",
    iconBox: "h-12 w-12 rounded-2xl mb-4",
    icon: "h-6 w-6",
    text: "text-[14px]",
  },
  lg: {
    container: "min-h-[500px]",
    iconBox: "h-14 w-14 rounded-2xl mb-5",
    icon: "h-7 w-7",
    text: "text-[15px]",
  },
}

export function LoadingState({
  message = "Loading...",
  size = "md",
  className,
  variant = "default",
}: LoadingStateProps) {
  const sizes = sizeClasses[size]

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 py-4",
          className
        )}
        role="status"
        aria-live="polite"
        aria-label={message}
      >
        <Loader2 className="h-4 w-4 animate-spin text-[var(--cloudact-mint-dark)]" aria-hidden="true" />
        <span className="text-[13px] text-slate-500 font-medium">{message}</span>
      </div>
    )
  }

  if (variant === "overlay") {
    return (
      <div
        className={cn(
          "absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10",
          className
        )}
        role="status"
        aria-live="polite"
        aria-label={message}
      >
        <div className="text-center">
          <div
            className={cn(
              "bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto",
              sizes.iconBox
            )}
          >
            <Loader2
              className={cn(
                "animate-spin text-[var(--cloudact-mint-dark)]",
                sizes.icon
              )}
              aria-hidden="true"
            />
          </div>
          <p className={cn("text-slate-500 font-medium", sizes.text)}>
            {message}
          </p>
        </div>
      </div>
    )
  }

  const content = (
    <div
      className={cn(
        "flex items-center justify-center",
        variant === "default" && sizes.container,
        variant === "card" && "py-12 px-4 sm:px-6",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="text-center">
        <div
          className={cn(
            "bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto",
            sizes.iconBox
          )}
        >
          <Loader2
            className={cn(
              "animate-spin text-[var(--cloudact-mint-dark)]",
              sizes.icon
            )}
            aria-hidden="true"
          />
        </div>
        <p className={cn("text-slate-500 font-medium", sizes.text)}>
          {message}
        </p>
      </div>
    </div>
  )

  if (variant === "card") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {content}
      </div>
    )
  }

  return content
}

// Skeleton loader for tables
interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {/* Header skeleton */}
      <div className="flex gap-4 pb-3 border-b border-slate-100">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`header-${i}`}
            className="h-4 bg-slate-100 rounded animate-pulse"
            style={{ width: `${100 / columns}%` }}
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={`row-${rowIndex}-col-${colIndex}`}
              className="h-4 bg-slate-100 rounded animate-pulse"
              style={{ width: `${100 / columns}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Card skeleton
interface CardSkeletonProps {
  lines?: number
  className?: string
}

export function CardSkeleton({ lines = 3, className }: CardSkeletonProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-100 rounded animate-pulse"
          style={{ width: `${80 - i * 10}%` }}
        />
      ))}
    </div>
  )
}
