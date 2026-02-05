"use client"

import React, { memo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertCircle, Clock, ArrowRight } from "lucide-react"

interface IntegrationItem {
  name: string
  provider: string
  status: "connected" | "pending" | "not_connected"
  type?: "api" | "subscription"
}

interface IntegrationsCardProps {
  integrations: IntegrationItem[]
  orgSlug: string
}

const STATUS_CONFIG = {
  connected: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    label: "Connected",
  },
  pending: {
    icon: Clock,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Pending",
  },
  not_connected: {
    icon: AlertCircle,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    label: "Not Connected",
  },
} as const

/**
 * IntegrationsCard - Memoized component for dashboard integrations list
 * 
 * Performance optimization: Extracted from main dashboard to prevent
 * re-renders when other dashboard state changes.
 */
export const IntegrationsCard = memo(function IntegrationsCard({ 
  integrations, 
  orgSlug 
}: IntegrationsCardProps) {
  return (
    <Card className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-800/50 border-gray-200/50 dark:border-gray-700/50 shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Integrations
          </h3>
          <Link
            href={`/${orgSlug}/integrations`}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {integrations.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No integrations configured yet.</p>
            <Link
              href={`/${orgSlug}/integrations`}
              className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              Add your first integration
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration, index) => {
              const config = STATUS_CONFIG[integration.status]
              const StatusIcon = config.icon

              return (
                <div
                  key={`${integration.provider}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bgColor}`}>
                    <StatusIcon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {integration.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {integration.provider}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${config.color} border-current`}
                  >
                    {config.label}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
})

export default IntegrationsCard
