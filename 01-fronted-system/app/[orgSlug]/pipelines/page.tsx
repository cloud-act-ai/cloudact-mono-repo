"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import {
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  Info,
  Cloud,
  Clock,
  RefreshCw,
  History,
  Plug,
  TrendingUp,
  Activity,
  Zap,
} from "lucide-react"
import Link from "next/link"

// Premium components
import { PremiumDataTable, ColumnDef } from "@/components/premium/data-table"
import { PipelineRunCard, AvailablePipelineCard, StepTimeline } from "@/components/premium/table-card"
import { PremiumCard } from "@/components/ui/premium-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatRow } from "@/components/ui/stat-row"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"

// Actions
import {
  runPipeline,
  runAllOrgPipelines,
  getAvailablePipelines,
  getPipelineRuns,
  getPipelineRunDetail,
  getBatchRuns,
} from "@/actions/pipelines"
import type { BatchRunSummary } from "@/actions/pipelines"
import { getIntegrations } from "@/actions/integrations"
import {
  checkBackendOnboarding,
  hasStoredApiKey,
} from "@/actions/backend-onboarding"
import {
  PipelineConfig,
  PipelineRunSummary,
  PipelineRunDetail as PipelineRunDetailType,
} from "@/lib/api/backend"
import { formatRelativeDateTime, formatLocalDate } from "@/lib/i18n/formatters"

interface QuickStats {
  runsToday: number
  successRate: number
  avgDuration: number
  totalRuns: number
}

// ============================================================================
// Animated Flow Visualization
// ============================================================================

