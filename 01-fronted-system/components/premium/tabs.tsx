"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon, Info } from "lucide-react"

// ============================================================================
// Types
// ============================================================================

export interface TabConfig {
  id: string
  label: string
  icon?: LucideIcon
  description?: string
  count?: number
  disabled?: boolean
}

interface PremiumTabsProps {
  tabs: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  className?: string
}

interface PremiumTabContentProps {
  children: React.ReactNode
  description?: string
  className?: string
}

// ============================================================================
// PremiumTabs - Tab navigation with icons and counts
// ============================================================================

export function PremiumTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: PremiumTabsProps) {
  return (
    <div className={cn("border-b border-slate-200", className)}>
      <nav className="flex gap-0.5 sm:gap-1 -mb-px overflow-x-auto pb-px scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              disabled={tab.disabled}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3",
                "text-[12px] sm:text-[14px] font-medium whitespace-nowrap",
                "border-b-2 transition-all touch-manipulation",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isActive
                  ? "border-[var(--cloudact-mint-dark)] text-[#1a7a3a] bg-[var(--cloudact-mint)]/5"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0",
                    isActive && "text-[var(--cloudact-mint-dark)]"
                  )}
                />
              )}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">
                {tab.label.length > 10 ? tab.label.split(" ")[0] : tab.label}
              </span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px]",
                    "h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold",
                    isActive
                      ? "bg-[var(--cloudact-mint)] text-[#1a7a3a]"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ============================================================================
// PremiumTabContent - Content area with optional description banner
// ============================================================================

export function PremiumTabContent({
  children,
  description,
  className,
}: PremiumTabContentProps) {
  return (
    <div className={cn("space-y-4 sm:space-y-6", className)}>
      {description && (
        <div className="p-4 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
            <p className="text-[13px] text-slate-700 font-medium">{description}</p>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

// ============================================================================
// PremiumTabsContainer - Full tabs system with content switching
// ============================================================================

interface PremiumTabsContainerProps {
  tabs: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  children: React.ReactNode
  className?: string
}

export function PremiumTabsContainer({
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
}: PremiumTabsContainerProps) {
  const activeTabConfig = tabs.find((t) => t.id === activeTab)

  return (
    <div className={cn("space-y-4 sm:space-y-6", className)}>
      <PremiumTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <PremiumTabContent description={activeTabConfig?.description}>
        {children}
      </PremiumTabContent>
    </div>
  )
}

// ============================================================================
// Simple Tab Triggers (for inline use without full system)
// ============================================================================

interface PremiumTabTriggerProps {
  active: boolean
  onClick: () => void
  icon?: LucideIcon
  label: string
  count?: number
  disabled?: boolean
  className?: string
}

export function PremiumTabTrigger({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  disabled,
  className,
}: PremiumTabTriggerProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3",
        "text-[12px] sm:text-[14px] font-medium whitespace-nowrap",
        "border-b-2 transition-all touch-manipulation",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        active
          ? "border-[var(--cloudact-mint-dark)] text-[#1a7a3a] bg-[var(--cloudact-mint)]/5"
          : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0",
            active && "text-[var(--cloudact-mint-dark)]"
          )}
        />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px]",
            "h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold",
            active
              ? "bg-[var(--cloudact-mint)] text-[#1a7a3a]"
              : "bg-slate-100 text-slate-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
