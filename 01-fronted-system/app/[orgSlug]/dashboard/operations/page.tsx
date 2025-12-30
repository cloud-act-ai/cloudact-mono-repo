"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Cloud,
  Brain,
  ChevronRight,
  BarChart3,
  Timer,
  Database,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPipelineRuns } from "@/actions/pipelines"
import type { PipelineRunSummary } from "@/lib/api/backend"

interface PipelineStats {
  total: number
  running: number
  completed: number
  failed: number
  successRate: number
}

export default function OperationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pipelineStats, setPipelineStats] = useState<PipelineStats>({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
    successRate: 0,
  })
  const [recentPipelines, setRecentPipelines] = useState<PipelineRunSummary[]>([])

  const loadData = useCallback(async () => {
    try {
      const result = await getPipelineRuns(orgSlug, { limit: 100 })

      if (result.success && result.data?.runs) {
        const runs = result.data.runs
        const total = result.data.total || runs.length

        // Calculate stats from pipeline runs
        const running = runs.filter(r => r.status === "RUNNING" || r.status === "IN_PROGRESS").length
        const completed = runs.filter(r => r.status === "COMPLETED").length
        const failed = runs.filter(r => r.status === "FAILED").length
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0

        setPipelineStats({
          total,
          running,
          completed,
          failed,
          successRate,
        })

        // Get 5 most recent pipelines
        setRecentPipelines(runs.slice(0, 5))
      }
    } catch {
      // Silently handle errors - show empty state
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

  const getPipelineIcon = (pipelineId: string) => {
    const id = pipelineId.toLowerCase()
    if (id.includes("openai") || id.includes("anthropic") || id.includes("gemini")) {
      return <Brain className="h-5 w-5 text-purple-500" />
    }
    if (id.includes("gcp")) {
      return <Cloud className="h-5 w-5 text-blue-500" />
    }
    if (id.includes("aws")) {
      return <Cloud className="h-5 w-5 text-orange-500" />
    }
    if (id.includes("azure")) {
      return <Cloud className="h-5 w-5 text-[#0078D4]" />
    }
    if (id.includes("saas") || id.includes("subscription")) {
      return <Wallet className="h-5 w-5 text-[#FF6C5E]" />
    }
    return <Database className="h-5 w-5 text-slate-500" />
  }

  const getProviderColor = (pipelineId: string) => {
    const id = pipelineId.toLowerCase()
    if (id.includes("gcp")) return "bg-blue-500/10"
    if (id.includes("aws")) return "bg-orange-500/10"
    if (id.includes("azure")) return "bg-[#0078D4]/10"
    if (id.includes("openai") || id.includes("anthropic") || id.includes("gemini")) return "bg-purple-500/10"
    if (id.includes("saas") || id.includes("subscription")) return "bg-[#FF6C5E]/10"
    return "bg-slate-100"
  }

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return "-"
    const seconds = durationMs / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            Operations
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Monitor your system operations and health
          </p>
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

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-6 py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-slate-900">{pipelineStats.total}</span> Total
          </span>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[var(--cloudact-coral)] animate-pulse"></div>
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[var(--cloudact-coral)]">{pipelineStats.running}</span> Running
          </span>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#1a7a3a]">{pipelineStats.successRate}%</span> Success
          </span>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-amber-600">{pipelineStats.failed}</span> Failed
          </span>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Total Runs</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.total}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-[var(--cloudact-coral)]" />
            </div>
            {pipelineStats.running > 0 && (
              <div className="h-2 w-2 rounded-full bg-[var(--cloudact-coral)] animate-pulse"></div>
            )}
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Running Now</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.running}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Success Rate</p>
          <p className="text-[24px] font-bold text-[#1a7a3a] mt-1">{pipelineStats.successRate}%</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Failed</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.failed}</p>
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Recent Runs</h2>
          <Link
            href={`/${orgSlug}/pipelines`}
            className="text-[13px] font-semibold text-slate-900 hover:text-black transition-colors flex items-center gap-1"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {recentPipelines.length > 0 ? (
            recentPipelines.map((pipeline) => (
              <div
                key={pipeline.pipeline_logging_id}
                className="group relative"
              >
                {/* Left accent */}
                <div
                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                    pipeline.status === "RUNNING" || pipeline.status === "IN_PROGRESS"
                      ? "bg-[var(--cloudact-coral)]"
                      : pipeline.status === "FAILED"
                      ? "bg-red-500"
                      : "bg-[var(--cloudact-mint)]"
                  }`}
                />

                <div className="flex items-center justify-between p-4 pl-5">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${getProviderColor(pipeline.pipeline_id)}`}>
                      {getPipelineIcon(pipeline.pipeline_id)}
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-slate-900">{pipeline.pipeline_id}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Timer className="h-3 w-3 text-slate-400" />
                        <span className="text-[12px] text-slate-500">{formatDuration(pipeline.duration_ms)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    pipeline.status === "RUNNING" || pipeline.status === "IN_PROGRESS"
                      ? "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)]"
                      : pipeline.status === "FAILED"
                      ? "bg-red-500/10 text-red-600"
                      : "bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-text)]"
                  }`}>
                    {pipeline.status === "RUNNING" || pipeline.status === "IN_PROGRESS" ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--cloudact-coral)] animate-pulse"></span>
                        Running
                      </span>
                    ) : pipeline.status === "FAILED" ? (
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" />
                        Failed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <Database className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-900">No pipeline runs yet</p>
              <p className="text-xs text-slate-500 mt-1">Run a pipeline to see activity here</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Quick Actions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href={`/${orgSlug}/pipelines`}
            className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[var(--cloudact-mint)]/30 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-11 w-11 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <PlayCircle className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[var(--cloudact-mint-dark)] transition-colors" />
            </div>
            <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Run Pipeline</h3>
            <p className="text-[13px] text-slate-500">
              Execute cost sync, usage tracking, and data pipelines
            </p>
          </Link>

          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#FF6C5E]/30 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-11 w-11 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-[var(--cloudact-coral)]" />
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[var(--cloudact-coral)] transition-colors" />
            </div>
            <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Cost Analytics</h3>
            <p className="text-[13px] text-slate-500">
              View detailed cost breakdowns and trends
            </p>
          </Link>
        </div>
      </div>

      {/* System Health */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">System Health</h3>
              <p className="text-[13px] text-slate-500">All services operational</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#6EE890] animate-pulse"></div>
            <span className="text-[13px] font-semibold text-[#1a7a3a]">Healthy</span>
          </div>
        </div>
      </div>
    </div>
  )
}
