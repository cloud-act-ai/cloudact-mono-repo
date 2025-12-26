"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Brain,
  DollarSign,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  Plus,
  AlertCircle,
  RefreshCw,
  Zap,
  MessageSquare,
  FileText,
  Sparkles,
  Activity,
  Target,
  BarChart3,
  PieChart,
  Layers,
  ChevronRight,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

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
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// GenAI Provider icons
const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  openai: Zap,
  anthropic: MessageSquare,
  google: Brain,
  deepseek: FileText,
  other: Brain,
}

// Provider colors - CloudAct coral-themed
const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/20",
  anthropic: "bg-[var(--cloudact-coral-light)]/10 text-[var(--cloudact-coral-light)] border border-[var(--cloudact-coral-light)]/20",
  google: "bg-[#FFAA8F]/10 text-[var(--cloudact-coral)] border border-[#FFAA8F]/20",
  deepseek: "bg-[#FFC8AF]/10 text-[var(--cloudact-coral)] border border-[#FFC8AF]/20",
  other: "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border",
}

// Chart colors for providers
const CHART_COLORS = {
  openai: "var(--cloudact-coral)",
  anthropic: "var(--cloudact-coral-light)",
  google: "#FFAA8F",
  deepseek: "#FFC8AF",
  other: "var(--cloudact-mint)",
}

interface LLMUsageSummary {
  total_daily_cost: number
  total_monthly_cost: number
  total_annual_cost: number
  ytd_cost: number
  mtd_cost: number
  forecast_monthly_cost: number
  forecast_annual_cost: number
  total_tokens: number
  total_requests: number
  providers_count: number
}

interface LLMUsageRecord {
  id: string
  provider: string
  model: string
  date: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost: number
  requests: number
}

// Mock data for demo - will be replaced with real data
const mockTrendData = [
  { date: "Dec 17", openai: 245, anthropic: 189, google: 142, deepseek: 87 },
  { date: "Dec 18", openai: 278, anthropic: 205, google: 156, deepseek: 92 },
  { date: "Dec 19", openai: 312, anthropic: 198, google: 167, deepseek: 101 },
  { date: "Dec 20", openai: 289, anthropic: 223, google: 178, deepseek: 95 },
  { date: "Dec 21", openai: 334, anthropic: 241, google: 185, deepseek: 108 },
  { date: "Dec 22", openai: 367, anthropic: 256, google: 192, deepseek: 114 },
  { date: "Dec 23", openai: 401, anthropic: 278, google: 205, deepseek: 122 },
]

const mockProviderBreakdown = [
  { name: "OpenAI", value: 2226, color: CHART_COLORS.openai },
  { name: "Anthropic", value: 1590, color: CHART_COLORS.anthropic },
  { name: "Google", value: 1225, color: CHART_COLORS.google },
  { name: "DeepSeek", value: 719, color: CHART_COLORS.deepseek },
]

const mockModelComparison = [
  { model: "GPT-4o", cost: 1245, tokens: 4500000 },
  { model: "Claude Opus 4", cost: 981, tokens: 3200000 },
  { model: "Claude Sonnet 4", cost: 609, tokens: 5100000 },
  { model: "Gemini Pro", cost: 756, tokens: 6800000 },
  { model: "GPT-3.5 Turbo", cost: 334, tokens: 8900000 },
]

const mockTopApps = [
  { app: "Customer Support Bot", cost: 1834, requests: 45230, trend: "+12%" },
  { app: "Content Generator", cost: 1256, requests: 32890, trend: "+8%" },
  { app: "Code Assistant", cost: 987, requests: 28450, trend: "+15%" },
  { app: "Data Analyzer", cost: 723, requests: 19870, trend: "+5%" },
  { app: "Translation Service", cost: 560, requests: 15690, trend: "-2%" },
]

