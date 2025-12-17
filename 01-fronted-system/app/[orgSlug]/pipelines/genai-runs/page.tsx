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
  Brain,
  Plug,
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

export default function GenAIRunsPage() {
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

  // Filter for GenAI/LLM domain pipelines
  const filterDomain = (domain: string) => {
    const d = domain.toLowerCase()
    return d === 'genai' || d === 'llm' || d === 'ai' || d.includes('usage')
  }

  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        // Filter runs by GenAI/LLM domain
        const filteredRuns = result.data.runs.filter((run: PipelineRunSummary) => {
          const pipelineId = run.pipeline_id.toLowerCase()
          return pipelineId.includes('genai') || pipelineId.includes('llm') ||
                 pipelineId.includes('openai') || pipelineId.includes('anthropic') ||
                 pipelineId.includes('gemini') || pipelineId.includes('deepseek')
        })
        setPipelineRuns(filteredRuns)
      }
    } catch (err: unknown) {
      console.error("Failed to load pipeline runs:", err)
    }
    setRunsLoading(false)
  }, [orgSlug])

  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [onboardingStatus, apiKeyResult, pipelinesResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
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
        console.error("Failed to load run details:", err)
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
      return new Date(dateString).toLocaleString()
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

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10"
      case "FAILED":
        return "bg-[#FF6E50]/10 text-[#FF6E50] border border-[#FF6E50]/10"
      case "RUNNING":
      case "PENDING":
        return "bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/10"
      default:
        return "bg-[#F5F5F7] text-[#8E8E93] border border-[#E5E5EA]"
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">GenAI Runs</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">
          Run and monitor LLM API usage pipelines.
        </p>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="health-card bg-[#FF6E50]/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-[#8E8E93]">
                Complete organization onboarding to run pipelines.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="inline-flex items-center gap-2 h-[36px] px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="health-card bg-[#007A78]/5 p-4">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[#007A78] flex-shrink-0" />
          <p className="text-[15px] text-black">
            GenAI pipelines track API usage and costs from LLM providers like OpenAI, Anthropic, and Google.
          </p>
        </div>
      </div>

      {lastResult && (
        <div className={`health-card p-4 ${lastResult.success ? 'bg-[#007A78]/10' : 'bg-[#FF6E50]/10'}`}>
          <div className="flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[#FF6E50] flex-shrink-0" />
            )}
            <p className={`text-[15px] font-medium ${lastResult.success ? 'text-[#007A78]' : 'text-[#FF6E50]'}`}>
              {lastResult.message}
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">Available Pipelines</h2>
        <div className="health-card p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5EA]">
            <div className="flex items-center gap-2 text-[#007A78]">
              <Brain className="h-[18px] w-[18px]" />
              <span className="text-[15px] font-semibold">LLM usage tracking pipelines</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-b border-[#E5E5EA]">
                  <TableHead className="console-table-header">Pipeline</TableHead>
                  <TableHead className="console-table-header">Provider</TableHead>
                  <TableHead className="console-table-header">Status</TableHead>
                  <TableHead className="console-table-header text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectedPipelines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="px-4 sm:px-6 py-12 text-center">
                      <div className="space-y-4">
                        <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-2">
                          <Plug className="h-12 w-12 text-[#007A78]" />
                        </div>
                        <h3 className="text-[20px] font-semibold text-black">No GenAI pipelines</h3>
                        <p className="text-[15px] text-[#8E8E93] max-w-md mx-auto">
                          Connect an LLM provider to see available usage pipelines.
                        </p>
                        <Link href={`/${orgSlug}/integrations/llm`}>
                          <button className="inline-flex items-center gap-2 h-[44px] px-6 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors shadow-sm">
                            <Brain className="h-4 w-4" />
                            Configure LLM Providers
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
                          <div className="space-y-0.5">
                            <div className="text-[15px] font-semibold text-black">{pipeline.name}</div>
                            <div className="text-[13px] text-[#8E8E93]">{pipeline.description}</div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#F5F5F7] text-[#8E8E93]">
                            {pipeline.provider}
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="inline-flex items-center gap-2 h-[36px] px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed transition-all"
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="hidden sm:inline">Running...</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                <span className="hidden sm:inline">Run Now</span>
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
      </div>

      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-[22px] font-bold text-black">Run History</h2>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-[36px] px-4 bg-[#F5F5F7] text-[#8E8E93] text-[15px] font-medium rounded-xl hover:bg-[#E8E8ED] disabled:text-[#C7C7CC] disabled:cursor-not-allowed transition-colors"
            >
              {runsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>

          <div className="health-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
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
                  {runsLoading && pipelineRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="px-4 sm:px-6 py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#007A78]" />
                      </TableCell>
                    </TableRow>
                  ) : pipelineRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="px-4 sm:px-6 py-12 text-center">
                        <div className="space-y-3">
                          <div className="inline-flex p-3 rounded-2xl bg-[#8E8E93]/10 mb-2">
                            <History className="h-10 w-10 text-[#8E8E93]" />
                          </div>
                          <h3 className="text-[17px] font-semibold text-black">No runs yet</h3>
                          <p className="text-[15px] text-[#8E8E93]">Run a GenAI pipeline to see history</p>
                        </div>
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
                            className="console-table-row cursor-pointer"
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
                              <div className="text-[15px] font-semibold text-black">{run.pipeline_id}</div>
                              <div className="text-[11px] text-[#8E8E93] font-mono mt-0.5">
                                {run.pipeline_logging_id.slice(0, 8)}...
                              </div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border ${getStatusColor(run.status)}`}>
                                {run.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3" />}
                                {run.status === "FAILED" && <XCircle className="h-3 w-3" />}
                                {(run.status === "RUNNING" || run.status === "PENDING") && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                <span className="hidden sm:inline">{run.status}</span>
                              </span>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="text-[13px] text-black">{formatDateTime(run.start_time)}</div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="flex items-center gap-1 text-[13px] text-black">
                                <Clock className="h-3 w-3 text-[#8E8E93]" />
                                {formatDuration(run.duration_ms)}
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-[#F5F5F7]">
                              <TableCell colSpan={5} className="px-4 sm:px-6 py-6">
                                {isLoadingThisDetail ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-4">
                                    {run.error_message && (
                                      <div className="health-card bg-[#FF6E50]/10 p-4">
                                        <div className="flex items-start gap-3">
                                          <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
                                          <div>
                                            <p className="text-[15px] font-semibold text-black">Error</p>
                                            <p className="text-[13px] text-[#8E8E93] mt-1">{run.error_message}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <h4 className="text-[15px] font-semibold text-black">Steps</h4>
                                      <div className="health-card p-0 overflow-hidden">
                                        <div className="overflow-x-auto">
                                          <Table className="min-w-[400px]">
                                            <TableHeader>
                                              <TableRow className="border-b border-[#E5E5EA]">
                                                <TableHead className="console-table-header">#</TableHead>
                                                <TableHead className="console-table-header">Step</TableHead>
                                                <TableHead className="console-table-header">Status</TableHead>
                                                <TableHead className="console-table-header">Duration</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {detail.steps.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={4} className="text-center text-[#8E8E93] text-[13px] py-6">
                                                    No step logs available
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                detail.steps.map((step) => (
                                                  <TableRow key={step.step_logging_id} className="console-table-row">
                                                    <TableCell className="console-table-cell text-[13px] font-medium text-black">{step.step_index}</TableCell>
                                                    <TableCell className="console-table-cell text-[13px] font-semibold text-black">{step.step_name}</TableCell>
                                                    <TableCell className="console-table-cell">
                                                      <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full ${getStatusColor(step.status)}`}>
                                                        {step.status}
                                                      </span>
                                                    </TableCell>
                                                    <TableCell className="console-table-cell text-[13px] text-black">{formatDuration(step.duration_ms)}</TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center text-[#8E8E93] text-[13px] py-6">
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
    </div>
  )
}
