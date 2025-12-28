"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Cloud,
  TrendingUp,
  DollarSign,
  Calendar,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getCloudCosts, getCostByProvider, type CostSummary, type ProviderBreakdown } from "@/actions/costs"
import { formatCurrency } from "@/lib/i18n"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  gcp: "Google Cloud",
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  google_cloud: "Google Cloud",
  amazon_web_services: "Amazon Web Services",
  microsoft_azure: "Microsoft Azure",
}

// Provider colors for horizontal bars
const PROVIDER_COLORS: Record<string, string> = {
  gcp: "bg-[#4285F4]",
  google_cloud: "bg-[#4285F4]",
  aws: "bg-[#FF9900]",
  amazon_web_services: "bg-[#FF9900]",
  azure: "bg-[#0078D4]",
  microsoft_azure: "bg-[#0078D4]",
}

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [providers, setProviders] = useState<ProviderBreakdown[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [costsResult, providersResult] = await Promise.all([
        getCloudCosts(orgSlug),
        getCostByProvider(orgSlug),
      ])

      if (costsResult.success) {
        setSummary(costsResult.summary)
        // Use currency from API response
        if (costsResult.currency) {
          setOrgCurrency(costsResult.currency)
        }
      } else {
        setError(costsResult.error || "Failed to load cloud costs")
      }

      if (providersResult.success && providersResult.data) {
        // Filter to only cloud providers
        const cloudProviders = ["gcp", "aws", "azure", "google_cloud", "amazon_web_services", "microsoft_azure"]
        const filtered = providersResult.data.filter(p =>
          p.provider && cloudProviders.some(cloud => p.provider.toLowerCase().includes(cloud))
        )
        setProviders(filtered)
      }
    } catch (err) {
      console.error("Cloud costs error:", err)
      setError(err instanceof Error ? err.message : "Failed to load cloud cost data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  // Calculate max cost for horizontal bar scaling
  const maxProviderCost = Math.max(...providers.map(p => p.total_cost), 1)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">{error}</h3>
              <p className="text-[13px] text-slate-600 mt-0.5">
                {error.includes("API key") ? (
                  <>
                    Please complete organization onboarding in{" "}
                    <Link href={`/${orgSlug}/settings/organization`} className="underline">
                      Settings
                    </Link>.
                  </>
                ) : (
                  "Please try again later."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--cloudact-mint)]/10">
            <Cloud className="h-6 w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cloud Costs</h1>
            <p className="text-sm text-slate-500">Infrastructure spend across cloud providers</p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="h-9"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Scorecards - Apple Health Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Month to Date */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-[var(--cloudact-coral)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MTD Spend</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.mtd_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {new Date().toLocaleString("default", { month: "long" })}
          </div>
        </div>

        {/* Daily Rate */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Daily Rate</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.total_daily_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">per day</div>
        </div>

        {/* Monthly Forecast */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[var(--cloudact-coral)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Forecast</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.forecast_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">this month</div>
        </div>

        {/* YTD */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">YTD {new Date().getFullYear()}</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.ytd_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">year to date</div>
        </div>
      </div>

      {/* Horizontal Bar Chart - Provider Breakdown */}
      {providers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-6">
            Cost by Provider
          </h2>
          <div className="space-y-4">
            {providers
              .sort((a, b) => b.total_cost - a.total_cost)
              .map((provider) => {
                const percentage = (provider.total_cost / maxProviderCost) * 100
                const providerKey = provider.provider.toLowerCase()
                const barColor = PROVIDER_COLORS[providerKey] || "bg-slate-400"
                const displayName = PROVIDER_NAMES[providerKey] || provider.provider

                return (
                  <div key={provider.provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{displayName}</span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatCurrency(provider.total_cost, orgCurrency)}
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{provider.record_count} records</span>
                      <span>{provider.percentage?.toFixed(1) || 0}% of total</span>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!summary && providers.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-4">
            <Cloud className="h-10 w-10 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No cloud costs yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Connect your cloud providers (GCP, AWS, Azure) and run the cloud cost pipeline to see your infrastructure spend.
          </p>
          <Link href={`/${orgSlug}/integrations/cloud-providers`}>
            <Button className="console-button-primary">
              Connect Providers
            </Button>
          </Link>
        </div>
      )}

      {/* Data Table */}
      {providers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Cost Details
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {summary?.record_count || 0} records from {summary?.date_range?.start || "-"} to {summary?.date_range?.end || "-"}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase">Provider</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Daily</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Monthly</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Annual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.slice(0, 10).map((provider) => (
                <TableRow key={provider.provider}>
                  <TableCell className="font-medium">
                    {PROVIDER_NAMES[provider.provider.toLowerCase()] || provider.provider}
                  </TableCell>
                  <TableCell className="text-slate-500">Cloud Infrastructure</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(provider.total_cost / 30, orgCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(provider.total_cost, orgCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(provider.total_cost * 12, orgCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