export default function GenAICostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [usageRecords, setUsageRecords] = useState<LLMUsageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [summary, setSummary] = useState<LLMUsageSummary | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

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

      // For now, show placeholder data - will be populated by LLM usage pipeline
      // This would be replaced with actual API call to fetch LLM usage data
      setSummary({
        total_daily_cost: 0,
        total_monthly_cost: 0,
        total_annual_cost: 0,
        ytd_cost: 0,
        mtd_cost: 0,
        forecast_monthly_cost: 0,
        forecast_annual_cost: 0,
        total_tokens: 0,
        total_requests: 0,
        providers_count: 0,
      })
      setUsageRecords([])
    } catch (err) {
      setError("Failed to load GenAI cost data. Please try again.")
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

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            GenAI Costs
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Monitor your AI and ML service usage costs
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton count={4} showDescription />
        </div>

        <div className="metric-card p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5">
            <h2 className="text-[17px] font-semibold text-slate-900">Usage by Provider</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              View LLM API usage across all providers
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
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            GenAI Costs
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Monitor your AI and ML service usage costs
          </p>
        </div>

        <div className="metric-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-900 text-[15px]">{error}</h3>
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
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
              GenAI Costs
            </h1>
            <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
              Monitor your AI and ML service usage costs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              variant="ghost"
              size="sm"
              className="h-11 px-4 text-[15px] text-muted-foreground hover:bg-[var(--cloudact-coral)]/5 rounded-xl transition-all duration-200"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Link href={`/${orgSlug}/integrations/genai`}>
              <Button className="h-11 px-4 rounded-xl text-[15px] font-semibold bg-gradient-to-r from-[var(--cloudact-coral)] to-[#FFA591] hover:from-[#FF5947] hover:to-[#FF9684] text-white shadow-lg shadow-[var(--cloudact-coral)]/25 transition-all duration-200 hover:shadow-xl hover:shadow-[var(--cloudact-coral)]/30">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Configure LLM</span>
                <span className="sm:hidden">Configure</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[var(--cloudact-coral)]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">{summary?.providers_count || 0}</p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">Active Providers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">{summary?.total_requests.toLocaleString() || 0}</p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">API Requests</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">{formatCurrency(summary?.mtd_cost || 0, orgCurrency)}</p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">MTD Spend</p>
            </div>
          </div>
        </div>
      </div>

      {summary && (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="metric-card group hover:shadow-lg hover:shadow-[var(--cloudact-coral)]/10 transition-all duration-300 cursor-pointer">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[var(--cloudact-coral)]/15 to-[#FF6E50]/5 text-[var(--cloudact-coral)] border-[var(--cloudact-coral)]/20">
                  <DollarSign className="h-[18px] w-[18px]" />
                  <span>MTD Spend</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value text-[var(--cloudact-coral)]">{formatCurrency(summary.mtd_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1 flex items-center gap-2">
                  <span>This month actual</span>
                  <div className="ml-auto text-xs font-bold text-[var(--cloudact-coral)] bg-[var(--cloudact-coral)]/10 px-2 py-0.5 rounded-md">
                    +0%
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card group hover:shadow-lg hover:shadow-[var(--cloudact-coral-light)]/10 transition-all duration-300 cursor-pointer">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[var(--cloudact-coral-light)]/15 to-[#FFA591]/5 text-[var(--cloudact-coral-light)] border-[var(--cloudact-coral-light)]/20">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>Monthly Forecast</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value text-[var(--cloudact-coral-light)]">{formatCurrency(summary.forecast_monthly_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Projected full month</div>
              </div>
            </div>

            <div className="metric-card group hover:shadow-lg hover:shadow-[#FFAA8F]/10 transition-all duration-300 cursor-pointer">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[#FFAA8F]/15 to-[#FFAA8F]/5 text-[var(--cloudact-coral)] border-[#FFAA8F]/20">
                  <Zap className="h-[18px] w-[18px]" />
                  <span>Total Tokens</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value text-[var(--cloudact-coral)]">{summary.total_tokens.toLocaleString()}</div>
                <div className="metric-card-description mt-1">This month</div>
              </div>
            </div>

            <div className="metric-card group hover:shadow-lg hover:shadow-[var(--cloudact-mint)]/10 transition-all duration-300 cursor-pointer">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-teal">
                  <Activity className="h-[18px] w-[18px]" />
                  <span>API Requests</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value text-[var(--cloudact-mint-text)]">{summary.total_requests.toLocaleString()}</div>
                <div className="metric-card-description mt-1">This month</div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cost Trend Chart - Takes 2 columns */}
            <div className="lg:col-span-2 metric-card h-[380px] flex flex-col overflow-hidden">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[var(--cloudact-coral)]/15 to-[#FF6E50]/5 text-[var(--cloudact-coral)] border-[var(--cloudact-coral)]/20">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>Cost Trends (Last 7 Days)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-[var(--cloudact-coral)] bg-[var(--cloudact-coral)]/10 px-2.5 py-1 rounded-lg border border-[var(--cloudact-coral)]/20">
                    +18.2%
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full mt-4 px-2" style={{ minHeight: 250 }}>
                {isMounted && (
                  <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                    <AreaChart data={mockTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorOpenAI" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.openai} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.openai} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorAnthropic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.anthropic} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.anthropic} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorGoogle" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.google} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.google} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorDeepSeek" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.deepseek} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.deepseek} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E5EA" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#8E8E93" }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#8E8E93" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #E5E5EA",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          backgroundColor: "rgba(255,255,255,0.98)",
                        }}
                        cursor={{ stroke: "#FF6E50", strokeWidth: 1, strokeDasharray: "4 4" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="openai"
                        stackId="1"
                        stroke={CHART_COLORS.openai}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorOpenAI)"
                      />
                      <Area
                        type="monotone"
                        dataKey="anthropic"
                        stackId="1"
                        stroke={CHART_COLORS.anthropic}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorAnthropic)"
                      />
                      <Area
                        type="monotone"
                        dataKey="google"
                        stackId="1"
                        stroke={CHART_COLORS.google}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorGoogle)"
                      />
                      <Area
                        type="monotone"
                        dataKey="deepseek"
                        stackId="1"
                        stroke={CHART_COLORS.deepseek}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorDeepSeek)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Provider Breakdown Pie Chart */}
            <div className="metric-card h-[380px] flex flex-col overflow-hidden">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[var(--cloudact-coral)]/15 to-[#FF6E50]/5 text-[var(--cloudact-coral)] border-[var(--cloudact-coral)]/20">
                  <PieChart className="h-[18px] w-[18px]" />
                  <span>By Provider</span>
                </div>
              </div>
              <div className="flex-1 w-full mt-2 flex items-center justify-center" style={{ minHeight: 250 }}>
                {isMounted && (
                  <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                    <RechartsPieChart>
                      <Pie
                        data={mockProviderBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {mockProviderBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #E5E5EA",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          backgroundColor: "rgba(255,255,255,0.98)",
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-2">
                  {mockProviderBreakdown.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Model Comparison & Top Apps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model Usage Comparison */}
            <div className="metric-card overflow-hidden">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[var(--cloudact-coral-light)]/15 to-[#FFA591]/5 text-[var(--cloudact-coral-light)] border-[var(--cloudact-coral-light)]/20">
                  <Layers className="h-[18px] w-[18px]" />
                  <span>Model Comparison</span>
                </div>
              </div>
              <div className="mt-4 space-y-3 px-4 pb-4">
                {mockModelComparison.map((model, index) => (
                  <div
                    key={model.model}
                    className="group p-4 rounded-xl bg-gradient-to-r from-white to-[#FF6E50]/5 border border-border hover:border-[var(--cloudact-coral)]/30 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--cloudact-coral)]/20 to-[#FF6E50]/5 text-[var(--cloudact-coral)] font-bold text-sm">
                          {index + 1}
                        </div>
                        <span className="font-semibold text-slate-900 text-[15px]">{model.model}</span>
                      </div>
                      <span className="font-bold text-[var(--cloudact-coral)] text-[17px]">{formatCurrency(model.cost, orgCurrency)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="h-3.5 w-3.5" />
                      <span>{(model.tokens / 1000000).toFixed(1)}M tokens</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Consuming Applications */}
            <div className="metric-card overflow-hidden">
              <div className="metric-card-header">
                <div className="metric-card-label bg-gradient-to-r from-[#FFAA8F]/15 to-[#FFAA8F]/5 text-[var(--cloudact-coral)] border-[#FFAA8F]/20">
                  <Target className="h-[18px] w-[18px]" />
                  <span>Top Applications</span>
                </div>
              </div>
              <div className="mt-4 space-y-3 px-4 pb-4">
                {mockTopApps.map((app, index) => (
                  <div
                    key={app.app}
                    className="group p-4 rounded-xl bg-gradient-to-r from-white to-[var(--cloudact-mint)]/5 border border-border hover:border-[var(--cloudact-mint)]/30 hover:shadow-md transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900 text-[15px] truncate">{app.app}</span>
                          <Badge className={`text-[10px] font-bold px-2 py-0.5 ${
                            app.trend.startsWith('+')
                              ? 'bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border-[var(--cloudact-coral)]/20'
                              : 'bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-text)] border-[var(--cloudact-mint)]/20'
                          }`}>
                            {app.trend}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{app.requests.toLocaleString()} requests</span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="font-bold text-[var(--cloudact-mint-text)] text-[17px]">{formatCurrency(app.cost, orgCurrency)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-light">
                  <Calendar className="h-[18px] w-[18px]" />
                  <span>Daily Average</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.total_daily_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Current daily rate</div>
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
                  <Brain className="h-[18px] w-[18px]" />
                  <span>Active Providers</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{summary.providers_count}</div>
                <div className="metric-card-description mt-1">Integrations configured</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-neutral">
                  <BarChart3 className="h-[18px] w-[18px]" />
                  <span>Annual Forecast</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.forecast_annual_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Projected full year</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Usage Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Detailed Usage</h2>
          <Link href={`/${orgSlug}/cost-dashboards/genai-costs/details`}>
            <Button variant="ghost" className="text-[var(--cloudact-coral)] hover:bg-[var(--cloudact-coral)]/5 text-[14px] font-semibold">
              View All
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="metric-card p-0 overflow-hidden">
          {usageRecords.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
              <div className="inline-flex p-5 rounded-2xl bg-gradient-to-br from-[var(--cloudact-coral)]/20 to-[#FF6E50]/5 border border-[var(--cloudact-coral)]/20 mb-5">
                <Brain className="h-14 w-14 text-[var(--cloudact-coral)]" />
              </div>
              <h3 className="text-[20px] font-semibold text-slate-900 mb-2">No LLM usage data yet</h3>
              <p className="text-[15px] text-muted-foreground mb-6 max-w-md mx-auto">
                Configure LLM integrations and run the GenAI pipeline to start tracking usage costs.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href={`/${orgSlug}/integrations/genai`}>
                  <Button className="h-11 px-6 rounded-xl text-[15px] font-semibold bg-gradient-to-r from-[var(--cloudact-coral)] to-[#FFA591] hover:from-[#FF5947] hover:to-[#FF9684] text-white shadow-lg shadow-[var(--cloudact-coral)]/25">
                    <Plus className="h-4 w-4 mr-2" />
                    Configure GenAI Providers
                  </Button>
                </Link>
                <Link href={`/${orgSlug}/pipelines/genai-runs`}>
                  <Button variant="outline" className="console-button-secondary h-11 px-6 rounded-xl text-[15px] font-semibold border-[var(--cloudact-coral)]/30 text-[var(--cloudact-coral)] hover:bg-[var(--cloudact-coral)]/5">
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
                  <TableRow className="border-b border-border bg-[#F9FAFB]">
                    <TableHead className="console-table-header">Provider</TableHead>
                    <TableHead className="console-table-header">Model</TableHead>
                    <TableHead className="console-table-header text-right">Input Tokens</TableHead>
                    <TableHead className="console-table-header text-right">Output Tokens</TableHead>
                    <TableHead className="console-table-header text-right">Requests</TableHead>
                    <TableHead className="console-table-header text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageRecords.map((record) => {
                    const ProviderIcon = PROVIDER_ICONS[record.provider] || Brain
                    return (
                      <TableRow key={record.id} className="console-table-row hover:bg-[var(--cloudact-coral)]/5 transition-colors duration-150">
                        <TableCell className="console-table-cell">
                          <div className="flex items-center gap-2">
                            <ProviderIcon className="h-4 w-4 text-[var(--cloudact-coral)]" />
                            <Badge className={`capitalize text-[11px] font-semibold px-2.5 py-1 ${PROVIDER_COLORS[record.provider] || PROVIDER_COLORS.other}`}>
                              {record.provider}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="font-medium text-slate-900 text-[15px]">{record.model}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="text-muted-foreground text-[15px]">{record.input_tokens.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="text-muted-foreground text-[15px]">{record.output_tokens.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="text-muted-foreground text-[15px]">{record.requests.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <span className="font-bold text-[var(--cloudact-coral)] text-[17px]">{formatCurrency(record.cost, orgCurrency)}</span>
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
