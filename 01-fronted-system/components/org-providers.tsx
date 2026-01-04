"use client"

/**
 * Org Providers
 *
 * Client-side context providers for org-scoped pages.
 * Wraps children with:
 * - CostDataProvider for cached cost data
 * - ChartProvider for unified chart configuration (currency, theme, time range)
 */

import type { ReactNode } from "react"
import { CostDataProvider } from "@/contexts/cost-data-context"
import { ChartProvider } from "@/components/charts"

interface OrgProvidersProps {
  children: ReactNode
  orgSlug: string
}

export function OrgProviders({ children, orgSlug }: OrgProvidersProps) {
  return (
    <CostDataProvider orgSlug={orgSlug}>
      <ChartProvider>
        {children}
      </ChartProvider>
    </CostDataProvider>
  )
}
