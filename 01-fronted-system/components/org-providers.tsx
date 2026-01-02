"use client"

/**
 * Org Providers
 *
 * Client-side context providers for org-scoped pages.
 * Wraps children with CostDataProvider for cached cost data.
 */

import type { ReactNode } from "react"
import { CostDataProvider } from "@/contexts/cost-data-context"

interface OrgProvidersProps {
  children: ReactNode
  orgSlug: string
}

export function OrgProviders({ children, orgSlug }: OrgProvidersProps) {
  return <CostDataProvider orgSlug={orgSlug}>{children}</CostDataProvider>
}