function AnimatedPipelineFlow() {
  return (
    <div className="relative w-full h-32 bg-gradient-to-br from-[var(--cloudact-mint)]/5 via-[var(--cloudact-mint-light)] to-[var(--cloudact-coral)]/5 rounded-2xl overflow-hidden border border-[var(--cloudact-mint)]/10">
      <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-8">
        {/* Source */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 z-10">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[var(--cloudact-mint)] flex items-center justify-center shadow-lg">
            <Cloud className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--cloudact-mint-text)]">
            Source
          </span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-2 sm:mx-4">
          <div className="absolute inset-0 bg-[var(--cloudact-mint)]/20 rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--cloudact-mint)] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite]" />
        </div>

        {/* Processing */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 z-10">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center shadow-lg animate-pulse">
            <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--cloudact-mint-text)]">
            Process
          </span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-2 sm:mx-4">
          <div className="absolute inset-0 bg-[var(--cloudact-coral)]/20 rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--cloudact-coral)] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite_0.5s]" />
        </div>

        {/* Destination */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 z-10">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[var(--cloudact-coral)] flex items-center justify-center shadow-lg">
            <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--cloudact-coral)]">
            Analytics
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes flow {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(200%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ============================================================================
// Main Component
// ============================================================================

export default function PipelinesPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // State
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [integrations, setIntegrations] = useState<Record<string, { status: string }>>({})
  const [runningPipeline, setRunningPipeline] = useState<string | null>(null)
  const isRunningRef = useRef(false)
  const [lastResult, setLastResult] = useState<{
    pipelineId: string
    success: boolean
    message?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  // Run All state
  const [runAllLoading, setRunAllLoading] = useState(false)
  const [runAllResult, setRunAllResult] = useState<{
    success: boolean
    message?: string
    pipelines_triggered?: number
    pipelines_failed?: number
    pipelines_skipped_quota?: number
  } | null>(null)

  // Batch run history
  const [batchRuns, setBatchRuns] = useState<BatchRunSummary[]>([])
  const [batchRunsLoading, setBatchRunsLoading] = useState(false)

  // Run history
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runDetails, setRunDetails] = useState<Record<string, PipelineRunDetailType>>({})
  const [quickStats, setQuickStats] = useState<QuickStats>({
    runsToday: 0,
    successRate: 0,
    avgDuration: 0,
    totalRuns: 0,
  })

  const MAX_RUNS = 100

  // Calculate quick stats
  const calculateQuickStats = useCallback((runs: PipelineRunSummary[]) => {
    if (runs.length === 0) {
      setQuickStats({ runsToday: 0, successRate: 0, avgDuration: 0, totalRuns: 0 })
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const runsToday = runs.filter((run) => {
      if (!run.start_time) return false
      const runDate = new Date(run.start_time)
      runDate.setHours(0, 0, 0, 0)
      return runDate.getTime() === today.getTime()
    }).length

    const completedRuns = runs.filter(
      (r) => r.status === "COMPLETED" || r.status === "FAILED"
    )
    const successfulRuns = runs.filter((r) => r.status === "COMPLETED")
    const successRate =
      completedRuns.length > 0
        ? Math.round((successfulRuns.length / completedRuns.length) * 100)
        : 0

    const runsWithDuration = runs.filter(
      (r) => r.duration_ms !== null && r.duration_ms !== undefined
    )
    const avgDuration =
      runsWithDuration.length > 0
        ? Math.round(
            runsWithDuration.reduce((sum, r) => sum + (r.duration_ms || 0), 0) /
              runsWithDuration.length
          )
        : 0

    setQuickStats({ runsToday, successRate, avgDuration, totalRuns: runs.length })
  }, [])

  // Load pipeline runs
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        // Deduplicate by pipeline_logging_id to prevent React key warnings
        const seen = new Set<string>()
        const uniqueRuns = result.data.runs.filter((run: PipelineRunSummary) => {
          if (!run.pipeline_logging_id) return true // Keep runs without IDs
          if (seen.has(run.pipeline_logging_id)) return false
          seen.add(run.pipeline_logging_id)
          return true
        })
        setPipelineRuns(uniqueRuns)
        calculateQuickStats(uniqueRuns)
      }
    } catch {
      // Handle silently
    }
    setRunsLoading(false)
  }, [orgSlug, calculateQuickStats])

  // Load batch run history
  const loadBatchRuns = useCallback(async () => {
    setBatchRunsLoading(true)
    try {
      const result = await getBatchRuns(orgSlug, { limit: 10 })
      if (result.success && result.runs) {
        setBatchRuns(result.runs)
      }
    } catch {
      // Handle silently
    }
    setBatchRunsLoading(false)
  }, [orgSlug])

  // Run All handler
  const handleRunAll = async (category?: string) => {
    if (runAllLoading) return
    setRunAllLoading(true)
    setRunAllResult(null)

    try {
      const options: { categories?: string[] } = {}
      if (category) options.categories = [category]

      const result = await runAllOrgPipelines(orgSlug, options)
      setRunAllResult({
        success: result.success,
        message: result.success
          ? `${result.pipelines_triggered} pipeline${result.pipelines_triggered !== 1 ? "s" : ""} triggered in ${result.elapsed_seconds}s`
          : result.error,
        pipelines_triggered: result.pipelines_triggered,
        pipelines_failed: result.pipelines_failed,
        pipelines_skipped_quota: result.pipelines_skipped_quota,
      })
      // Refresh runs after trigger
      setTimeout(() => {
        loadPipelineRuns()
        loadBatchRuns()
      }, 2000)
    } catch (err) {
      setRunAllResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to run all pipelines",
      })
    }
    setRunAllLoading(false)
  }

  // Load initial data
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
      setPipelines(pipelinesResult.pipelines.filter((p: PipelineConfig) => p.enabled))
    }

    const result = await getIntegrations(orgSlug)
    if (result.success && result.integrations) {
      setIntegrations(result.integrations.integrations)
    }
    setIsLoading(false)

    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      loadPipelineRuns()
      loadBatchRuns()
    }
  }, [orgSlug, loadPipelineRuns, loadBatchRuns])

  // Load run details
  const loadRunDetail = async (
    runId: string
  ): Promise<PipelineRunDetailType | undefined> => {
    if (runDetails[runId]) return runDetails[runId]
    try {
      const result = await getPipelineRunDetail(orgSlug, runId)
      if (result.success && result.data) {
        setRunDetails((prev) => ({ ...prev, [runId]: result.data! }))
        return result.data
      }
    } catch {
      // Handle silently
    }
    return undefined
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

  useEffect(() => {
    if (runAllResult) {
      const timeout = runAllResult.success ? 10000 : 20000
      const timer = setTimeout(() => setRunAllResult(null), timeout)
      return () => clearTimeout(timer)
    }
  }, [runAllResult])

  // Run pipeline
  const handleRun = async (pipelineId: string) => {
    // Prevent double-clicks while pipeline is running (ref for synchronous check)
    if (isRunningRef.current || runningPipeline) return
    isRunningRef.current = true
    setRunningPipeline(pipelineId)
    setLastResult(null)

    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = formatLocalDate(yesterday)

      const result = await runPipeline(orgSlug, pipelineId, {
        date: dateStr,
        start_date: dateStr,
      })
      setLastResult({
        pipelineId,
        success: result.success,
        message: result.success
          ? "Pipeline triggered successfully!"
          : result.error,
      })
    } catch (err: unknown) {
      setLastResult({
        pipelineId,
        success: false,
        message: err instanceof Error ? err.message : "Failed to run pipeline",
      })
    }

    isRunningRef.current = false
    setRunningPipeline(null)
    setTimeout(() => loadPipelineRuns(), 2000)
  }

  // Filter pipelines with connected integrations
  const connectedPipelines = pipelines.filter((pipeline) => {
    if (!pipeline.required_integration || pipeline.required_integration === "") {
      return true
    }
    const integration = integrations[pipeline.required_integration]
    return integration?.status === "VALID"
  })

  // Build stats for StatRow
  const stats = [
    { icon: Clock, value: quickStats.runsToday, label: "Today", color: "mint" as const },
    { icon: TrendingUp, value: `${quickStats.successRate}%`, label: "Success", color: "mint" as const },
    { icon: Activity, value: formatDuration(quickStats.avgDuration), label: "Avg Time", color: "coral" as const },
    { icon: History, value: quickStats.totalRuns, label: "Total", color: "mint" as const },
  ]

  // Column definitions for run history
  const runHistoryColumns: ColumnDef<PipelineRunSummary>[] = [
    {
      id: "pipeline_id",
      header: "Pipeline",
      accessorKey: "pipeline_id",
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="text-[14px] font-semibold text-[var(--text-primary)]">
            {row.pipeline_id}
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)] font-mono">
            {row.pipeline_logging_id.slice(0, 8)}...
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      filterable: true,
      filterOptions: [
        { label: "Completed", value: "COMPLETED" },
        { label: "Failed", value: "FAILED" },
        { label: "Running", value: "RUNNING" },
        { label: "Pending", value: "PENDING" },
      ],
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "start_time",
      header: "Started",
      accessorKey: "start_time",
      cell: (row) => (
        <div className="text-[12px] text-[var(--text-secondary)]">
          {formatRelativeDateTime(row.start_time)}
        </div>
      ),
    },
    {
      id: "duration_ms",
      header: "Duration",
      accessorKey: "duration_ms",
      cell: (row) => (
        <div className="flex items-center gap-1 text-[12px] text-[var(--text-primary)] tabular-nums">
          <Clock className="h-3 w-3 text-[var(--text-tertiary)]" />
          {formatDuration(row.duration_ms)}
        </div>
      ),
    },
    {
      id: "trigger_type",
      header: "Trigger",
      accessorKey: "trigger_type",
      filterable: true,
      filterOptions: [
        { label: "Manual", value: "MANUAL" },
        { label: "Scheduled", value: "SCHEDULED" },
        { label: "API", value: "API" },
      ],
      cell: (row) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border-medium)]">
          {row.trigger_type}
        </span>
      ),
    },
  ]

  // Loading state
  if (isLoading) {
    return (
      <div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6">
          <LoadingState message="Loading pipelines..." size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Premium Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)]/30 to-[var(--cloudact-mint)]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[var(--cloudact-mint)]/20">
          <Play className="h-5 w-5 sm:h-7 sm:w-7 text-[var(--cloudact-mint-text)]" />
        </div>
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            Pipelines
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
            Run data pipelines to fetch your cloud data
          </p>
        </div>
      </div>

      {/* Animated Hero */}
      <AnimatedPipelineFlow />

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                {!backendConnected
                  ? "Your organization is not connected to the pipeline backend."
                  : "Your organization API key is missing."}
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="mt-3 h-10 px-5 bg-[var(--text-primary)] text-white text-[12px] font-semibold rounded-xl hover:bg-[var(--text-secondary)] transition-colors inline-flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  Go to Organization Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
          <p className="text-[12px] text-[var(--text-secondary)] font-medium">
            Pipelines run daily at 06:00 UTC. Use &quot;Run All&quot; or individual &quot;Run Now&quot; for manual runs.
          </p>
        </div>
      </div>

      {/* Run All Section */}
      {backendConnected && hasApiKey && connectedPipelines.length > 0 && (
        <PremiumCard>
          <div className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Run All Pipelines
                </h3>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                  Trigger all configured pipelines for yesterday&apos;s data
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunAll("cloud")}
                  disabled={runAllLoading}
                  className="h-9 px-4 bg-[var(--surface-secondary)] text-[var(--text-primary)] text-[12px] font-semibold rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Cloud
                </button>
                <button
                  onClick={() => handleRunAll("genai")}
                  disabled={runAllLoading}
                  className="h-9 px-4 bg-[var(--surface-secondary)] text-[var(--text-primary)] text-[12px] font-semibold rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                >
                  <Zap className="h-3.5 w-3.5" />
                  GenAI
                </button>
                <button
                  onClick={() => handleRunAll()}
                  disabled={runAllLoading}
                  className="h-9 px-5 bg-[var(--text-primary)] text-white text-[12px] font-semibold rounded-lg hover:bg-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                >
                  {runAllLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Run All
                </button>
              </div>
            </div>
          </div>
        </PremiumCard>
      )}

      {/* Run All Result */}
      {runAllResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            runAllResult.success
              ? "bg-[var(--cloudact-mint)]/10 border-[var(--cloudact-mint)]/20"
              : "bg-rose-50 border-rose-200"
          }`}
        >
          {runAllResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--cloudact-mint-text)] flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={`text-[12px] font-medium ${
                runAllResult.success ? "text-[var(--cloudact-mint-text)]" : "text-rose-700"
              }`}
            >
              {runAllResult.message}
            </p>
            {runAllResult.success && (runAllResult.pipelines_failed || runAllResult.pipelines_skipped_quota) ? (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                {runAllResult.pipelines_failed ? `${runAllResult.pipelines_failed} failed` : ""}
                {runAllResult.pipelines_failed && runAllResult.pipelines_skipped_quota ? " · " : ""}
                {runAllResult.pipelines_skipped_quota ? `${runAllResult.pipelines_skipped_quota} quota-skipped` : ""}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Result Message */}
      {lastResult && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            lastResult.success
              ? "bg-[var(--cloudact-mint)]/10 border-[var(--cloudact-mint)]/20"
              : "bg-rose-50 border-rose-200"
          }`}
        >
          {lastResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--cloudact-mint-text)] flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          )}
          <p
            className={`text-[12px] font-medium ${
              lastResult.success ? "text-[var(--cloudact-mint-text)]" : "text-rose-700"
            }`}
          >
            {lastResult.message}
          </p>
        </div>
      )}

      {/* Available Pipelines */}
      <div>
        <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-4">Available Pipelines</h2>
        <PremiumCard>
          {connectedPipelines.length === 0 ? (
            <EmptyState
              icon={Plug}
              title="No pipelines available"
              description="Connect a provider to see available pipelines."
              action={{
                label: "Add New Provider",
                href: `/${orgSlug}/integrations/cloud-providers`,
                icon: Plug,
              }}
              size="lg"
            />
          ) : (
            <div className="divide-y divide-[var(--border-medium)]">
              {connectedPipelines.map((pipeline) => (
                <AvailablePipelineCard
                  key={pipeline.id}
                  id={pipeline.id}
                  name={pipeline.name}
                  description={pipeline.description}
                  provider={`${pipeline.provider} / ${pipeline.domain}`}
                  status="ready"
                  running={runningPipeline === pipeline.id}
                  onRun={() => handleRun(pipeline.id)}
                  runIcon={Play}
                />
              ))}
            </div>
          )}
        </PremiumCard>
      </div>

      {/* Run History */}
      {backendConnected && hasApiKey && (
        <div>
          {/* Stats Row */}
          {pipelineRuns.length > 0 && (
            <div className="mb-4">
              <StatRow stats={stats} />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Run History</h2>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-text)] text-[12px] font-semibold rounded-lg hover:bg-[var(--cloudact-mint)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <PremiumDataTable
            data={pipelineRuns}
            columns={runHistoryColumns}
            keyField="pipeline_logging_id"
            searchable
            searchPlaceholder="Search pipelines..."
            searchFields={["pipeline_id"]}
            filterable
            sortable
            defaultSort={{ column: "start_time", direction: "desc" }}
            paginated
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            loading={runsLoading && pipelineRuns.length === 0}
            loadingMessage="Loading pipeline runs..."
            emptyState={{
              icon: History,
              title: "No pipeline runs yet",
              description: "Run a pipeline to see history",
            }}
            expandable={{
              loadDetails: async (row) => {
                return await loadRunDetail(row.pipeline_logging_id)
              },
              renderExpanded: (row, details) => {
                const detail = details as PipelineRunDetailType | undefined
                if (!detail) {
                  return (
                    <div className="text-center text-[var(--text-tertiary)] text-[12px] py-6">
                      Failed to load details
                    </div>
                  )
                }
                return (
                  <StepTimeline
                    steps={detail.steps.map((step) => ({
                      id: step.step_logging_id,
                      index: step.step_index,
                      name: step.step_name,
                      status: step.status,
                      duration: step.duration_ms,
                    }))}
                    error={row.error_message}
                  />
                )
              },
            }}
            mobileCard={{
              render: (row, expanded, onToggle) => (
                <PipelineRunCard
                  id={row.pipeline_logging_id}
                  pipelineId={row.pipeline_id}
                  status={row.status}
                  startTime={row.start_time}
                  duration={row.duration_ms}
                  error={row.error_message}
                  expanded={expanded}
                  onToggle={onToggle}
                  expandedContent={
                    runDetails[row.pipeline_logging_id] ? (
                      <StepTimeline
                        steps={runDetails[row.pipeline_logging_id].steps.map(
                          (step) => ({
                            id: step.step_logging_id,
                            index: step.step_index,
                            name: step.step_name,
                            status: step.status,
                            duration: step.duration_ms,
                          })
                        )}
                        error={row.error_message}
                      />
                    ) : (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                      </div>
                    )
                  }
                />
              ),
            }}
          />
        </div>
      )}

      {/* Batch Run History */}
      {backendConnected && hasApiKey && batchRuns.length > 0 && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Batch Run History</h2>
            <button
              onClick={loadBatchRuns}
              disabled={batchRunsLoading}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 bg-[var(--cloudact-mint)]/10 text-[var(--cloudact-mint-text)] text-[12px] font-semibold rounded-lg hover:bg-[var(--cloudact-mint)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {batchRunsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <PremiumCard>
            <div className="divide-y divide-[var(--border-medium)]">
              {batchRuns.map((batch) => (
                <div key={batch.batch_run_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={batch.status} />
                      <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
                        {batch.batch_run_id.slice(0, 8)}
                      </span>
                      {batch.dry_run && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          DRY RUN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-[var(--text-secondary)]">
                      <span>{batch.pipelines_triggered} triggered</span>
                      {batch.pipelines_failed > 0 && (
                        <span className="text-rose-600">{batch.pipelines_failed} failed</span>
                      )}
                      {batch.pipelines_skipped_quota > 0 && (
                        <span className="text-amber-600">{batch.pipelines_skipped_quota} quota-skipped</span>
                      )}
                      <span className="text-[var(--text-tertiary)]">{batch.elapsed_seconds}s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[var(--surface-secondary)] border border-[var(--border-medium)] font-semibold">
                      {batch.trigger_type}
                    </span>
                    <span>{batch.triggered_at ? formatRelativeDateTime(batch.triggered_at) : "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          </PremiumCard>
        </div>
      )}

      {/* Coming Soon */}
      <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-medium)] shadow-sm p-6 sm:p-8 text-center">
        <p className="text-[12px] text-[var(--text-tertiary)] font-medium">
          More pipelines coming soon: AWS Cost Explorer, Azure, LLM Usage Analytics
        </p>
      </div>
    </div>
    </div>
  )
}
