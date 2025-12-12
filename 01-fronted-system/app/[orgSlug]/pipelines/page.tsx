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
  Cloud,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  History,
  Plug,
} from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription } from "@/components/ui/alert"
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

// ============================================
// Types
// ============================================

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

// ============================================
// Main Page
// ============================================

export default function PipelinesPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [pipelines, setPipelines] = useState<PipelineConfig[]>([])
  const [integrations, setIntegrations] = useState<Record<string, { status: string }>>({})
  const [runningPipeline, setRunningPipeline] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ pipelineId: string; success: boolean; message?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  // Pipeline run history state
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, PipelineRunDetailType>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  // Run history limit - show latest 100 runs
  const MAX_RUNS = 100

  // Load pipeline runs (latest 100)
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        setPipelineRuns(result.data.runs)
      }
    } catch (err: unknown) {
      console.error("Failed to load pipeline runs:", err)
    }
    setRunsLoading(false)
  }, [orgSlug])

  // Load pipelines, integrations, and backend status
  const loadData = useCallback(async () => {
    setIsLoading(true)

    // Check backend connection status and fetch pipelines
    const [onboardingStatus, apiKeyResult, pipelinesResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
      hasStoredApiKey(orgSlug),
      getAvailablePipelines(),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    // Set pipelines (filter to enabled only)
    if (pipelinesResult.success && pipelinesResult.pipelines) {
      setPipelines(pipelinesResult.pipelines.filter((p: PipelineConfig) => p.enabled))
    }

    // Load integrations
    const result = await getIntegrations(orgSlug)
    if (result.success && result.integrations) {
      setIntegrations(result.integrations.integrations)
    }
    setIsLoading(false)

    // Load pipeline runs if backend is connected
    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      loadPipelineRuns()
    }
  }, [orgSlug, loadPipelineRuns])

  // Toggle row expansion and load details
  const toggleRunExpansion = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null)
      return
    }

    setExpandedRun(runId)

    // Load details if not cached
    if (!runDetails[runId]) {
      setLoadingDetail(runId)
      try {
        const result = await getPipelineRunDetail(orgSlug, runId)
        if (result.success && result.data) {
          setRunDetails(prev => ({ ...prev, [runId]: result.data! }))
        }
      } catch (err: unknown) {
        console.error("Failed to load run details:", err)
      }
      setLoadingDetail(null)
    }
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Clear result after timeout (5s for success, 15s for errors)
  useEffect(() => {
    if (lastResult) {
      const timeout = lastResult.success ? 5000 : 15000
      const timer = setTimeout(() => setLastResult(null), timeout)
      return () => clearTimeout(timer)
    }
  }, [lastResult])

  // Run pipeline
  const handleRun = async (pipelineId: string) => {
    setRunningPipeline(pipelineId)
    setLastResult(null)

    try {
      // Use yesterday's date by default
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const date = yesterday.toISOString().split("T")[0]

      const result = await runPipeline(orgSlug, pipelineId, { date })
      setLastResult({
        pipelineId,
        success: result.success,
        message: result.success ? "Pipeline triggered successfully! Check backend logs." : result.error,
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

    // Refresh runs after executing a pipeline
    setTimeout(() => loadPipelineRuns(), 2000)
  }

  // Helper: Format date/time for display
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "-"
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  // Helper: Format duration in ms to human readable
  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return "-"
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  // Helper: Get status color - CloudAct theme
  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "bg-[#F0FDFA] text-[#007A78] border-[#007A78]/20"
      case "FAILED":
        return "bg-[#FFF5F3] text-[#FF6E50] border-[#FF6E50]/20"
      case "RUNNING":
      case "PENDING":
        return "bg-[#F0FDFA] text-[#14B8A6] border-[#14B8A6]/20"
      case "SKIPPED":
        return "bg-gray-100 text-[#6B7280] border-gray-300"
      default:
        return ""
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Pipelines</h1>
        <p className="text-sm sm:text-base text-gray-600">
          Run data pipelines to fetch your cloud data.
        </p>
      </div>

      {/* Backend Connection Warning */}
      {(!backendConnected || !hasApiKey) && (
        <Alert className="border-2 border-[#FF6E50] bg-[#FFF5F3]">
          <AlertCircle className="h-5 w-5 text-[#FF6E50]" />
          <AlertDescription className="space-y-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">
              {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
            </h3>
            <p className="text-sm text-gray-700">
              {!backendConnected ? (
                <>
                  Your organization is not connected to the pipeline backend.
                  Pipelines cannot run until backend onboarding is complete.
                </>
              ) : (
                <>
                  Your organization API key is missing.
                  This is required to run pipelines.
                </>
              )}
            </p>
            <div>
              <Link href={`/${orgSlug}/settings/onboarding`}>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF6E50] text-white text-sm font-medium rounded-lg hover:bg-[#E55A3C] transition-colors">
                  <Cloud className="h-4 w-4" />
                  Go to Onboarding Settings
                </button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Info Alert */}
      <Alert className="border-2 border-[#007A78] bg-[#F0FDFA]">
        <Info className="h-5 w-5 text-[#007A78]" />
        <AlertDescription className="text-sm text-gray-700">
          Pipelines run daily automatically. Use "Run Now" for manual runs or backfills.
        </AlertDescription>
      </Alert>

      {/* Result Alert */}
      {lastResult && (
        <Alert className={`border-2 ${lastResult.success ? 'border-[#007A78] bg-[#F0FDFA]' : 'border-[#FF6E50] bg-[#FFF5F3]'}`}>
          {lastResult.success ? (
            <CheckCircle2 className="h-5 w-5 text-[#007A78]" />
          ) : (
            <AlertCircle className="h-5 w-5 text-[#FF6E50]" />
          )}
          <AlertDescription className={`text-sm font-medium ${lastResult.success ? 'text-[#007A78]' : 'text-[#FF6E50]'}`}>
            {lastResult.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Pipelines Table - Only show pipelines for connected providers */}
      {(() => {
        // Filter pipelines to only show those with connected integrations
        // OR pipelines that don't require any integration (like SaaS subscriptions)
        const connectedPipelines = pipelines.filter((pipeline) => {
          // If no integration required, always show the pipeline
          if (!pipeline.required_integration || pipeline.required_integration === "") {
            return true
          }
          const integration = integrations[pipeline.required_integration]
          return integration?.status === "VALID"
        })

        return (
          <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b-2 border-[#007A78]/30 bg-[#007A78]/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#007A78] flex items-center justify-center">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">Available Pipelines</h2>
                  <p className="text-xs text-gray-600">Run data pipelines to sync your costs</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-b-2 border-[#007A78]/30 bg-[#007A78]/5">
                  <TableHead className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r-2 border-[#007A78]/20">Pipeline</TableHead>
                  <TableHead className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r-2 border-[#007A78]/20">Provider</TableHead>
                  <TableHead className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r-2 border-[#007A78]/20">Domain</TableHead>
                  <TableHead className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r-2 border-[#007A78]/20">Status</TableHead>
                  <TableHead className="px-4 sm:px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectedPipelines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 sm:px-6 py-12 text-center">
                      <div className="space-y-4">
                        <p className="text-sm sm:text-base text-gray-700 font-medium">No pipelines available.</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          Connect a provider to see available pipelines.
                        </p>
                        <Link href={`/${orgSlug}/settings/integrations`}>
                          <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#007A78] text-white text-sm font-medium rounded-lg hover:bg-[#005F5D] transition-colors mt-2">
                            <Plug className="h-4 w-4" />
                            Add New Provider
                          </button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  connectedPipelines.map((pipeline) => {
                    const isRunning = runningPipeline === pipeline.id

                    return (
                      <TableRow key={pipeline.id} className="border-b-2 border-[#007A78]/10 hover:bg-[#007A78]/5 transition-all">
                        <TableCell className="px-4 sm:px-6 py-4 border-r-2 border-[#007A78]/10">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                              <Play className="h-4 w-4 text-white" />
                            </div>
                            <div className="space-y-0.5">
                              <div className="text-sm font-bold text-gray-900">{pipeline.name}</div>
                              <div className="text-xs text-gray-500">{pipeline.description}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-4 border-r-2 border-[#007A78]/10">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">
                            {pipeline.provider}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-4 border-r-2 border-[#007A78]/10">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                            {pipeline.domain}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-4 border-r-2 border-[#007A78]/10">
                          {!pipeline.required_integration || pipeline.required_integration === "" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#007A78] text-white">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#007A78] text-white">
                              <CheckCircle2 className="h-3 w-3" />
                              Connected
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-4 text-right">
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FF6E50] text-white text-sm font-semibold rounded-lg hover:bg-[#E55A3C] disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all"
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="hidden sm:inline">Running...</span>
                                <span className="sm:hidden">Run...</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                <span className="hidden sm:inline">Run Now</span>
                                <span className="sm:hidden">Run</span>
                              </>
                            )}
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        )
      })()}

      {/* Run History Section */}
      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 sm:h-6 sm:w-6 text-gray-900" />
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Run History</h2>
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50">
                  <TableHead className="px-3 py-3 w-10"></TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Pipeline</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Started</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Duration</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Trigger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsLoading && pipelineRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-4 sm:px-6 py-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                    </TableCell>
                  </TableRow>
                ) : pipelineRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-4 sm:px-6 py-12 text-center">
                      <p className="text-sm text-gray-500">No pipeline runs yet. Run a pipeline to see history.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  pipelineRuns.map((run) => {
                    const isExpanded = expandedRun === run.pipeline_logging_id
                    const detail = runDetails[run.pipeline_logging_id]
                    const isLoadingThisDetail = loadingDetail === run.pipeline_logging_id

                    return (
                      <React.Fragment key={run.pipeline_logging_id}>
                        <TableRow
                          className="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
                          onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                        >
                          <TableCell className="px-3 py-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-500" />
                            )}
                          </TableCell>
                          <TableCell className="px-3 sm:px-4 py-3">
                            <div className="text-sm font-semibold text-gray-900">{run.pipeline_id}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">
                              {run.pipeline_logging_id.slice(0, 8)}...
                            </div>
                          </TableCell>
                          <TableCell className="px-3 sm:px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                              run.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                              run.status === "FAILED" ? "bg-red-100 text-red-700" :
                              run.status === "RUNNING" ? "bg-blue-100 text-blue-700" :
                              run.status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {run.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3" />}
                              {run.status === "FAILED" && <XCircle className="h-3 w-3" />}
                              {(run.status === "RUNNING" || run.status === "PENDING") && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              <span className="hidden sm:inline">{run.status}</span>
                            </span>
                          </TableCell>
                          <TableCell className="px-3 sm:px-4 py-3">
                            <div className="text-xs sm:text-sm text-gray-700">{formatDateTime(run.start_time)}</div>
                          </TableCell>
                          <TableCell className="px-3 sm:px-4 py-3">
                            <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-700">
                              <Clock className="h-3 w-3 text-gray-500" />
                              {formatDuration(run.duration_ms)}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 sm:px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {run.trigger_type}
                            </span>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={6} className="px-4 sm:px-6 py-6">
                              {isLoadingThisDetail ? (
                                <div className="flex items-center justify-center py-6">
                                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                </div>
                              ) : detail ? (
                                <div className="space-y-4">
                                  {/* Error Message */}
                                  {run.error_message && (
                                    <Alert className="border-2 border-[#FF6E50] bg-white">
                                      <AlertCircle className="h-5 w-5 text-[#FF6E50]" />
                                      <AlertDescription>
                                        <p className="text-sm font-semibold text-gray-900">Error</p>
                                        <p className="text-sm text-gray-700 mt-1">{run.error_message}</p>
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  {/* Step Logs */}
                                  <div className="space-y-3">
                                    <h4 className="text-sm sm:text-base font-semibold text-gray-900">Steps</h4>
                                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                      <div className="overflow-x-auto">
                                        <Table className="min-w-[500px]">
                                        <TableHeader>
                                          <TableRow className="border-b border-gray-200 bg-gray-50">
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">#</TableHead>
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Step</TableHead>
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Type</TableHead>
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Status</TableHead>
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Duration</TableHead>
                                            <TableHead className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Rows</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {detail.steps.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={6} className="text-center text-gray-500 text-xs sm:text-sm py-6">
                                                No step logs available
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            detail.steps.map((step) => (
                                              <TableRow key={step.step_logging_id} className="border-b border-gray-200 hover:bg-gray-50">
                                                <TableCell className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-900">{step.step_index}</TableCell>
                                                <TableCell className="px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900">{step.step_name}</TableCell>
                                                <TableCell className="px-3 py-2">
                                                  <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{step.step_type}</code>
                                                </TableCell>
                                                <TableCell className="px-3 py-2">
                                                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                                                    step.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                                                    step.status === "FAILED" ? "bg-red-100 text-red-700" :
                                                    step.status === "RUNNING" ? "bg-blue-100 text-blue-700" :
                                                    step.status === "SKIPPED" ? "bg-gray-100 text-gray-700" :
                                                    "bg-gray-100 text-gray-700"
                                                  }`}>
                                                    {step.status}
                                                  </span>
                                                </TableCell>
                                                <TableCell className="px-3 py-2 text-xs sm:text-sm text-gray-700">{formatDuration(step.duration_ms)}</TableCell>
                                                <TableCell className="px-3 py-2 text-xs sm:text-sm text-gray-700">
                                                  {step.rows_processed !== null && step.rows_processed !== undefined
                                                    ? step.rows_processed.toLocaleString()
                                                    : <span className="text-gray-400">N/A</span>}
                                                </TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                      </div>
                                    </div>

                                    {/* Show step errors if any */}
                                    {detail.steps.filter(s => s.error_message).map((step) => (
                                      <Alert key={step.step_logging_id} className="border-2 border-[#FF6E50] bg-white">
                                        <AlertCircle className="h-5 w-5 text-[#FF6E50]" />
                                        <AlertDescription>
                                          <p className="text-sm font-semibold text-gray-900">{step.step_name} Error</p>
                                          <p className="text-xs sm:text-sm text-gray-700 mt-1">{step.error_message}</p>
                                        </AlertDescription>
                                      </Alert>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center text-gray-500 text-xs sm:text-sm py-6">
                                  Failed to load details
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>
      )}

      {/* Coming Soon */}
      <div className="border-2 border-dashed border-gray-300 bg-white rounded-xl p-6 sm:p-8 text-center">
        <p className="text-xs sm:text-sm text-gray-500 font-medium">
          More pipelines coming soon: AWS Cost Explorer, Azure, LLM Usage Analytics
        </p>
      </div>
    </div>
  )
}
