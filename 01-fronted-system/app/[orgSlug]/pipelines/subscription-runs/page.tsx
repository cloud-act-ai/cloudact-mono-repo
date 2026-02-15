"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Play,
  AlertCircle,
  Info,
  RefreshCw,
  History,
  Wallet,
  CheckCircle2,
  XCircle,
  Loader2,
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
  getAvailablePipelines,
  getPipelineRuns,
  getPipelineRunDetail,
} from "@/actions/pipelines"
import {
  checkBackendOnboarding,
  hasStoredApiKey,
} from "@/actions/backend-onboarding"
import {
  PipelineRunSummary,
  PipelineRunDetail as PipelineRunDetailType,
} from "@/lib/api/backend"

// ============================================================================
// Types
// ============================================================================

interface PipelineConfig {
  id: string
  name: string
  description: string
  category: string  // Top-level category (cloud, genai, subscription)
  provider: string  // Provider within category (gcp, aws, openai, etc.)
  domain: string
  pipeline: string
  required_integration: string
  schedule?: string
  enabled: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

const isSubscriptionPipeline = (pipeline: PipelineConfig) => {
  const d = pipeline.domain.toLowerCase()
  const p = pipeline.provider.toLowerCase()
  const id = pipeline.id.toLowerCase()
  const pipelineName = pipeline.pipeline.toLowerCase()
  return (
    d === "saas" ||
    d === "subscription" ||
    d.includes("subscription") ||
    p === "subscription" ||
    p.includes("subscription") ||
    id.includes("saas") ||
    id.includes("subscription") ||
    pipelineName.includes("saas")
  )
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

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
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

// ============================================================================
// Main Component
// ============================================================================

export default function SubscriptionRunsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // Pipeline state
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [runningPipeline, setRunningPipeline] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    pipelineId: string
    success: boolean
    message?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  // Run history state
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runDetails, setRunDetails] = useState<
    Record<string, PipelineRunDetailType>
  >({})

  const MAX_RUNS = 100

