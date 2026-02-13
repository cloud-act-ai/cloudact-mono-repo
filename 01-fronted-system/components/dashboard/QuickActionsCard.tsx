"use client"

import React, { memo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight } from "lucide-react"

interface QuickAction {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  color: "teal" | "coral" | "slate"
}

interface QuickActionsCardProps {
  actions: QuickAction[]
  orgSlug: string
}

// Move color classes outside component to prevent recreation on every render
const QUICK_ACTION_COLOR_CLASSES = {
  teal: "from-[#90FCA6]/10 to-[#90FCA6]/5 border-[#90FCA6]/20 hover:shadow-[0_8px_24px_rgba(144,252,166,0.15)]",
  coral: "from-[#FF6C5E]/10 to-[#FF6C5E]/5 border-[#FF6C5E]/20 hover:shadow-[0_8px_24px_rgba(255,108,94,0.15)]",
  slate: "from-[var(--text-tertiary)]/10 to-[var(--text-tertiary)]/5 border-[var(--text-tertiary)]/20 hover:shadow-[0_8px_24px_rgba(100,116,139,0.15)]",
} as const

const QUICK_ACTION_ICON_CLASSES = {
  teal: "bg-[#90FCA6] text-[#1a7a3a]",
  coral: "bg-[#FF6C5E] text-white",
  slate: "bg-[var(--text-tertiary)] text-white",
} as const

/**
 * QuickActionsCard - Memoized component for dashboard quick actions
 * 
 * Performance optimization: Extracted from main dashboard to prevent
 * re-renders when other dashboard state changes.
 */
export const QuickActionsCard = memo(function QuickActionsCard({ 
  actions, 
  orgSlug 
}: QuickActionsCardProps) {
  return (
    <Card className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-800/50 border-gray-200/50 dark:border-gray-700/50 shadow-lg">
      <CardContent className="p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Quick Actions
        </h3>
        <div className="space-y-3">
          {actions.map((action) => (
            <Link
              key={action.title}
              href={`/${orgSlug}${action.href}`}
              className={`group flex items-center gap-4 p-4 rounded-xl border bg-gradient-to-r transition-all duration-300 ${QUICK_ACTION_COLOR_CLASSES[action.color]}`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${QUICK_ACTION_ICON_CLASSES[action.color]}`}>
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">
                  {action.title}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {action.description}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 group-hover:translate-x-1 transition-all" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

export default QuickActionsCard
