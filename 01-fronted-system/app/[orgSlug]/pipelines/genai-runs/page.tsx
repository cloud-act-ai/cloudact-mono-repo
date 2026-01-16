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
  Clock,
  RefreshCw,
  History,
  Brain,
  Plug,
  Zap,
  Server,
  Layers,
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
import { runPipeline, getAvailablePipelines, getPipelineRuns, getPipelineRunDetail } from "@/actions/pipelines"
import { getIntegrations } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import { PipelineRunSummary, PipelineRunDetail as PipelineRunDetailType } from "@/lib/api/backend"

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

// Tab configuration for GenAI pipeline categories
const PIPELINE_TABS = [
  {
    id: "payg",
    label: "Raw Usage",
    icon: Zap,
    description: "Token-based usage from LLM providers",
    filter: (p: PipelineConfig) => p.domain === "payg",
  },
  {
    id: "commitment",
    label: "Commitments",
    icon: Clock,
    description: "Reserved capacity & provisioned throughput",
    filter: (p: PipelineConfig) => p.domain === "commitment",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    icon: Server,
    description: "GPU/TPU compute costs",
    filter: (p: PipelineConfig) => p.domain === "infrastructure",
  },
  {
    id: "consolidation",
    label: "Consolidation",
    icon: Layers,
    description: "Unified costs & FOCUS 1.3 conversion",
    filter: (p: PipelineConfig) => p.domain === "unified",
  },
]

// ============================================================================
// Helper Functions
// ============================================================================

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

