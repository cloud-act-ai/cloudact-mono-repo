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
  TrendingUp,
  CalendarClock,
  Zap,
  Server,
  Layers,
  ArrowRightLeft,
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

  // Active tab state
  const [activeTab, setActiveTab] = useState("payg")

  const MAX_RUNS = 100

  // Filter for GenAI/LLM domain pipelines
  const filterDomain = (domain: string) => {
    const d = domain.toLowerCase()
    return d === 'genai' || d === 'llm' || d === 'ai' || d === 'payg' ||
           d === 'commitment' || d === 'infrastructure' || d === 'unified' ||
           d.includes('usage')
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
      // Filter only genai provider pipelines
      const filtered = pipelinesResult.pipelines.filter((p: PipelineConfig) =>
        p.enabled && p.provider === 'genai'
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
      const startDate = yesterday.toISOString().split("T")[0]

      // GenAI pipelines require start_date parameter
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
        return "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border"
      default:
        return "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border"
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

  // Helper to check if pipeline is connected
  const isPipelineConnected = (pipeline: PipelineConfig) => {
    if (!pipeline.required_integration || pipeline.required_integration === "") {
      return true
    }
    const integration = integrations[pipeline.required_integration]
    return integration?.status === "VALID"
  }

  // Get pipelines for current tab
  const currentTabConfig = PIPELINE_TABS.find(t => t.id === activeTab)
  const tabPipelines = pipelines.filter(currentTabConfig?.filter || (() => true))

  // Count connected vs not connected for current tab
  const connectedCount = tabPipelines.filter(isPipelineConnected).length
  const notConnectedCount = tabPipelines.length - connectedCount

  // Calculate run statistics
  const runStats = {
    total: pipelineRuns.length,
    completed: pipelineRuns.filter(r => r.status === "COMPLETED").length,
    failed: pipelineRuns.filter(r => r.status === "FAILED" || r.status === "TIMEOUT").length,
    running: pipelineRuns.filter(r => r.status === "RUNNING" || r.status === "PENDING").length,
  }

  // Filter runs by current tab
  const getRunsForTab = (tabId: string) => {
    return pipelineRuns.filter(run => {
      const pipelineId = run.pipeline_id.toLowerCase()
      switch (tabId) {
        case "payg":
          return pipelineId.includes('payg') && !pipelineId.includes('unified')
        case "commitment":
          return pipelineId.includes('commitment')
        case "infrastructure":
          return pipelineId.includes('infrastructure')
        case "consolidation":
          return pipelineId.includes('unified') || pipelineId.includes('consolidat')
        default:
          return true
      }
    })
  }

  const tabRuns = getRunsForTab(activeTab)

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="h-4 w-96 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
        </div>
        <div className="flex items-center gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse"></div>
              <div>
                <div className="h-6 w-12 bg-slate-200 rounded animate-pulse"></div>
                <div className="h-3 w-16 bg-slate-100 rounded animate-pulse mt-1"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--cloudact-mint-dark)]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          GenAI Pipeline Runs
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Monitor your AI/ML cost pipeline executions across all providers
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-[#8B5CF6]" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.total}</p>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Total Runs</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-[var(--cloudact-mint-dark)]" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.completed}</p>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Completed</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-[var(--cloudact-coral)]" />
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
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              </div>
              <div>
                <p className="text-[24px] font-bold text-slate-900 leading-none">{runStats.running}</p>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Running</p>
              </div>
            </div>
          </>
        )}
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 bg-[var(--cloudact-coral)]/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-slate-900">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-slate-500">
                Complete organization onboarding to run pipelines.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="inline-flex items-center gap-2 h-11 px-4 bg-[var(--cloudact-mint)] text-black text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {lastResult && (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 ${lastResult.success ? 'bg-[var(--cloudact-mint)]/10' : 'bg-[var(--cloudact-coral)]/10'}`}>
          <div className="flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] flex-shrink-0" />
            )}
            <p className={`text-[15px] font-medium ${lastResult.success ? 'text-[#1a7a3a]' : 'text-[var(--cloudact-coral)]'}`}>
              {lastResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto pb-px">
          {PIPELINE_TABS.map((tab) => {
            const Icon = tab.icon
            const tabPipelineCount = pipelines.filter(tab.filter).length
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-[14px] font-medium whitespace-nowrap border-b-2 transition-all
                  ${isActive
                    ? 'border-[var(--cloudact-mint-dark)] text-[#1a7a3a] bg-[var(--cloudact-mint)]/5'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }
                `}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-[var(--cloudact-mint-dark)]' : ''}`} />
                {tab.label}
                <span className={`
                  inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold
                  ${isActive
                    ? 'bg-[var(--cloudact-mint)] text-[#1a7a3a]'
                    : 'bg-slate-100 text-slate-500'
                  }
                `}>
                  {tabPipelineCount}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Description */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 bg-[var(--cloudact-mint)]/5">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
          <p className="text-[15px] text-slate-900">
            {currentTabConfig?.description || "GenAI pipelines track API usage and costs from LLM providers."}
          </p>
        </div>
      </div>

      {/* Available Pipelines for Current Tab */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          {currentTabConfig?.label} Pipelines
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5EA]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentTabConfig && <currentTabConfig.icon className="h-[18px] w-[18px] text-[#1a7a3a]" />}
                <span className="text-[15px] font-semibold text-[#1a7a3a]">
                  {currentTabConfig?.label} - {currentTabConfig?.description}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[12px]">
                <span className="text-[#1a7a3a]">{connectedCount} connected</span>
                {notConnectedCount > 0 && (
                  <>
                    <span className="text-slate-300">&#8226;</span>
                    <span className="text-slate-500">{notConnectedCount} not connected</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Empty state */}
          {tabPipelines.length === 0 && (
            <div className="px-4 sm:px-6 py-12 text-center">
              <div className="space-y-4">
                <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                  <Plug className="h-12 w-12 text-[var(--cloudact-mint-dark)]" />
                </div>
                <h3 className="text-[20px] font-semibold text-black">No {currentTabConfig?.label.toLowerCase()} pipelines</h3>
                <p className="text-[15px] text-muted-foreground max-w-md mx-auto">
                  Connect an LLM provider to see available pipelines.
                </p>
                <Link href={`/${orgSlug}/integrations/genai`}>
                  <button className="inline-flex items-center gap-2 h-11 px-6 bg-[var(--cloudact-mint)] text-black text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] transition-colors shadow-sm">
                    <Brain className="h-4 w-4" />
                    Configure GenAI Providers
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* Desktop table view */}
          {tabPipelines.length > 0 && (
            <div className="overflow-x-auto">
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
                  {tabPipelines.map((pipeline) => {
                    const isRunning = runningPipeline === pipeline.id
                    const isConnected = isPipelineConnected(pipeline)

                    return (
                      <TableRow key={pipeline.id} className={`console-table-row ${!isConnected ? 'opacity-75' : ''}`}>
                        <TableCell className="console-table-cell">
                          <div className="space-y-0.5">
                            <div className="text-[15px] font-semibold text-slate-900">{pipeline.name}</div>
                            <div className="text-[13px] text-slate-500">{pipeline.description}</div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border">
                            {pipeline.pipeline}
                          </span>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20">
                              <CheckCircle2 className="h-3 w-3" />
                              Connected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                              <AlertCircle className="h-3 w-3" />
                              Not Connected
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          {isConnected ? (
                            <button
                              onClick={() => handleRun(pipeline.id)}
                              disabled={isRunning}
                              className="inline-flex items-center gap-2 h-11 px-4 bg-[var(--cloudact-mint)] text-black text-[15px] font-semibold rounded-xl hover:bg-[var(--cloudact-mint-dark)] disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md"
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
                          ) : (
                            <Link href={`/${orgSlug}/integrations/genai`}>
                              <button className="inline-flex items-center gap-2 h-11 px-4 bg-slate-100 text-slate-600 text-[15px] font-semibold rounded-xl hover:bg-slate-200 transition-all touch-manipulation">
                                <Plug className="h-4 w-4" />
                                Connect
                              </button>
                            </Link>
                          )}
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

      {/* Run History for Current Tab */}
      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
                {currentTabConfig?.label} Run History
              </h2>
              {tabRuns.length > 0 && (
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-[var(--cloudact-mint)]"></div>
                    <span className="text-[13px] text-slate-500">
                      {tabRuns.filter(r => r.status === "COMPLETED").length} completed
                    </span>
                  </div>
                  {tabRuns.filter(r => r.status === "FAILED" || r.status === "TIMEOUT").length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-[var(--cloudact-coral)]"></div>
                      <span className="text-[13px] text-slate-500">
                        {tabRuns.filter(r => r.status === "FAILED" || r.status === "TIMEOUT").length} failed
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-[var(--cloudact-mint)]/5 text-muted-foreground text-[15px] font-medium rounded-xl hover:bg-[var(--cloudact-mint)]/10 disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-50 transition-colors touch-manipulation border border-border"
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
            {runsLoading && tabRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--cloudact-mint-dark)]" />
              </div>
            )}

            {/* Empty state */}
            {!runsLoading && tabRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                    <History className="h-10 w-10 text-[var(--cloudact-mint-dark)]" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-slate-900">No {currentTabConfig?.label.toLowerCase()} runs yet</h3>
                  <p className="text-[15px] text-slate-500">Run a pipeline to see history</p>
                </div>
              </div>
            )}

            {/* Desktop table view */}
            {tabRuns.length > 0 && (
              <div className="overflow-x-auto">
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
                    {tabRuns.map((run) => {
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
                              <div className="text-[13px] text-slate-900">{formatDateTime(run.start_time)}</div>
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
                                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 bg-[var(--cloudact-coral)]/10 border-l-4 border-[var(--cloudact-coral)]">
                                        <div className="flex items-start gap-3">
                                          <XCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
                                          <div className="flex-1">
                                            <p className="text-[15px] font-semibold text-slate-900">Error Details</p>
                                            <p className="text-[13px] text-slate-500 mt-1 font-mono">{run.error_message}</p>
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
                                            <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
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
