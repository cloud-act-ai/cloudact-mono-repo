"use client"

/**
 * PageActionsMenu — Shared 3-dot vertical menu for page-level actions.
 *
 * Used across cost dashboards, budgets, alerts, and analytics pages.
 * Provides a consistent "Clear Cache" action that forces fresh data from backend.
 */

import React, { useState } from "react"
import { MoreVertical, Trash2, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface PageActionsMenuProps {
  /** Handler for clear cache action */
  onClearCache: () => Promise<void> | void
  /** Additional menu items */
  extraItems?: {
    label: string
    icon?: React.ReactNode
    onClick: () => void
    disabled?: boolean
  }[]
  /** Custom class name */
  className?: string
}

export function PageActionsMenu({
  onClearCache,
  extraItems,
  className,
}: PageActionsMenuProps) {
  const [isClearing, setIsClearing] = useState(false)

  const handleClearCache = async () => {
    setIsClearing(true)
    try {
      await onClearCache()
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] transition-colors ${className || ""}`}
          aria-label="Page actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={handleClearCache}
          disabled={isClearing}
          className="text-sm"
        >
          {isClearing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          {isClearing ? "Clearing..." : "Clear Cache"}
        </DropdownMenuItem>
        {extraItems?.map((item, i) => (
          <DropdownMenuItem
            key={i}
            onClick={item.onClick}
            disabled={item.disabled}
            className="text-sm"
          >
            {item.icon && <span className="mr-2">{item.icon}</span>}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