export default function GenAIRunsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // Pipeline state
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [integrations, setIntegrations] = useState<Record<string, { status: string }>>({})
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
  const [runDetails, setRunDetails] = useState<Record<string, PipelineRunDetailType>>({})

  // Active tab state
  const [activeTab, setActiveTab] = useState("payg")

  const MAX_RUNS = 100

  // Load pipeline runs
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        const filteredRuns = result.data.runs.filter((run: PipelineRunSummary) => {
          const pipelineId = run.pipeline_id.toLowerCase()
          return (
            pipelineId.includes("genai") ||
            pipelineId.includes("llm") ||
            pipelineId.includes("openai") ||
            pipelineId.includes("anthropic") ||
            pipelineId.includes("gemini") ||
            pipelineId.includes("deepseek")
          )
        })
        setPipelineRuns(filteredRuns)
      }
    } catch {
      // Handle error silently
    }
    setRunsLoading(false)
  }, [orgSlug])

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
      const filtered = pipelinesResult.pipelines.filter(
        (p: PipelineConfig) => p.enabled && p.provider === "genai"
      )
      setPipelines(filtered)
    }

    const result = await getIntegrations(orgSlug)
    if (result.success && result.integrations) {
      setIntegrations(result.integrations.integrations)
    }

    setIsLoading(false)

    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      loadPipelineRuns()
    }
  }, [orgSlug, loadPipelineRuns])

  // Load run details
  const loadRunDetail = async (runId: string): Promise<PipelineRunDetailType | undefined> => {
    if (runDetails[runId]) return runDetails[runId]
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
      const startDate = yesterday.toISOString().split("T")[0]

      const result = await runPipeline(orgSlug, pipelineId, { start_date: startDate })
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

  // Helper to check if pipeline is connected
  const isPipelineConnected = (pipeline: PipelineConfig) => {
    if (!pipeline.required_integration || pipeline.required_integration === "") {
      return true
    }
    const integration = integrations[pipeline.required_integration]
    return integration?.status === "VALID"
  }

  // Get pipelines for current tab
  const currentTabConfig = PIPELINE_TABS.find((t) => t.id === activeTab)
  const tabPipelines = pipelines.filter(currentTabConfig?.filter || (() => true))
  // Filter to only connected pipelines (those with valid integrations)
  const _connectedTabPipelines = tabPipelines.filter(isPipelineConnected)

  // Calculate run statistics
  const runStats = {
    total: pipelineRuns.length,
    completed: pipelineRuns.filter((r) => r.status === "COMPLETED").length,
    failed: pipelineRuns.filter((r) => r.status === "FAILED" || r.status === "TIMEOUT").length,
    running: pipelineRuns.filter((r) => r.status === "RUNNING" || r.status === "PENDING").length,
  }

  // Build stats for StatRow
  const stats = [
    { icon: Brain, value: runStats.total, label: "Total", color: "slate" as const },
    { icon: CheckCircle2, value: runStats.completed, label: "Done", color: "mint" as const },
    ...(runStats.failed > 0
      ? [{ icon: XCircle, value: runStats.failed, label: "Failed", color: "coral" as const }]
      : []),
    ...(runStats.running > 0
      ? [{ icon: Loader2, value: runStats.running, label: "Running", color: "blue" as const }]
      : []),
  ]

  // Filter runs by current tab
  const getRunsForTab = (tabId: string) => {
    return pipelineRuns.filter((run) => {
      const pipelineId = run.pipeline_id.toLowerCase()
      switch (tabId) {
        case "payg":
          return pipelineId.includes("payg") && !pipelineId.includes("unified")
        case "commitment":
          return pipelineId.includes("commitment")
        case "infrastructure":
          return pipelineId.includes("infrastructure")
        case "consolidation":
          return pipelineId.includes("unified") || pipelineId.includes("consolidat")
        default:
          return true
      }
    })
  }

  const tabRuns = getRunsForTab(activeTab)

  // Column definitions for run history table
  const runHistoryColumns: ColumnDef<PipelineRunSummary>[] = [
    {
      id: "pipeline_id",
      header: "Pipeline",
      accessorKey: "pipeline_id",
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="text-[15px] font-semibold text-slate-900">{row.pipeline_id}</div>
          <div className="text-[11px] text-slate-500 font-mono">
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
        <div className="text-[13px] text-slate-700">{formatDateTime(row.start_time)}</div>
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
            <div className="text-[13px] font-medium text-slate-900">
              {formatDuration(row.duration_ms)}
            </div>
            <div className="h-1.5 w-24 bg-[#E5E5EA] rounded-full overflow-hidden">
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
    return <LoadingState message="Loading GenAI pipelines..." size="lg" />
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
          GenAI Pipelines
        </h1>
        <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
          Monitor your AI/ML cost pipeline executions
        </p>
      </div>

      {/* Stats Row */}
      {pipelineRuns.length > 0 && <StatRow stats={stats} />}

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
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
            <CheckCircle2 className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          )}
          <p
            className={`text-[13px] font-medium ${
              lastResult.success ? "text-[#1a7a3a]" : "text-rose-700"
            }`}
          >
            {lastResult.message}
          </p>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0.5 sm:gap-1 -mb-px overflow-x-auto pb-px scrollbar-hide">
          {PIPELINE_TABS.map((tab) => {
            const Icon = tab.icon
            const tabPipelineCount = pipelines.filter(tab.filter).length
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[12px] sm:text-[14px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation
                  ${
                    isActive
                      ? "border-[var(--cloudact-mint-dark)] text-[#1a7a3a] bg-[var(--cloudact-mint)]/5"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }
                `}
              >
                <Icon
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                    isActive ? "text-[var(--cloudact-mint-dark)]" : ""
                  }`}
                />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
                <span
                  className={`
                  inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold
                  ${isActive ? "bg-[var(--cloudact-mint)] text-[#1a7a3a]" : "bg-slate-100 text-slate-500"}
                `}
                >
                  {tabPipelineCount}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Description */}
      <div className="p-4 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
          <p className="text-[13px] text-slate-700 font-medium">
            {currentTabConfig?.description ||
              "GenAI pipelines track API usage and costs from LLM providers."}
          </p>
        </div>
      </div>

      {/* Available Pipelines for Current Tab */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-4">
          {currentTabConfig?.label} Pipelines
        </h2>
        <PremiumCard>
          {tabPipelines.length === 0 ? (
            <EmptyState
              icon={Plug}
              title={`No ${currentTabConfig?.label.toLowerCase()} pipelines`}
              description="Connect an LLM provider to see available pipelines."
              action={{
                label: "Configure GenAI Providers",
                href: `/${orgSlug}/integrations/genai`,
                icon: Brain,
              }}
              size="lg"
            />
          ) : (
            <div className="divide-y divide-[#E5E5EA]">
              {tabPipelines.map((pipeline) => {
                const isConnected = isPipelineConnected(pipeline)
                return (
                  <AvailablePipelineCard
                    key={pipeline.id}
                    id={pipeline.id}
                    name={pipeline.name}
                    description={pipeline.description}
                    provider={pipeline.pipeline}
                    status={isConnected ? "ready" : "disabled"}
                    running={runningPipeline === pipeline.id}
                    onRun={isConnected ? () => handleRun(pipeline.id) : undefined}
                    runIcon={isConnected ? Play : Plug}
                    runLabel={isConnected ? "Run Now" : "Connect"}
                  />
                )
              })}
            </div>
          )}
        </PremiumCard>
      </div>

      {/* Run History for Current Tab */}
      {backendConnected && hasApiKey && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
              {currentTabConfig?.label} Run History
            </h2>
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

          {/* Data Table */}
          <PremiumDataTable
            data={tabRuns}
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
            loading={runsLoading && tabRuns.length === 0}
            loadingMessage="Loading run history..."
            emptyState={{
              icon: History,
              title: `No ${currentTabConfig?.label.toLowerCase()} runs yet`,
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
                    <div className="text-center text-slate-500 text-[13px] py-6">
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
                        steps={runDetails[row.pipeline_logging_id].steps.map((step) => ({
                          id: step.step_logging_id,
                          index: step.step_index,
                          name: step.step_name,
                          status: step.status,
                          duration: step.duration_ms,
                        }))}
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