  // Load pipeline runs
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        const filteredRuns = result.data.runs.filter(
          (run: PipelineRunSummary) => {
            const pipelineId = run.pipeline_id.toLowerCase()
            return (
              pipelineId.includes("saas") ||
              pipelineId.includes("subscription") ||
              pipelineId.includes("subscription_cost")
            )
          }
        )
        // Deduplicate by pipeline_logging_id to prevent React key warnings
        const seen = new Set<string>()
        const uniqueRuns = filteredRuns.filter((run: PipelineRunSummary) => {
          if (seen.has(run.pipeline_logging_id)) return false
          seen.add(run.pipeline_logging_id)
          return true
        })
        setPipelineRuns(uniqueRuns)
      }
    } catch {
      // Handle error silently
    }
    setRunsLoading(false)
  }, [orgSlug])

  // Load initial data
  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [onboardingStatus, apiKeyResult, pipelinesResult] = await Promise.all(
      [
        checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
        hasStoredApiKey(orgSlug),
        getAvailablePipelines(),
      ]
    )

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    if (pipelinesResult.success && pipelinesResult.pipelines) {
      const filtered = pipelinesResult.pipelines.filter(
        (p: PipelineConfig) => p.enabled && isSubscriptionPipeline(p)
      )
      setPipelines(filtered)
    }

    setIsLoading(false)

    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      loadPipelineRuns()
    }
  }, [orgSlug, loadPipelineRuns])

  // Load run details
  const loadRunDetail = async (
    runId: string
  ): Promise<PipelineRunDetailType | undefined> => {
    if (runDetails[runId]) {
      return runDetails[runId]
    }
    try {
      const result = await getPipelineRunDetail(orgSlug, runId)
      if (result.success && result.data) {
        setRunDetails((prev) => ({ ...prev, [runId]: result.data! }))
        return result.data
      }
    } catch {
      // Handle error silently
    }
    return undefined
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-clear result message
  useEffect(() => {
    if (lastResult) {
      const timeout = lastResult.success ? 5000 : 15000
      const timer = setTimeout(() => setLastResult(null), timeout)
      return () => clearTimeout(timer)
    }
  }, [lastResult])

  // Run pipeline handler
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
        message: result.success
          ? "Pipeline triggered successfully!"
          : result.error,
      })
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to run pipeline"
      setLastResult({
        pipelineId,
        success: false,
        message: errorMessage,
      })
    }

    setRunningPipeline(null)
    setTimeout(() => loadPipelineRuns(), 2000)
  }

  // Calculate run statistics
  const runStats = {
    total: pipelineRuns.length,
    completed: pipelineRuns.filter((r) => r.status === "COMPLETED").length,
    failed: pipelineRuns.filter(
      (r) => r.status === "FAILED" || r.status === "TIMEOUT"
    ).length,
    running: pipelineRuns.filter(
      (r) => r.status === "RUNNING" || r.status === "PENDING"
    ).length,
  }

  // Build stats for StatRow
  const stats = [
    { icon: History, value: runStats.total, label: "Total", color: "mint" as const },
    { icon: CheckCircle2, value: runStats.completed, label: "Done", color: "mint" as const },
    ...(runStats.failed > 0
      ? [{ icon: XCircle, value: runStats.failed, label: "Failed", color: "coral" as const }]
      : []),
    ...(runStats.running > 0
      ? [{ icon: Loader2, value: runStats.running, label: "Running", color: "blue" as const }]
      : []),
  ]

  // Column definitions for run history table
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
          {formatDateTime(row.start_time)}
        </div>
      ),
    },
    {
      id: "duration_ms",
      header: "Duration",
      accessorKey: "duration_ms",
      cell: (row) => {
        const getDurationWidth = (ms?: number) => {
          if (!ms) return "0%"
          const maxMs = 300000
          return `${Math.min((ms / maxMs) * 100, 100)}%`
        }
        const getDurationColor = () => {
          if (row.status === "COMPLETED") return "bg-[var(--cloudact-mint)]"
          if (row.status === "FAILED") return "bg-[var(--cloudact-coral)]"
          return "bg-[var(--cloudact-mint)]/50"
        }
        return (
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-[var(--text-primary)]">
              {formatDuration(row.duration_ms)}
            </div>
            <div className="h-1.5 w-24 bg-[var(--border-medium)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getDurationColor()}`}
                style={{ width: getDurationWidth(row.duration_ms) }}
              />
            </div>
          </div>
        )
      },
    },
  ]

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6">
        <LoadingState message="Loading subscription pipelines..." size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)]/30 to-[var(--cloudact-mint)]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[var(--cloudact-mint)]/20">
          <Wallet className="h-5 w-5 sm:h-7 sm:w-7 text-[var(--cloudact-mint-text)]" />
        </div>
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            Subscription Pipelines
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
            Monitor your SaaS subscription sync pipeline executions
          </p>
        </div>
      </div>

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                {!backendConnected ? "Backend not connected" : "API key missing"}
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                Complete organization onboarding to run pipelines.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="mt-3 h-9 px-4 bg-[var(--text-primary)] text-white text-[11px] font-semibold rounded-lg hover:bg-[var(--text-secondary)] transition-colors">
                  Go to Settings
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
            Subscription pipelines calculate daily costs from your SaaS
            subscription plans.
          </p>
        </div>
      </div>

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

      {/* Available Pipelines Section */}
      <div>
        <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-4">Available Pipelines</h2>
        <PremiumCard>
          {pipelines.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No subscription pipelines"
              description="Enable subscription providers in Integrations to run cost pipelines."
              action={{
                label: "Manage Subscriptions",
                href: `/${orgSlug}/integrations/subscriptions`,
                icon: Wallet,
              }}
              size="lg"
            />
          ) : (
            <div className="divide-y divide-[var(--border-medium)]">
              {pipelines.map((pipeline) => (
                <AvailablePipelineCard
                  key={pipeline.id}
                  id={pipeline.id}
                  name={pipeline.name}
                  description={pipeline.description}
                  provider={pipeline.provider}
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

      {/* Run History Section */}
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

          {/* Data Table with search, filter, sort, pagination, expand */}
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
            loadingMessage="Loading run history..."
            emptyState={{
              icon: History,
              title: "No runs yet",
              description: "Run a subscription pipeline to see history",
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
    </div>
  )
}
