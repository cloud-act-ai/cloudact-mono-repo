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
  Sparkles,
  Zap,
  Activity,
  BarChart3,
  ArrowDown,
  ArrowUp,
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
  other: "bg-[#007A78]/5 text-muted-foreground border border-border",
}

// Provider gradient classes for constellation
const PROVIDER_GRADIENTS: Record<string, string> = {
  gcp: "from-[#007A78] to-[#14b8a6]",
  aws: "from-[#FF6E50] to-[#ff8a73]",
  azure: "from-[#005F5D] to-[#007A78]",
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
    } catch {
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
            <p className="text-[15px] text-muted-foreground mt-1">
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
            <p className="text-[13px] text-muted-foreground mt-0.5">
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
          <p className="text-[15px] text-muted-foreground mt-1">
            Track your cloud infrastructure costs
          </p>
        </div>

        <div className="metric-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-black text-[15px]">{error}</h3>
              <p className="text-[13px] text-muted-foreground mt-1">
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
      {/* Enhanced Hero Section with Animated Gradient Text */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#007A78]/5 via-white to-[#FF6E50]/5 border border-[#007A78]/10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,122,120,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,122,120,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>

        <div className="relative px-6 sm:px-8 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#007A78]/10 border border-[#007A78]/20">
                <Sparkles className="h-3.5 w-3.5 text-[#007A78]" />
                <span className="text-[13px] font-semibold text-[#007A78]">Cloud Infrastructure</span>
              </div>

              <h1 className="text-[40px] sm:text-[48px] font-bold tracking-tight bg-gradient-to-r from-[#007A78] via-[#14b8a6] to-[#FF6E50] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                Cloud Costs
              </h1>

              <p className="text-[17px] text-muted-foreground max-w-2xl">
                Monitor infrastructure spending across GCP, AWS, and Azure in real-time with intelligent analytics
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                variant="ghost"
                size="sm"
                className="h-11 px-4 text-[15px] text-muted-foreground hover:bg-[#007A78]/5 rounded-xl group"
              >
                <RefreshCw className={`h-4 w-4 mr-2 group-hover:text-[#007A78] transition-colors ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                <Button className="console-button-primary h-11 px-5 rounded-xl text-[15px] font-semibold shadow-lg hover:shadow-xl transition-all">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Configure Cloud</span>
                  <span className="sm:hidden">Configure</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Constellation Visualization */}
      {summary && summary.providers_count > 0 && (
        <div className="metric-card p-6 sm:p-8 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[#007A78]/5 via-transparent to-[#FF6E50]/5 pointer-events-none"></div>

          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[22px] font-bold text-black mb-1">Provider Ecosystem</h2>
                <p className="text-[15px] text-muted-foreground">Active cloud integrations</p>
              </div>
              <Badge className="bg-[#007A78]/10 text-[#007A78] border border-[#007A78]/20 px-3 py-1.5 text-[15px] font-semibold">
                {summary.providers_count} Provider{summary.providers_count !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['gcp', 'aws', 'azure'].map((provider, idx) => (
                <div
                  key={provider}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-white to-gray-50/50 p-6 hover:shadow-lg transition-all duration-300"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${PROVIDER_GRADIENTS[provider]} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>

                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <Cloud className={`h-8 w-8 ${provider === 'gcp' ? 'text-[#007A78]' : provider === 'aws' ? 'text-[#FF6E50]' : 'text-[#005F5D]'}`} />
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    </div>

                    <h3 className="text-[18px] font-bold text-black uppercase mb-1">{provider}</h3>
                    <p className="text-[13px] text-muted-foreground">
                      {provider === 'gcp' ? 'Google Cloud' : provider === 'aws' ? 'Amazon Web Services' : 'Microsoft Azure'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Cost Summary Grid */}
      {summary && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1 bg-gradient-to-b from-[#007A78] to-[#FF6E50] rounded-full"></div>
            <h2 className="text-[24px] font-bold text-black">Cost Overview</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Daily Cost */}
            <div className="metric-card group hover:shadow-xl transition-all duration-300">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <div className="p-2 rounded-xl bg-[#FF6E50]/10 group-hover:bg-[#FF6E50]/20 transition-colors">
                    <DollarSign className="h-[18px] w-[18px]" />
                  </div>
                  <span>Daily Cost</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value bg-gradient-to-r from-[#FF6E50] to-[#ff8a73] bg-clip-text text-transparent">
                  {formatCurrency(summary.total_daily_cost, orgCurrency)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Current rate</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Month-to-Date */}
            <div className="metric-card group hover:shadow-xl transition-all duration-300">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <div className="p-2 rounded-xl bg-[#FF6E50]/10 group-hover:bg-[#FF6E50]/20 transition-colors">
                    <Calendar className="h-[18px] w-[18px]" />
                  </div>
                  <span>Month-to-Date</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.mtd_cost, orgCurrency)}</div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#007A78]/10 text-[#007A78] text-[12px] font-semibold">
                    <ArrowUp className="h-3 w-3" />
                    <span>Tracking</span>
                  </div>
                </div>
              </div>
            </div>

            {/* YTD */}
            <div className="metric-card group hover:shadow-xl transition-all duration-300">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-dark">
                  <div className="p-2 rounded-xl bg-[#E55A3C]/10 group-hover:bg-[#E55A3C]/20 transition-colors">
                    <TrendingUp className="h-[18px] w-[18px]" />
                  </div>
                  <span>YTD {new Date().getFullYear()}</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.ytd_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-2">Jan 1 - today actual</div>
              </div>
            </div>

            {/* Active Providers */}
            <div className="metric-card group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-[#007A78]/5">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-teal">
                  <div className="p-2 rounded-xl bg-[#007A78]/10 group-hover:bg-[#007A78]/20 transition-colors">
                    <Cloud className="h-[18px] w-[18px]" />
                  </div>
                  <span>Providers</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value bg-gradient-to-r from-[#007A78] to-[#14b8a6] bg-clip-text text-transparent">
                  {summary.providers_count}
                </div>
                <div className="metric-card-description mt-2">Active integrations</div>
              </div>
            </div>
          </div>

          {/* Forecast & Services */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Monthly Forecast */}
            <div className="metric-card relative overflow-hidden group hover:shadow-xl transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6E50]/5 rounded-full blur-3xl group-hover:bg-[#FF6E50]/10 transition-colors"></div>

              <div className="relative">
                <div className="metric-card-header">
                  <div className="metric-card-label metric-card-label-coral-light">
                    <div className="p-2 rounded-xl bg-[#FF8A73]/10 group-hover:bg-[#FF8A73]/20 transition-colors">
                      <TrendingUp className="h-[18px] w-[18px]" />
                    </div>
                    <span>Monthly Forecast</span>
                  </div>
                </div>
                <div className="metric-card-content">
                  <div className="metric-card-value">{formatCurrency(summary.forecast_monthly_cost, orgCurrency)}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Zap className="h-3.5 w-3.5 text-[#FF6E50]" />
                    <span className="text-[13px] text-muted-foreground">Projected full month</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Annual Forecast */}
            <div className="metric-card relative overflow-hidden group hover:shadow-xl transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#E55A3C]/5 rounded-full blur-3xl group-hover:bg-[#E55A3C]/10 transition-colors"></div>

              <div className="relative">
                <div className="metric-card-header">
                  <div className="metric-card-label metric-card-label-coral-dark">
                    <div className="p-2 rounded-xl bg-[#E55A3C]/10 group-hover:bg-[#E55A3C]/20 transition-colors">
                      <ArrowUpRight className="h-[18px] w-[18px]" />
                    </div>
                    <span>Annual {new Date().getFullYear()}</span>
                  </div>
                </div>
                <div className="metric-card-content">
                  <div className="metric-card-value">{formatCurrency(summary.forecast_annual_cost, orgCurrency)}</div>
                  <div className="metric-card-description mt-2">YTD + projected to Dec 31</div>
                </div>
              </div>
            </div>

            {/* Active Services */}
            <div className="metric-card col-span-2 lg:col-span-1 relative overflow-hidden group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-[#007A78]/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#007A78]/5 rounded-full blur-3xl group-hover:bg-[#007A78]/10 transition-colors"></div>

              <div className="relative">
                <div className="metric-card-header">
                  <div className="metric-card-label metric-card-label-teal">
                    <div className="p-2 rounded-xl bg-[#007A78]/10 group-hover:bg-[#007A78]/20 transition-colors">
                      <List className="h-[18px] w-[18px]" />
                    </div>
                    <span>Services</span>
                  </div>
                </div>
                <div className="metric-card-content">
                  <div className="metric-card-value bg-gradient-to-r from-[#007A78] to-[#14b8a6] bg-clip-text text-transparent">
                    {summary.services_count}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <BarChart3 className="h-3.5 w-3.5 text-[#007A78]" />
                    <span className="text-[13px] text-muted-foreground">Active services</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Cost Breakdown Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1 bg-gradient-to-b from-[#007A78] to-[#FF6E50] rounded-full"></div>
          <h2 className="text-[24px] font-bold text-black">Service Breakdown</h2>
        </div>

        <div className="metric-card p-0 overflow-hidden">
          {costRecords.length === 0 ? (
            <div className="text-center py-16 sm:py-20 px-4 sm:px-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[#007A78]/5 via-transparent to-[#FF6E50]/5 pointer-events-none"></div>

              <div className="relative">
                <div className="inline-flex p-5 rounded-3xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 mb-6 shadow-lg border border-[#007A78]/10">
                  <Cloud className="h-16 w-16 text-[#007A78]" />
                </div>

                <h3 className="text-[24px] font-bold text-black mb-3">No cloud cost data yet</h3>
                <p className="text-[17px] text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
                  Configure cloud provider integrations and run the cost pipeline to start tracking infrastructure costs across GCP, AWS, and Azure.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <Button className="console-button-primary h-12 px-7 rounded-xl text-[16px] font-semibold shadow-lg hover:shadow-xl transition-all group">
                      <Plus className="h-5 w-5 mr-2 group-hover:rotate-90 transition-transform duration-300" />
                      Configure Cloud Providers
                    </Button>
                  </Link>
                  <Link href={`/${orgSlug}/pipelines/cost-runs`}>
                    <Button variant="outline" className="console-button-secondary h-12 px-7 rounded-xl text-[16px] font-semibold border-2 hover:bg-[#007A78]/5 transition-all group">
                      <ArrowUpRight className="h-5 w-5 mr-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      Run Pipeline
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[700px]">
                <TableHeader>
                  <TableRow className="border-b border-border bg-gradient-to-r from-[#007A78]/5 via-transparent to-[#FF6E50]/5">
                    <TableHead className="console-table-header">Provider</TableHead>
                    <TableHead className="console-table-header">Service</TableHead>
                    <TableHead className="console-table-header">Project</TableHead>
                    <TableHead className="console-table-header text-right">Usage</TableHead>
                    <TableHead className="console-table-header text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRecords.map((record, idx) => {
                    const serviceCategory = getServiceCategory(record.service)
                    const ServiceIcon = SERVICE_ICONS[serviceCategory] || Cloud
                    return (
                      <TableRow
                        key={record.id}
                        className="console-table-row group hover:bg-gradient-to-r hover:from-[#007A78]/5 hover:via-transparent hover:to-transparent transition-all"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <TableCell className="console-table-cell">
                          <Badge className={`uppercase text-[11px] font-semibold px-3 py-1.5 ${PROVIDER_COLORS[record.provider.toLowerCase()] || PROVIDER_COLORS.other} group-hover:shadow-sm transition-shadow`}>
                            {record.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[#007A78]/10 group-hover:bg-[#007A78]/20 transition-colors">
                              <ServiceIcon className="h-4 w-4 text-[#007A78]" />
                            </div>
                            <span className="font-semibold text-black text-[15px]">{record.service}</span>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="text-muted-foreground text-[15px]">{record.project || '-'}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground text-[15px]">
                              {record.usage_amount.toLocaleString()} {record.usage_unit}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="font-bold text-black text-[17px] bg-gradient-to-r from-[#FF6E50] to-[#ff8a73] bg-clip-text text-transparent">
                            {formatCurrency(record.cost, orgCurrency)}
                          </span>
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

      {/* Quick Action Cards with Hover Effects */}
      {costRecords.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="metric-card group cursor-pointer hover:shadow-xl hover:scale-105 transition-all duration-300 bg-gradient-to-br from-white to-[#007A78]/5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-[#007A78]/10 group-hover:bg-[#007A78]/20 transition-colors">
                <Server className="h-6 w-6 text-[#007A78]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-black mb-1 group-hover:text-[#007A78] transition-colors">GCP Integration</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">Connect Google Cloud Platform</p>
              </div>
            </div>
          </div>

          <div className="metric-card group cursor-pointer hover:shadow-xl hover:scale-105 transition-all duration-300 bg-gradient-to-br from-white to-[#FF6E50]/5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-[#FF6E50]/10 group-hover:bg-[#FF6E50]/20 transition-colors">
                <Database className="h-6 w-6 text-[#FF6E50]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-black mb-1 group-hover:text-[#FF6E50] transition-colors">AWS Integration</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">Connect Amazon Web Services</p>
              </div>
            </div>
          </div>

          <div className="metric-card group cursor-pointer hover:shadow-xl hover:scale-105 transition-all duration-300 bg-gradient-to-br from-white to-[#005F5D]/5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-[#005F5D]/10 group-hover:bg-[#005F5D]/20 transition-colors">
                <Network className="h-6 w-6 text-[#005F5D]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-black mb-1 group-hover:text-[#005F5D] transition-colors">Azure Integration</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">Connect Microsoft Azure</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  )
}
