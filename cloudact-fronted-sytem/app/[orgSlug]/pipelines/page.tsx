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

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { PipelineRunSummary, StepLogSummary, PipelineRunDetail as PipelineRunDetailType } from "@/lib/api/backend"

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
  }, [orgSlug])

  // Load pipeline runs (latest 100)
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        setPipelineRuns(result.data.runs)
      }
    } catch (err) {
      console.error("Failed to load pipeline runs:", err)
    }
    setRunsLoading(false)
  }, [orgSlug])

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
      } catch (err) {
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
    } catch (err: any) {
      setLastResult({
        pipelineId,
        success: false,
        message: err.message || "Failed to run pipeline",
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
        return "bg-[#007A78]/10 text-[#007A78] border-[#007A78]/20"
      case "FAILED":
        return "bg-[#FF6E50]/10 text-[#FF6E50] border-[#FF6E50]/20"
      case "RUNNING":
      case "PENDING":
        return "bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/20"
      case "SKIPPED":
        return "bg-gray-500/10 text-gray-600 border-gray-500/20"
      default:
        return ""
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="console-page-title">Pipelines</h1>
        <p className="console-subheading mt-1">
          Run data pipelines to fetch your cloud data.
        </p>
      </div>

      {/* Backend Connection Warning */}
      {(!backendConnected || !hasApiKey) && (
        <Alert className="border-[#FF6E50]/50 bg-[#FFF5F3]">
          <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription className="text-gray-700">
            <strong className="text-[#FF6E50]">
              {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
            </strong>
            <p className="mt-1 console-body">
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
            <div className="mt-3">
              <Link href={`/${orgSlug}/settings/onboarding`}>
                <button className="console-button-coral inline-flex items-center">
                  <Cloud className="h-4 w-4 mr-2" />
                  Go to Onboarding Settings
                </button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Info */}
      <Alert className="border-[#007A78]/20 bg-[#F0FDFA]">
        <Info className="h-4 w-4 text-[#007A78]" />
        <AlertDescription className="console-body text-[#007A78]">
          Pipelines run daily automatically. Use "Run Now" for manual runs or backfills.
        </AlertDescription>
      </Alert>

      {/* Result Alert */}
      {lastResult && (
        <Alert className={lastResult.success ? "border-[#007A78]/20 bg-[#F0FDFA]" : "border-[#FF6E50]/50 bg-[#FFF5F3]"}>
          {lastResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-[#007A78]" />
          ) : (
            <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
          )}
          <AlertDescription className={lastResult.success ? "text-[#007A78]" : "text-[#FF6E50]"}>
            {lastResult.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Pipelines Table - Only show pipelines for connected providers */}
      {(() => {
        // Filter pipelines to only show those with connected integrations
        const connectedPipelines = pipelines.filter((pipeline) => {
          const integration = integrations[pipeline.required_integration]
          return integration?.status === "VALID"
        })

        return (
          <div className="console-table-card">
            <Table>
              <TableHeader>
                <TableRow className="console-table-header-row">
                  <TableHead className="console-table-header">Pipeline</TableHead>
                  <TableHead className="console-table-header">Provider</TableHead>
                  <TableHead className="console-table-header">Domain</TableHead>
                  <TableHead className="console-table-header">Integration</TableHead>
                  <TableHead className="console-table-header text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectedPipelines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="space-y-2">
                        <p className="console-body">No pipelines available.</p>
                        <p className="console-small">
                          Connect a provider to see available pipelines.
                        </p>
                        <Link href={`/${orgSlug}/settings/integrations`}>
                          <button className="console-button-secondary mt-2 inline-flex items-center">
                            <Plug className="h-4 w-4 mr-2" />
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
                      <TableRow key={pipeline.id} className="console-table-row">
                        <TableCell className="console-table-cell">
                          <div>
                            <div className="font-medium text-gray-900">{pipeline.name}</div>
                            <div className="console-small">{pipeline.description}</div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="console-badge console-badge-teal">{pipeline.provider}</span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="console-badge console-badge-coral">{pipeline.domain}</span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="console-badge console-badge-success inline-flex items-center">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connected
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="console-button-primary inline-flex items-center"
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Run Now
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
        )
      })()}

      {/* Run History Section */}
      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#007A78]" />
              <h2 className="console-heading">Run History</h2>
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="console-button-secondary inline-flex items-center"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </button>
          </div>

          <div className="console-table-card">
            <Table>
              <TableHeader>
                <TableRow className="console-table-header-row">
                  <TableHead className="console-table-header w-8"></TableHead>
                  <TableHead className="console-table-header">Pipeline</TableHead>
                  <TableHead className="console-table-header">Status</TableHead>
                  <TableHead className="console-table-header">Started</TableHead>
                  <TableHead className="console-table-header">Duration</TableHead>
                  <TableHead className="console-table-header">Trigger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsLoading && pipelineRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#007A78]" />
                    </TableCell>
                  </TableRow>
                ) : pipelineRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="console-body">No pipeline runs yet. Run a pipeline to see history.</p>
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
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                        >
                          <TableCell>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{run.pipeline_id}</div>
                            <div className="text-xs text-muted-foreground">
                              {run.pipeline_logging_id.slice(0, 8)}...
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`console-badge ${getStatusColor(run.status)}`}>
                              {run.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {run.status === "FAILED" && <XCircle className="h-3 w-3 mr-1" />}
                              {(run.status === "RUNNING" || run.status === "PENDING") && (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              )}
                              {run.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{formatDateTime(run.start_time)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center text-sm">
                              <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                              {formatDuration(run.duration_ms)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="console-badge console-badge-warning text-xs">
                              {run.trigger_type}
                            </span>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={6} className="p-4">
                              {isLoadingThisDetail ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              ) : detail ? (
                                <div className="space-y-3">
                                  {/* Error Message */}
                                  {run.error_message && (
                                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-sm">
                                        <strong>Error:</strong> {run.error_message}
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  {/* Step Logs */}
                                  <div className="space-y-2">
                                    <h4 className="text-sm font-medium">Steps</h4>
                                    <div className="rounded border bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="text-xs">
                                            <TableHead className="py-2">#</TableHead>
                                            <TableHead className="py-2">Step</TableHead>
                                            <TableHead className="py-2">Type</TableHead>
                                            <TableHead className="py-2">Status</TableHead>
                                            <TableHead className="py-2">Duration</TableHead>
                                            <TableHead className="py-2">Rows</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {detail.steps.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-4">
                                                No step logs available
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            detail.steps.map((step) => (
                                              <TableRow key={step.step_logging_id} className="text-xs">
                                                <TableCell className="py-2">{step.step_index}</TableCell>
                                                <TableCell className="py-2 font-medium">{step.step_name}</TableCell>
                                                <TableCell className="py-2">
                                                  <code className="text-xs bg-muted px-1 rounded">{step.step_type}</code>
                                                </TableCell>
                                                <TableCell className="py-2">
                                                  <span className={`console-badge text-xs ${getStatusColor(step.status)}`}>
                                                    {step.status}
                                                  </span>
                                                </TableCell>
                                                <TableCell className="py-2">{formatDuration(step.duration_ms)}</TableCell>
                                                <TableCell className="py-2">
                                                  {step.rows_processed !== null && step.rows_processed !== undefined
                                                    ? step.rows_processed.toLocaleString()
                                                    : <span className="text-muted-foreground">N/A</span>}
                                                </TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>

                                    {/* Show step errors if any */}
                                    {detail.steps.filter(s => s.error_message).map((step) => (
                                      <Alert key={step.step_logging_id} variant="destructive" className="bg-red-50 dark:bg-red-900/20">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription className="text-sm">
                                          <strong>{step.step_name} Error:</strong> {step.error_message}
                                        </AlertDescription>
                                      </Alert>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center text-muted-foreground text-sm py-4">
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
      )}

      {/* Coming Soon */}
      <div className="console-stat-card border-dashed text-center">
        <p className="console-subheading">More pipelines coming soon: AWS Cost Explorer, Azure, LLM Usage Analytics</p>
      </div>
    </div>
  )
}
