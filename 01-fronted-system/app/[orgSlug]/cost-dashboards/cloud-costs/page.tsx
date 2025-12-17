"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Cloud,
  DollarSign,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  Plus,
  AlertCircle,
  RefreshCw,
  Server,
  Database,
  HardDrive,
  Network,
  List,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CardSkeleton } from "@/components/ui/card-skeleton"
import { TableSkeleton } from "@/components/ui/table-skeleton"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/i18n"

// Service icons
const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  compute: Server,
  storage: HardDrive,
  database: Database,
  networking: Network,
  other: Cloud,
}

// Provider colors - CloudAct Standard
const PROVIDER_COLORS: Record<string, string> = {
  gcp: "bg-[#007A78]/10 text-[#007A78] border border-[#007A78]/10",
  aws: "bg-[#FF6E50]/10 text-[#FF6E50] border border-[#FF6E50]/10",
  azure: "bg-[#007A78]/5 text-[#005F5D] border border-[#007A78]/10",
  other: "bg-[#F5F5F7] text-[#8E8E93] border border-[#E5E5EA]",
}

interface CloudCostSummary {
  total_daily_cost: number
  total_monthly_cost: number
  total_annual_cost: number
  ytd_cost: number
  mtd_cost: number
  forecast_monthly_cost: number
  forecast_annual_cost: number
  providers_count: number
  services_count: number
}

