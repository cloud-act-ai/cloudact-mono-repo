"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  History,
  Wallet,
  TrendingUp,
  CalendarClock,
} from "lucide-react"
import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { runPipeline, getAvailablePipelines, getPipelineRuns, getPipelineRunDetail } from "@/actions/pipelines"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import { PipelineRunSummary, PipelineRunDetail as PipelineRunDetailType } from "@/lib/api/backend"

interface PipelineConfig {
  id: string
  name: string
  description: string
  provider: string
  domain: string
  pipeline: string
  required_integration: string
  schedule?: string
  enabled: boolean
}

export default function SubscriptionRunsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [runningPipeline, setRunningPipeline] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ pipelineId: string; success: boolean; message?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, PipelineRunDetailType>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  const MAX_RUNS = 100

  // Filter for subscription/saas pipelines (check domain, provider, pipeline id, and pipeline name)
  const isSubscriptionPipeline = (pipeline: PipelineConfig) => {
    const d = pipeline.domain.toLowerCase()
    const p = pipeline.provider.toLowerCase()
    const id = pipeline.id.toLowerCase()
    const pipelineName = pipeline.pipeline.toLowerCase()
    // Match by domain: saas, subscription, or contains 'subscription'
    // OR match by provider: saas_subscription
    // OR match by id: contains 'saas' or 'subscription'
    // OR match by pipeline name: contains 'saas' (e.g., saas_cost)
    return d === 'saas' || d === 'subscription' || d.includes('subscription') ||
           p === 'saas_subscription' || p.includes('subscription') ||
           id.includes('saas') || id.includes('subscription') ||
           pipelineName.includes('saas')
  }

  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        // Filter runs by saas/subscription in pipeline_id
        const filteredRuns = result.data.runs.filter((run: PipelineRunSummary) => {
          const pipelineId = run.pipeline_id.toLowerCase()
          return pipelineId.includes('saas') || pipelineId.includes('subscription') || pipelineId.includes('saas_cost')
        })
        setPipelineRuns(filteredRuns)
      }
    } catch (err: unknown) {
    }
    setRunsLoading(false)
  }, [orgSlug])

  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [onboardingStatus, apiKeyResult, pipelinesResult] = await Promise.all([
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
      hasStoredApiKey(orgSlug),
      getAvailablePipelines(),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    if (pipelinesResult.success && pipelinesResult.pipelines) {
      const filtered = pipelinesResult.pipelines.filter((p: PipelineConfig) =>
        p.enabled && isSubscriptionPipeline(p)
      )
      setPipelines(filtered)
    }

    setIsLoading(false)

    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      loadPipelineRuns()
    }
  }, [orgSlug, loadPipelineRuns])

  const toggleRunExpansion = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null)
      return
    }

    setExpandedRun(runId)

    if (!runDetails[runId]) {
      setLoadingDetail(runId)
      try {
        const result = await getPipelineRunDetail(orgSlug, runId)
        if (result.success && result.data) {
          setRunDetails(prev => ({ ...prev, [runId]: result.data! }))
        }
      } catch (err: unknown) {
      }
      setLoadingDetail(null)
    }
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (lastResult) {
      const timeout = lastResult.success ? 5000 : 15000
      const timer = setTimeout(() => setLastResult(null), timeout)
      return () => clearTimeout(timer)
    }
  }, [lastResult])

  const handleRun = async (pipelineId: string) => {
    setRunningPipeline(pipelineId)
    setLastResult(null)

    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const date = yesterday.toISOString().split("T")[0]

      const result = await runPipeline(orgSlug, pipelineId, { date })
      setLastResult({
        pipelineId,
        success: result.success,
        message: result.success ? "Pipeline triggered successfully!" : result.error,
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to run pipeline"
      setLastResult({
        pipelineId,
        success: false,
        message: errorMessage,
      })
    }

    setRunningPipeline(null)
    setTimeout(() => loadPipelineRuns(), 2000)
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "-"
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor(diff / (1000 * 60))

      if (minutes < 1) return "Just now"
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`

      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return dateString
    }
  }

  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return "-"
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const getDurationWidth = (ms?: number) => {
    if (!ms) return "0%"
    const maxMs = 300000 // 5 minutes max for visualization
    const percentage = Math.min((ms / maxMs) * 100, 100)
    return `${percentage}%`
  }

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20"
      case "FAILED":
      case "TIMEOUT":
        return "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/20"
      case "RUNNING":
      case "PENDING":
      case "CANCELLING":
        return "bg-[var(--cloudact-mint)]/10 text-[#1a7a3a] border border-[var(--cloudact-mint)]/20"
      case "CANCELLED":
        return "bg-amber-100 text-amber-700 border border-amber-200"
      case "SKIPPED":
        return "bg-slate-100 text-slate-600 border border-slate-200"
      default:
        return "bg-slate-100 text-slate-600 border border-slate-200"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return <CheckCircle2 className="h-4 w-4" />
      case "FAILED":
      case "TIMEOUT":
        return <XCircle className="h-4 w-4" />
      case "RUNNING":
      case "PENDING":
        return <Loader2 className="h-4 w-4 animate-spin" />
      default:
        return null
    }
  }

  // Calculate run statistics
  const runStats = {
    total: pipelineRuns.length,
    completed: pipelineRuns.filter(r => r.status === "COMPLETED").length,
    failed: pipelineRuns.filter(r => r.status === "FAILED" || r.status === "TIMEOUT").length,
    running: pipelineRuns.filter(r => r.status === "RUNNING" || r.status === "PENDING").length,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading subscription pipelines...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Subscription Pipeline Runs
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Monitor your SaaS subscription sync pipeline executions
        </p>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-slate-900">
                {!backendConnected ? "Backend not connected" : "API key missing"}
              </h3>
              <p className="text-[13px] text-slate-600 mt-1">
                Complete organization onboarding to run pipelines.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="mt-3 h-9 px-4 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800 transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 p-4 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
          <p className="text-[13px] text-slate-700 font-medium">
            Subscription pipelines calculate daily costs from your SaaS subscription plans.
          </p>
        </div>
      </div>

      {lastResult && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${lastResult.success ? 'bg-[var(--cloudact-mint)]/10 border-[var(--cloudact-mint)]/20' : 'bg-rose-50 border-rose-200'}`}>
          {lastResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          )}
          <p className={`text-[13px] font-medium ${lastResult.success ? 'text-[#1a7a3a]' : 'text-rose-700'}`}>
            {lastResult.message}
          </p>
        </div>
      )}

      <div className="mb-10">
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Available Pipelines</h2>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5EA]">
            <div className="flex items-center gap-2">
              <Wallet className="h-[18px] w-[18px] text-[#1a7a3a]" />
              <span className="text-[15px] font-semibold text-[#1a7a3a]">SaaS subscription cost pipelines</span>
            </div>
          </div>

          {/* Empty state */}
          {pipelines.length === 0 && (
            <div className="px-4 sm:px-6 py-12 text-center">
              <div className="space-y-4">
                <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                  <Wallet className="h-12 w-12 text-[var(--cloudact-mint-dark)]" />
                </div>
                <h3 className="text-[20px] font-semibold text-slate-900">No subscription pipelines</h3>
                <p className="text-[15px] text-slate-500 max-w-md mx-auto">
                  Enable subscription providers in Integrations to run cost pipelines.
                </p>
                <Link href={`/${orgSlug}/integrations/subscriptions`}>
                  <button className="inline-flex items-center gap-2 h-11 px-6 bg-[var(--cloudact-mint)] text-slate-900 text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] transition-colors shadow-sm">
                    <Wallet className="h-4 w-4" />
                    Manage Subscriptions
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* Mobile card view */}
          {pipelines.length > 0 && (
            <div className="md:hidden divide-y divide-[#E5E5EA]">
              {pipelines.map((pipeline) => {
                const isRunning = runningPipeline === pipeline.id

                return (
                  <div key={pipeline.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-slate-900">{pipeline.name}</div>
                        <div className="text-[13px] text-slate-500 mt-0.5">{pipeline.description}</div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20 flex-shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border">
                        {pipeline.provider}
                      </span>
                      <button
                        onClick={() => handleRun(pipeline.id)}
                        disabled={isRunning}
                        className="inline-flex items-center gap-2 h-11 px-4 bg-[var(--cloudact-mint)] text-slate-900 text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Run Now
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Desktop table view */}
          {pipelines.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#E5E5EA]">
                    <TableHead className="console-table-header">Pipeline</TableHead>
                    <TableHead className="console-table-header">Provider</TableHead>
                    <TableHead className="console-table-header">Status</TableHead>
                    <TableHead className="console-table-header text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelines.map((pipeline) => {
                    const isRunning = runningPipeline === pipeline.id

                    return (
                      <TableRow key={pipeline.id} className="console-table-row">
                        <TableCell className="console-table-cell">
                          <div className="space-y-0.5">
                            <div className="text-[15px] font-semibold text-slate-900">{pipeline.name}</div>
                            <div className="text-[13px] text-slate-500">{pipeline.description}</div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border">
                            {pipeline.provider}
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Ready
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="inline-flex items-center gap-2 h-11 px-4 bg-[var(--cloudact-mint)] text-slate-900 text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md"
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                Run Now
                              </>
                            )}
                          </button>
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

      {backendConnected && hasApiKey && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <History className="h-5 w-5 text-[var(--cloudact-mint-dark)]" />
              </div>
              <div>
                <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.total}</p>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Total Runs</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-[var(--cloudact-mint-dark)]" />
              </div>
              <div>
                <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.completed}</p>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Completed</p>
              </div>
            </div>

            {runStats.failed > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.failed}</p>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Failed</p>
                </div>
              </div>
            )}

            {runStats.running > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                </div>
                <div>
                  <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.running}</p>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Running</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Run History</h2>
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 bg-[var(--cloudact-mint)]/10 text-[#1a7a3a] text-[13px] font-semibold rounded-lg hover:bg-[var(--cloudact-mint)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Loading state */}
            {runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="h-12 w-12 rounded-2xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                </div>
                <p className="text-[14px] text-slate-500 font-medium">Loading run history...</p>
              </div>
            )}

            {/* Empty state */}
            {!runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                    <History className="h-10 w-10 text-[var(--cloudact-mint-dark)]" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-slate-900">No runs yet</h3>
                  <p className="text-[15px] text-slate-500">Run a subscription pipeline to see history</p>
                </div>
              </div>
            )}

            {/* Mobile card view */}
            {pipelineRuns.length > 0 && (
              <div className="md:hidden divide-y divide-[#E5E5EA]">
                {pipelineRuns.map((run) => {
                  const isExpanded = expandedRun === run.pipeline_logging_id
                  const detail = runDetails[run.pipeline_logging_id]
                  const isLoadingThisDetail = loadingDetail === run.pipeline_logging_id

                  return (
                    <div key={run.pipeline_logging_id}>
                      <button
                        className="w-full p-4 text-left touch-manipulation hover:bg-[var(--cloudact-mint)]/5 transition-colors"
                        onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-[#C7C7CC] mt-1 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-[#C7C7CC] mt-1 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-[15px] font-semibold text-slate-900 truncate">{run.pipeline_id}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                {run.pipeline_logging_id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border flex-shrink-0 ${getStatusColor(run.status)}`}>
                            {getStatusIcon(run.status)}
                            {run.status}
                          </span>
                        </div>

                        <div className="ml-6 space-y-2">
                          <div className="flex items-center gap-4 text-[13px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {formatDateTime(run.start_time)}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Duration</span>
                              <span className="font-medium text-slate-900">{formatDuration(run.duration_ms)}</span>
                            </div>
                            <div className="h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${run.status === 'COMPLETED' ? 'bg-[var(--cloudact-mint)]' : run.status === 'FAILED' ? 'bg-[var(--cloudact-coral)]' : 'bg-[var(--cloudact-mint)]/50'}`}
                                style={{ width: getDurationWidth(run.duration_ms) }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 bg-[var(--cloudact-mint)]/5">
                          {isLoadingThisDetail ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              {run.error_message && (
                                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl border-l-4 border-l-rose-500">
                                  <div className="flex items-start gap-3">
                                    <XCircle className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
                                      <p className="text-[13px] text-slate-600 mt-1 break-words font-mono">{run.error_message}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
                                  <h4 className="text-[15px] font-semibold text-slate-900">Pipeline Steps</h4>
                                </div>
                                {detail.steps.length === 0 ? (
                                  <p className="text-center text-slate-500 text-[13px] py-4">No step logs available</p>
                                ) : (
                                  <div className="space-y-2">
                                    {detail.steps.map((step) => (
                                      <div key={step.step_logging_id} className="bg-white rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-dark)] text-[11px] font-bold flex-shrink-0">
                                              {step.step_index}
                                            </span>
                                            <span className="text-[13px] font-semibold text-slate-900 truncate">{step.step_name}</span>
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full flex-shrink-0 ${getStatusColor(step.status)}`}>
                                            {step.status}
                                          </span>
                                        </div>
                                        <div className="ml-8 space-y-1">
                                          <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-500">Duration</span>
                                            <span className="font-medium text-slate-900">{formatDuration(step.duration_ms)}</span>
                                          </div>
                                          <div className="h-1 bg-[#E5E5EA] rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full ${step.status === 'COMPLETED' ? 'bg-[var(--cloudact-mint)]' : step.status === 'FAILED' ? 'bg-[var(--cloudact-coral)]' : 'bg-[var(--cloudact-mint)]/50'}`}
                                              style={{ width: getDurationWidth(step.duration_ms) }}
                                            ></div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-slate-500 text-[13px] py-6">
                              Failed to load details
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Desktop table view */}
            {pipelineRuns.length > 0 && (
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[#E5E5EA]">
                      <TableHead className="console-table-header w-10"></TableHead>
                      <TableHead className="console-table-header">Pipeline</TableHead>
                      <TableHead className="console-table-header">Status</TableHead>
                      <TableHead className="console-table-header">Started</TableHead>
                      <TableHead className="console-table-header">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pipelineRuns.map((run) => {
                      const isExpanded = expandedRun === run.pipeline_logging_id
                      const detail = runDetails[run.pipeline_logging_id]
                      const isLoadingThisDetail = loadingDetail === run.pipeline_logging_id

                      return (
                        <React.Fragment key={run.pipeline_logging_id}>
                          <TableRow
                            className="console-table-row cursor-pointer touch-manipulation hover:bg-[var(--cloudact-mint)]/5 transition-colors"
                            onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                          >
                            <TableCell className="console-table-cell">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[#C7C7CC]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[#C7C7CC]" />
                              )}
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="text-[15px] font-semibold text-slate-900">{run.pipeline_id}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                {run.pipeline_logging_id.slice(0, 8)}...
                              </div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border ${getStatusColor(run.status)}`}>
                                {getStatusIcon(run.status)}
                                {run.status}
                              </span>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="text-[13px] text-slate-700">{formatDateTime(run.start_time)}</div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="space-y-1.5">
                                <div className="text-[13px] font-medium text-slate-900">{formatDuration(run.duration_ms)}</div>
                                <div className="h-1.5 w-24 bg-[#E5E5EA] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${run.status === 'COMPLETED' ? 'bg-[var(--cloudact-mint)]' : run.status === 'FAILED' ? 'bg-[var(--cloudact-coral)]' : 'bg-[var(--cloudact-mint)]/50'}`}
                                    style={{ width: getDurationWidth(run.duration_ms) }}
                                  ></div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-[var(--cloudact-mint)]/5">
                              <TableCell colSpan={5} className="px-4 sm:px-6 py-6">
                                {isLoadingThisDetail ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-4">
                                    {run.error_message && (
                                      <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl border-l-4 border-l-rose-500">
                                        <div className="flex items-start gap-3">
                                          <XCircle className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
                                          <div className="flex-1">
                                            <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
                                            <p className="text-[13px] text-slate-600 mt-1 font-mono">{run.error_message}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
                                        <h4 className="text-[15px] font-semibold text-slate-900">Pipeline Steps</h4>
                                      </div>
                                      <div className="grid gap-3">
                                        {detail.steps.length === 0 ? (
                                          <p className="text-center text-slate-500 text-[13px] py-6">No step logs available</p>
                                        ) : (
                                          detail.steps.map((step) => (
                                            <div key={step.step_logging_id} className="bg-white rounded-xl border border-slate-200 p-4">
                                              <div className="flex items-center justify-between gap-4 mb-3">
                                                <div className="flex items-center gap-3">
                                                  <span className="flex items-center justify-center h-8 w-8 rounded-full bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-dark)] text-[13px] font-bold">
                                                    {step.step_index}
                                                  </span>
                                                  <span className="text-[15px] font-semibold text-slate-900">{step.step_name}</span>
                                                </div>
                                                <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full ${getStatusColor(step.status)}`}>
                                                  {step.status}
                                                </span>
                                              </div>
                                              <div className="ml-11 space-y-1.5">
                                                <div className="flex items-center justify-between text-[13px]">
                                                  <span className="text-slate-500">Duration</span>
                                                  <span className="font-medium text-slate-900">{formatDuration(step.duration_ms)}</span>
                                                </div>
                                                <div className="h-2 bg-[#E5E5EA] rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full ${step.status === 'COMPLETED' ? 'bg-[var(--cloudact-mint)]' : step.status === 'FAILED' ? 'bg-[var(--cloudact-coral)]' : 'bg-[var(--cloudact-mint)]/50'}`}
                                                    style={{ width: getDurationWidth(step.duration_ms) }}
                                                  ></div>
                                                </div>
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center text-slate-500 text-[13px] py-6">
                                    Failed to load details
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
