"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  TrendingUp,
  DollarSign,
  Cloud,
  Sparkles,
  Play,
  Settings,
  BarChart3,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Zap,
  Users,
  Database,
  Loader2,
  RefreshCw,
  Brain,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getTotalCosts, type TotalCostSummary } from "@/actions/costs"
import { getPipelineRuns } from "@/actions/pipelines"
import { getIntegrations } from "@/actions/integrations"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/i18n"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import type { PipelineRunSummary } from "@/lib/api/backend"

interface QuickAction {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  color: "teal" | "coral" | "purple"
}

interface IntegrationItem {
  name: string
  provider: string
  status: "connected" | "pending" | "not_connected"
}

export default function DashboardPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [greeting, setGreeting] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [costSummary, setCostSummary] = useState<TotalCostSummary | null>(null)
  const [recentPipelines, setRecentPipelines] = useState<PipelineRunSummary[]>([])
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([])
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const [costsResult, pipelinesResult, integrationsResult, orgResult] = await Promise.all([
        getTotalCosts(orgSlug),
        getPipelineRuns(orgSlug, { limit: 5 }),
        getIntegrations(orgSlug),
        supabase
          .from("organizations")
          .select("locale_currency")
          .eq("org_slug", orgSlug)
          .single(),
      ])

      if (costsResult.success && costsResult.data) {
        setCostSummary(costsResult.data)
      }

      if (pipelinesResult.success && pipelinesResult.data?.runs) {
        setRecentPipelines(pipelinesResult.data.runs.slice(0, 5))
      }

      if (integrationsResult.success && integrationsResult.integrations) {
        const integrationList: IntegrationItem[] = []
        const intData = integrationsResult.integrations.integrations

        // Map provider names to display names
        const providerNames: Record<string, string> = {
          OPENAI: "OpenAI",
          ANTHROPIC: "Anthropic",
          GEMINI: "Google Gemini",
          DEEPSEEK: "DeepSeek",
          GCP_SA: "Google Cloud",
          AWS_IAM: "AWS",
          AZURE: "Azure",
          OCI: "Oracle Cloud",
        }

        for (const [key, value] of Object.entries(intData)) {
          const status = value.status === "VALID"
            ? "connected"
            : value.status === "PENDING"
            ? "pending"
            : "not_connected"

          integrationList.push({
            name: providerNames[key] || key,
            provider: key,
            status,
          })
        }

        // Sort: connected first, then pending, then not_connected
        integrationList.sort((a, b) => {
          const order = { connected: 0, pending: 1, not_connected: 2 }
          return order[a.status] - order[b.status]
        })

        setIntegrations(integrationList.slice(0, 4))
      }

      if (orgResult.data?.locale_currency) {
        setOrgCurrency(orgResult.data.locale_currency)
      }
    } catch {
      // Silently handle errors - show empty state
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting("Good morning")
    else if (hour < 18) setGreeting("Good afternoon")
    else setGreeting("Good evening")

    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  const quickActions: QuickAction[] = [
    {
      title: "Run Pipeline",
      description: "Execute data pipelines to sync costs",
      href: `/${orgSlug}/pipelines`,
      icon: <Play className="h-5 w-5" />,
      color: "teal",
    },
    {
      title: "View Analytics",
      description: "Deep dive into cost trends",
      href: `/${orgSlug}/cost-dashboards/overview`,
      icon: <BarChart3 className="h-5 w-5" />,
      color: "purple",
    },
    {
      title: "Manage Settings",
      description: "Configure integrations and team",
      href: `/${orgSlug}/settings/organization`,
      icon: <Settings className="h-5 w-5" />,
      color: "coral",
    },
  ]

  const getPipelineIcon = (pipelineId: string) => {
    if (pipelineId.includes("openai") || pipelineId.includes("anthropic") || pipelineId.includes("gemini")) {
      return <Brain className="h-4 w-4" />
    }
    if (pipelineId.includes("gcp") || pipelineId.includes("aws") || pipelineId.includes("azure")) {
      return <Cloud className="h-4 w-4" />
    }
    if (pipelineId.includes("saas") || pipelineId.includes("subscription")) {
      return <Wallet className="h-4 w-4" />
    }
    return <Database className="h-4 w-4" />
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
        return "bg-[#90FCA6]/10 text-[#1a7a3a] border-[#90FCA6]/20"
      case "running":
      case "in_progress":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
      case "failed":
      case "error":
        return "bg-red-500/10 text-red-600 border-red-500/20"
      default:
        return "bg-slate-100 text-slate-600 border-slate-200"
    }
  }

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return "Unknown"
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Welcome Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
            {greeting}
          </h1>
          <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
            Here&#39;s what&#39;s happening with your cloud costs today.
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="h-10 sm:h-9 w-full sm:w-auto flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Metric Cards Grid - Mobile optimized Apple Health Style */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total Spend */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Total</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(costSummary?.total?.total_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">all services</div>
        </div>

        {/* GenAI Costs */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <Brain className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#10A37F]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">GenAI</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(costSummary?.llm?.total_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
            {costSummary?.llm?.providers?.length || 0} providers
          </div>
        </div>

        {/* Cloud Costs */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <Cloud className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#4285F4]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Cloud</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(costSummary?.cloud?.total_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
            {costSummary?.cloud?.providers?.length || 0} providers
          </div>
        </div>

        {/* SaaS Costs */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#FF6C5E]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">SaaS</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(costSummary?.saas?.total_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
            {costSummary?.saas?.providers?.length || 0} subs
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cost Overview Link - Larger column */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[17px] font-bold text-slate-900">Cost Breakdown</CardTitle>
                <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                  <button className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Horizontal bar breakdown */}
              <div className="space-y-4">
                {[
                  { name: "GenAI", cost: costSummary?.llm?.total_monthly_cost || 0, color: "bg-[#10A37F]", icon: Brain },
                  { name: "Cloud", cost: costSummary?.cloud?.total_monthly_cost || 0, color: "bg-[#4285F4]", icon: Cloud },
                  { name: "SaaS", cost: costSummary?.saas?.total_monthly_cost || 0, color: "bg-[#FF6C5E]", icon: Wallet },
                ].map((item) => {
                  const totalCost = (costSummary?.total?.total_monthly_cost || 1)
                  const percentage = totalCost > 0 ? (item.cost / totalCost) * 100 : 0
                  const Icon = item.icon

                  return (
                    <div key={item.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-500" />
                          <span className="text-sm font-medium text-slate-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-900">
                          {formatCurrency(item.cost, orgCurrency)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(percentage, 0)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <Link href={`/${orgSlug}/cost-dashboards/overview`} className="block mt-6">
                <button className="w-full inline-flex items-center justify-center gap-2 h-11 px-6 bg-[#90FCA6] text-slate-900 text-[13px] font-semibold rounded-xl hover:bg-[#B8FDCA] shadow-sm hover:shadow-md transition-all">
                  <BarChart3 className="h-4 w-4" />
                  Open Cost Analytics
                </button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Integration Status - Smaller column */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-[17px] font-bold text-slate-900">Integrations</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {integrations.length > 0 ? (
                  integrations.map((integration) => (
                    <div
                      key={integration.provider}
                      className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-white to-[#90FCA6]/5 border border-border hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#90FCA6]/10">
                          {integration.provider.includes("GCP") || integration.provider.includes("AWS") || integration.provider.includes("AZURE") ? (
                            <Cloud className="h-4 w-4 text-[#1a7a3a]" />
                          ) : (
                            <Zap className="h-4 w-4 text-[#1a7a3a]" />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-slate-900">
                          {integration.name}
                        </span>
                      </div>
                      <Badge
                        variant={
                          integration.status === "connected"
                            ? "success"
                            : integration.status === "pending"
                            ? "warning"
                            : "outline"
                        }
                        className="text-[11px]"
                      >
                        {integration.status === "connected"
                          ? "Connected"
                          : integration.status === "pending"
                          ? "Pending"
                          : "Not Connected"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6">
                    <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No integrations configured</p>
                  </div>
                )}
                <Link href={`/${orgSlug}/integrations`}>
                  <button className="w-full mt-2 inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#90FCA6]/5 text-[#1a7a3a] text-[15px] font-semibold rounded-xl hover:bg-[#90FCA6]/10 transition-colors border border-[#90FCA6]/20">
                    Manage Integrations
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-4">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map((action) => {
            const colorClasses = {
              teal: "from-[#90FCA6]/10 to-[#90FCA6]/5 border-[#90FCA6]/20 hover:shadow-[0_8px_24px_rgba(144,252,166,0.15)]",
              coral: "from-[#FF6C5E]/10 to-[#FF6C5E]/5 border-[#FF6C5E]/20 hover:shadow-[0_8px_24px_rgba(255,108,94,0.15)]",
              purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:shadow-[0_8px_24px_rgba(168,85,247,0.15)]",
            }

            const iconColorClasses = {
              teal: "bg-[#90FCA6] text-[#1a7a3a]",
              coral: "bg-[#FF6C5E] text-white",
              purple: "bg-purple-500 text-white",
            }

            return (
              <Link key={action.title} href={action.href}>
                <Card
                  className={`group cursor-pointer transition-all duration-300 bg-gradient-to-br border ${colorClasses[action.color]} hover:-translate-y-1`}
                >
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconColorClasses[action.color]} shadow-lg transition-transform duration-200 group-hover:scale-110`}
                      >
                        {action.icon}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-[16px] font-bold text-slate-900">{action.title}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-4">Recent Pipeline Runs</h2>
        <Card>
          <CardContent className="p-0">
            {recentPipelines.length > 0 ? (
              <div className="divide-y divide-border">
                {recentPipelines.map((pipeline) => (
                  <div
                    key={pipeline.pipeline_logging_id}
                    className="flex items-start gap-4 p-4 hover:bg-[#90FCA6]/5 transition-colors"
                  >
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${getStatusColor(pipeline.status)}`}
                    >
                      {getPipelineIcon(pipeline.pipeline_id)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-[15px] font-semibold text-slate-900">{pipeline.pipeline_id}</p>
                          <p className="text-sm text-muted-foreground">
                            {pipeline.duration_ms
                              ? `Duration: ${(pipeline.duration_ms / 1000).toFixed(1)}s`
                              : pipeline.error_message
                              ? pipeline.error_message.slice(0, 50)
                              : "Running..."}
                          </p>
                        </div>
                        <Badge
                          variant={
                            pipeline.status === "COMPLETED" ? "success"
                            : pipeline.status === "FAILED" ? "destructive"
                            : "outline"
                          }
                          className="text-[10px] flex-shrink-0"
                        >
                          {pipeline.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {pipeline.status === "FAILED" && <AlertCircle className="h-3 w-3 mr-1" />}
                          {pipeline.status === "RUNNING" && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
                          {pipeline.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(pipeline.start_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Database className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-900">No pipeline runs yet</p>
                <p className="text-xs text-slate-500 mt-1">Run a pipeline to see activity here</p>
              </div>
            )}
            <div className="border-t border-border p-4 bg-[#90FCA6]/5">
              <Link href={`/${orgSlug}/pipelines`}>
                <button className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                  View All Pipelines
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom CTA Section */}
      <Card className="relative overflow-hidden border-2 border-[#90FCA6]/20 bg-gradient-to-br from-[#90FCA6]/5 via-white to-[#FF6C5E]/5">
        <CardContent className="p-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Users className="h-5 w-5 text-[#1a7a3a]" />
                <h3 className="text-[17px] font-bold text-slate-900">Invite Your Team</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Collaborate on cost optimization with your team members
              </p>
            </div>
            <Link href={`/${orgSlug}/settings/members`}>
              <button className="inline-flex items-center gap-2 h-11 px-6 bg-[#90FCA6] text-slate-900 text-[13px] font-semibold rounded-xl hover:bg-[#B8FDCA] shadow-sm hover:shadow-md transition-all">
                <Users className="h-5 w-5" />
                Manage Team
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