interface CloudCostRecord {
  id: string
  provider: string
  service: string
  date: string
  cost: number
  usage_amount: number
  usage_unit: string
  project?: string
}

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [costRecords, setCostRecords] = useState<CloudCostRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")
  const [summary, setSummary] = useState<CloudCostSummary | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Get org currency
      const { data: orgData } = await supabase
        .from("organizations")
        .select("default_currency")
        .eq("org_slug", orgSlug)
        .single()

      if (orgData?.default_currency) {
        setOrgCurrency(orgData.default_currency)
      }

      // For now, show placeholder data - will be populated by cloud cost pipeline
      // This would be replaced with actual API call to fetch cloud cost data
      setSummary({
        total_daily_cost: 0,
        total_monthly_cost: 0,
        total_annual_cost: 0,
        ytd_cost: 0,
        mtd_cost: 0,
        forecast_monthly_cost: 0,
        forecast_annual_cost: 0,
        providers_count: 0,
        services_count: 0,
      })
      setCostRecords([])
    } catch (err) {
      console.error("Error loading cloud cost data:", err)
      setError("Failed to load cloud cost data. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  // Map service name to icon category
  const getServiceCategory = (service: string): string => {
    const serviceLower = service.toLowerCase()
    if (serviceLower.includes('compute') || serviceLower.includes('vm') || serviceLower.includes('instance') || serviceLower.includes('engine')) {
      return 'compute'
    }
    if (serviceLower.includes('storage') || serviceLower.includes('bucket') || serviceLower.includes('blob')) {
      return 'storage'
    }
    if (serviceLower.includes('database') || serviceLower.includes('sql') || serviceLower.includes('bigquery') || serviceLower.includes('spanner')) {
      return 'database'
    }
    if (serviceLower.includes('network') || serviceLower.includes('vpc') || serviceLower.includes('load') || serviceLower.includes('cdn')) {
      return 'networking'
    }
    return 'other'
  }

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Cloud Costs</h1>
            <p className="text-[15px] text-[#8E8E93] mt-1">
              Track your cloud infrastructure costs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton count={4} showDescription />
        </div>

        <div className="metric-card p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5">
            <h2 className="text-[17px] font-semibold text-black">Costs by Service</h2>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              View cloud costs across all providers and services
            </p>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <TableSkeleton rows={6} columns={6} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Cloud Costs</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            Track your cloud infrastructure costs
          </p>
        </div>

        <div className="metric-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-black text-[15px]">{error}</h3>
              <p className="text-[13px] text-[#8E8E93] mt-1">
                Please try again later or contact support if the issue persists.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Cloud Costs</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            Track your cloud infrastructure costs
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            variant="ghost"
            size="sm"
            className="h-[36px] px-4 text-[15px] text-[#8E8E93] hover:bg-[#F5F5F7] rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Link href={`/${orgSlug}/integrations/cloud-providers`}>
            <Button className="h-[36px] px-4 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Configure Cloud</span>
              <span className="sm:hidden">Configure</span>
            </Button>
          </Link>
        </div>
      </div>

      {summary && (
        <div className="space-y-6">
          <h2 className="text-[22px] font-bold text-black">Cost Summary</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <DollarSign className="h-[18px] w-[18px]" />
                  <span>Daily Cost</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.total_daily_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Current daily rate</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <Calendar className="h-[18px] w-[18px]" />
                  <span>Month-to-Date</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.mtd_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Actual spent this month</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-dark">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>YTD {new Date().getFullYear()}</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.ytd_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Jan 1 - today actual</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-teal">
                  <Cloud className="h-[18px] w-[18px]" />
                  <span>Providers</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{summary.providers_count}</div>
                <div className="metric-card-description mt-1">Active integrations</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-light">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>Monthly Forecast</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.forecast_monthly_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Projected full month</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-dark">
                  <ArrowUpRight className="h-[18px] w-[18px]" />
                  <span>Annual {new Date().getFullYear()}</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.forecast_annual_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">YTD + projected to Dec 31</div>
              </div>
            </div>

            <div className="metric-card col-span-2 lg:col-span-1">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-neutral">
                  <List className="h-[18px] w-[18px]" />
                  <span>Services</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{summary.services_count}</div>
                <div className="metric-card-description mt-1">Active services</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Costs by Service</h2>
        <div className="metric-card p-0 overflow-hidden">
          {costRecords.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
              <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-4">
                <Cloud className="h-12 w-12 text-[#007A78]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">No cloud cost data yet</h3>
              <p className="text-[15px] text-[#8E8E93] mb-6 max-w-md mx-auto">
                Configure cloud provider integrations and run the cost pipeline to start tracking infrastructure costs.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                  <Button className="h-[44px] px-6 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Configure Cloud Providers
                  </Button>
                </Link>
                <Link href={`/${orgSlug}/pipelines/cost-runs`}>
                  <Button variant="outline" className="h-[44px] px-6 border-[#007A78] text-[#007A78] hover:bg-[#007A78]/5 rounded-xl text-[15px] font-semibold">
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Run Pipeline
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[700px]">
                <TableHeader>
                  <TableRow className="border-b border-[#E5E5EA]">
                    <TableHead className="console-table-header">Provider</TableHead>
                    <TableHead className="console-table-header">Service</TableHead>
                    <TableHead className="console-table-header">Project</TableHead>
                    <TableHead className="console-table-header text-right">Usage</TableHead>
                    <TableHead className="console-table-header text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRecords.map((record) => {
                    const serviceCategory = getServiceCategory(record.service)
                    const ServiceIcon = SERVICE_ICONS[serviceCategory] || Cloud
                    return (
                      <TableRow key={record.id} className="console-table-row">
                        <TableCell className="console-table-cell">
                          <Badge className={`uppercase text-[11px] font-semibold px-2.5 py-1 ${PROVIDER_COLORS[record.provider.toLowerCase()] || PROVIDER_COLORS.other}`}>
                            {record.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <div className="flex items-center gap-2">
                            <ServiceIcon className="h-4 w-4 text-[#007A78]" />
                            <span className="font-medium text-black text-[15px]">{record.service}</span>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="text-[#8E8E93] text-[15px]">{record.project || '-'}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="text-[#8E8E93] text-[15px]">
                            {record.usage_amount.toLocaleString()} {record.usage_unit}
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="font-bold text-black text-[17px]">{formatCurrency(record.cost, orgCurrency)}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
