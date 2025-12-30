"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon, Inbox } from "lucide-react"
import Link from "next/link"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
    icon?: LucideIcon
  }
  className?: string
  size?: "sm" | "md" | "lg"
  variant?: "default" | "card"
}

const sizeClasses = {
  sm: {
    container: "py-8",
    iconBox: "p-2.5 rounded-xl mb-2",
    icon: "h-8 w-8",
    title: "text-[15px]",
    description: "text-[13px]",
    button: "h-9 px-4 text-[13px] rounded-lg",
  },
  md: {
    container: "py-12",
    iconBox: "p-3 rounded-2xl mb-2",
    icon: "h-10 w-10",
    title: "text-[17px]",
    description: "text-[15px]",
    button: "h-10 px-5 text-[14px] rounded-xl",
  },
  lg: {
    container: "py-16",
    iconBox: "p-4 rounded-2xl mb-3",
    icon: "h-12 w-12",
    title: "text-[20px]",
    description: "text-[15px] max-w-md",
    button: "h-11 px-6 text-[15px] rounded-xl",
  },
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  size = "md",
  variant = "default",
}: EmptyStateProps) {
  const sizes = sizeClasses[size]
  const ActionIcon = action?.icon

  const buttonClassName = cn(
    "inline-flex items-center gap-2 bg-[var(--cloudact-mint)] text-slate-900",
    "font-semibold hover:bg-[var(--cloudact-mint-dark)] transition-colors",
    "shadow-sm hover:shadow-md",
    sizes.button
  )

  const content = (
    <div
      className={cn(
        "text-center",
        sizes.container,
        variant === "card" && "px-4 sm:px-6",
        className
      )}
    >
      <div className="space-y-3">
        <div
          className={cn(
            "inline-flex bg-[var(--cloudact-mint)]/10",
            sizes.iconBox
          )}
        >
          <Icon
            className={cn("text-[var(--cloudact-mint-dark)]", sizes.icon)}
            aria-hidden="true"
          />
        </div>
        <h3 className={cn("font-semibold text-slate-900", sizes.title)}>
          {title}
        </h3>
        {description && (
          <p className={cn("text-slate-500 mx-auto", sizes.description)}>
            {description}
          </p>
        )}
        {action && (
          <div className="pt-2">
            {action.href ? (
              <Link
                href={action.href}
                className={buttonClassName}
                aria-label={action.label}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className={buttonClassName}
                aria-label={action.label}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                {action.label}
              </button>
            )}
          </div>
        )}
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

// Inline empty state for smaller sections
interface InlineEmptyStateProps {
  message: string
  icon?: LucideIcon
  className?: string
}

export function InlineEmptyState({
  message,
  icon: Icon = Inbox,
  className,
}: InlineEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-6 text-slate-500",
        className
      )}
      role="status"
      aria-label={message}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="text-[13px]">{message}</span>
    </div>
  )
}
