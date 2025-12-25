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
  Cloud,
  Plug,
  TrendingUp,
  Database,
  CalendarClock,
  Check,
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
import { getIntegrations } from "@/actions/integrations"
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

export default function CostRunsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [integrations, setIntegrations] = useState<Record<string, { status: string }>>({})
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

  // Filter for cloud cost domain pipelines (gcp, aws, azure billing)
  const filterDomain = (domain: string) => {
    const d = domain.toLowerCase()
    return d === 'cost' || d === 'billing' || d.includes('cloud')
  }

  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        // Filter runs by cost/billing domain
        const filteredRuns = result.data.runs.filter((run: PipelineRunSummary) => {
          const pipelineId = run.pipeline_id.toLowerCase()
          return pipelineId.includes('cost') || pipelineId.includes('billing') ||
                 pipelineId.includes('gcp') || pipelineId.includes('aws') || pipelineId.includes('azure')
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
        p.enabled && filterDomain(p.domain)
      )
      setPipelines(filtered)
    }

    // Load integrations for checking connected providers
    const result = await getIntegrations(orgSlug)
    if (result.success && result.integrations) {
      setIntegrations(result.integrations.integrations)
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
        return "bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/20"
      case "FAILED":
      case "TIMEOUT":
        return "bg-rose-50 text-rose-600 border border-rose-200"
      case "RUNNING":
      case "PENDING":
      case "CANCELLING":
        return "bg-amber-50 text-amber-600 border border-amber-200"
      case "CANCELLED":
        return "bg-amber-50 text-amber-600 border border-amber-200"
      case "SKIPPED":
        return "bg-slate-100 text-slate-500 border border-slate-200"
      default:
        return "bg-slate-100 text-slate-500 border border-slate-200"
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

  // Filter to only connected pipelines
  const connectedPipelines = pipelines.filter((pipeline) => {
    if (!pipeline.required_integration || pipeline.required_integration === "") {
      return true
    }
    const integration = integrations[pipeline.required_integration]
    return integration?.status === "VALID"
  })

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
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading runs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Cost Pipeline Runs
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Monitor your cloud cost data pipeline executions
        </p>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-rose-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-slate-900">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-slate-500">
                Complete organization onboarding to run pipelines.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="inline-flex items-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-blue-50 p-4 border border-blue-200">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <p className="text-[15px] text-slate-900">
            Cloud cost pipelines sync billing data from your cloud provider accounts.
          </p>
        </div>
      </div>

      {lastResult && (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 ${lastResult.success ? 'bg-[#007A78]/5 border-[#007A78]/20' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            )}
            <p className={`text-[15px] font-medium ${lastResult.success ? 'text-[#007A78]' : 'text-rose-600'}`}>
              {lastResult.message}
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Available Pipelines</h2>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2 text-[#007A78]">
              <Cloud className="h-[18px] w-[18px]" />
              <span className="text-[15px] font-semibold">Cloud provider billing pipelines</span>
            </div>
          </div>

          {/* Empty state */}
          {connectedPipelines.length === 0 && (
            <div className="px-4 sm:px-6 py-12 text-center">
              <div className="space-y-4">
                <div className="inline-flex p-4 rounded-2xl bg-slate-100 mb-2">
                  <Plug className="h-12 w-12 text-slate-400" />
                </div>
                <h3 className="text-[20px] font-semibold text-slate-900">No cloud cost pipelines</h3>
                <p className="text-[15px] text-slate-500 max-w-md mx-auto">
                  Connect a cloud provider to see available cost pipelines.
                </p>
                <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                  <button className="inline-flex items-center gap-2 h-11 px-6 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors shadow-sm">
                    <Cloud className="h-4 w-4" />
                    Configure Cloud Providers
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* Mobile card view */}
          {connectedPipelines.length > 0 && (
            <div className="md:hidden divide-y divide-slate-200">
              {connectedPipelines.map((pipeline) => {
                const isRunning = runningPipeline === pipeline.id

                return (
                  <div key={pipeline.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-slate-900">{pipeline.name}</div>
                        <div className="text-[13px] text-slate-500 mt-0.5">{pipeline.description}</div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/20 flex-shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 uppercase border border-slate-200">
                        {pipeline.provider}
                      </span>
                      <button
                        onClick={() => handleRun(pipeline.id)}
                        disabled={isRunning}
                        className="inline-flex items-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md"
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
          {connectedPipelines.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="console-table-header">Pipeline</TableHead>
                    <TableHead className="console-table-header">Provider</TableHead>
                    <TableHead className="console-table-header">Status</TableHead>
                    <TableHead className="console-table-header text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectedPipelines.map((pipeline) => {
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
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 uppercase border border-slate-200">
                            {pipeline.provider}
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="inline-flex items-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md"
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
          <div className="mb-6">
            <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Run History</h2>

            {pipelineRuns.length > 0 && (
              <div className="flex items-center gap-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#007A78]/10 flex items-center justify-center">
                    <Check className="h-5 w-5 text-[#007A78]" />
                  </div>
                  <div>
                    <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.completed}</p>
                    <p className="text-[12px] text-slate-500 font-medium mt-0.5">Successful</p>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.failed}</p>
                    <p className="text-[12px] text-slate-500 font-medium mt-0.5">Failed</p>
                  </div>
                </div>
                {runStats.running > 0 && (
                  <>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
                      </div>
                      <div>
                        <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.running}</p>
                        <p className="text-[12px] text-slate-500 font-medium mt-0.5">Running</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-slate-100 text-slate-600 text-[15px] font-medium rounded-xl hover:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors touch-manipulation border border-slate-200"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-0 overflow-hidden">
            {/* Loading state */}
            {runsLoading && pipelineRuns.length === 0 && (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium">Loading runs...</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 rounded-2xl bg-slate-100 mb-2">
                    <History className="h-10 w-10 text-slate-400" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-slate-900">No runs yet</h3>
                  <p className="text-[15px] text-slate-500">Run a cost pipeline to see history</p>
                </div>
              </div>
            )}

            {/* Mobile card view */}
            {pipelineRuns.length > 0 && (
              <div className="md:hidden divide-y divide-slate-200">
                {pipelineRuns.map((run) => {
                  const isExpanded = expandedRun === run.pipeline_logging_id
                  const detail = runDetails[run.pipeline_logging_id]
                  const isLoadingThisDetail = loadingDetail === run.pipeline_logging_id

                  return (
                    <div key={run.pipeline_logging_id}>
                      <button
                        className="w-full p-4 text-left touch-manipulation hover:bg-slate-50 transition-colors"
                        onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
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
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${run.status === 'COMPLETED' ? 'bg-[#007A78]' : run.status === 'FAILED' ? 'bg-rose-500' : 'bg-amber-500'}`}
                                style={{ width: getDurationWidth(run.duration_ms) }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 bg-slate-50">
                          {isLoadingThisDetail ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              {run.error_message && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-rose-50 p-4 border-l-4 border-rose-500">
                                  <div className="flex items-start gap-3">
                                    <XCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
                                      <p className="text-[13px] text-slate-500 mt-1 break-words font-mono">{run.error_message}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-[#007A78]" />
                                  <h4 className="text-[15px] font-semibold text-slate-900">Pipeline Steps</h4>
                                </div>
                                {detail.steps.length === 0 ? (
                                  <p className="text-center text-slate-500 text-[13px] py-4">No step logs available</p>
                                ) : (
                                  <div className="space-y-2">
                                    {detail.steps.map((step, index) => (
                                      <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex-shrink-0">
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
                                          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full ${step.status === 'COMPLETED' ? 'bg-[#007A78]' : step.status === 'FAILED' ? 'bg-rose-500' : 'bg-amber-500'}`}
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
                    <TableRow className="border-b border-slate-200">
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
                            className="console-table-row cursor-pointer touch-manipulation hover:bg-slate-50 transition-colors"
                            onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                          >
                            <TableCell className="console-table-cell">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
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
                              <div className="text-[13px] text-slate-900">{formatDateTime(run.start_time)}</div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="space-y-1.5">
                                <div className="text-[13px] font-medium text-slate-900">{formatDuration(run.duration_ms)}</div>
                                <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${run.status === 'COMPLETED' ? 'bg-[#007A78]' : run.status === 'FAILED' ? 'bg-rose-500' : 'bg-amber-500'}`}
                                    style={{ width: getDurationWidth(run.duration_ms) }}
                                  ></div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-slate-50">
                              <TableCell colSpan={5} className="px-4 sm:px-6 py-6">
                                {isLoadingThisDetail ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-4">
                                    {run.error_message && (
                                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-rose-50 p-4 border-l-4 border-rose-500">
                                        <div className="flex items-start gap-3">
                                          <XCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
                                          <div className="flex-1">
                                            <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
                                            <p className="text-[13px] text-slate-500 mt-1 font-mono">{run.error_message}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-[#007A78]" />
                                        <h4 className="text-[15px] font-semibold text-slate-900">Pipeline Steps</h4>
                                      </div>
                                      <div className="grid gap-3">
                                        {detail.steps.length === 0 ? (
                                          <p className="text-center text-slate-500 text-[13px] py-6">No step logs available</p>
                                        ) : (
                                          detail.steps.map((step) => (
                                            <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                              <div className="flex items-center justify-between gap-4 mb-3">
                                                <div className="flex items-center gap-3">
                                                  <span className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-slate-600 text-[13px] font-bold">
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
                                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full ${step.status === 'COMPLETED' ? 'bg-[#007A78]' : step.status === 'FAILED' ? 'bg-rose-500' : 'bg-amber-500'}`}
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
