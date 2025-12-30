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
  TrendingUp,
  Activity,
  Zap,
  ArrowRight,
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

interface QuickStats {
  runsToday: number
  successRate: number
  avgDuration: number
  totalRuns: number
}

// ============================================
// Progress Ring Component
// ============================================

function ProgressRing({ progress, size = 60, strokeWidth = 4, color = "var(--cloudact-mint)" }: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="var(--cloudact-border)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500 ease-out"
      />
    </svg>
  )
}

// ============================================
// Animated Flow Visualization Component
// ============================================

function AnimatedPipelineFlow() {
  return (
    <div className="relative w-full h-32 bg-gradient-to-br from-[var(--cloudact-mint)]/5 via-[var(--cloudact-mint-light)] to-[var(--cloudact-coral)]/5 rounded-2xl overflow-hidden border border-[var(--cloudact-mint)]/10">
      <div className="absolute inset-0 flex items-center justify-between px-8">
        {/* Source */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-[var(--cloudact-mint)] flex items-center justify-center shadow-lg">
            <Cloud className="h-6 w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <span className="text-[11px] font-semibold text-[var(--cloudact-mint-text)]">Source</span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-4">
          <div className="absolute inset-0 bg-[var(--cloudact-mint)]/20 rounded-full"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--cloudact-mint)] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite]"></div>
        </div>

        {/* Processing */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center shadow-lg animate-pulse">
            <Activity className="h-6 w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <span className="text-[11px] font-semibold text-[var(--cloudact-mint-text)]">Process</span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-4">
          <div className="absolute inset-0 bg-[var(--cloudact-coral)]/20 rounded-full"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--cloudact-coral)] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite_0.5s]"></div>
        </div>

        {/* Destination */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-[var(--cloudact-coral)] flex items-center justify-center shadow-lg">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-[var(--cloudact-coral)]">Analytics</span>
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

  // Quick stats
  const [quickStats, setQuickStats] = useState<QuickStats>({
    runsToday: 0,
    successRate: 0,
    avgDuration: 0,
    totalRuns: 0,
  })

  // Run history limit - show latest 100 runs
  const MAX_RUNS = 100

  // Calculate quick stats from pipeline runs
  const calculateQuickStats = useCallback((runs: PipelineRunSummary[]) => {
    if (runs.length === 0) {
      setQuickStats({ runsToday: 0, successRate: 0, avgDuration: 0, totalRuns: 0 })
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const runsToday = runs.filter(run => {
      if (!run.start_time) return false
      const runDate = new Date(run.start_time)
      runDate.setHours(0, 0, 0, 0)
      return runDate.getTime() === today.getTime()
    }).length

    const completedRuns = runs.filter(r => r.status === "COMPLETED" || r.status === "FAILED")
    const successfulRuns = runs.filter(r => r.status === "COMPLETED")
    const successRate = completedRuns.length > 0
      ? Math.round((successfulRuns.length / completedRuns.length) * 100)
      : 0

    const runsWithDuration = runs.filter(r => r.duration_ms !== null && r.duration_ms !== undefined)
    const avgDuration = runsWithDuration.length > 0
      ? Math.round(runsWithDuration.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / runsWithDuration.length)
      : 0

    setQuickStats({
      runsToday,
      successRate,
      avgDuration,
      totalRuns: runs.length,
    })
  }, [])

  // Load pipeline runs (latest 100)
  const loadPipelineRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const result = await getPipelineRuns(orgSlug, { limit: MAX_RUNS })
      if (result.success && result.data) {
        setPipelineRuns(result.data.runs)
        calculateQuickStats(result.data.runs)
      } else if (!result.success) {
        // Log the error for debugging - silent failures are hard to diagnose
        console.warn("[Pipelines] Failed to load pipeline runs:", result.error)
      }
    } catch (err) {
      // Log the error for debugging
      console.warn("[Pipelines] Error loading pipeline runs:", err)
    }
    setRunsLoading(false)
  }, [orgSlug, calculateQuickStats])

  // Load pipelines, integrations, and backend status
  const loadData = useCallback(async () => {
    setIsLoading(true)

    // Check backend connection status and fetch pipelines
    const [onboardingStatus, apiKeyResult, pipelinesResult] = await Promise.all([
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
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
        } else if (!result.success) {
          console.warn("[Pipelines] Failed to load run details:", result.error)
        }
      } catch (err) {
        console.warn("[Pipelines] Error loading run details:", err)
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
      const dateStr = yesterday.toISOString().split("T")[0]

      // Pass both date and start_date for compatibility with all pipeline types
      // GCP/SaaS pipelines use 'date', GenAI pipelines use 'start_date'
      const result = await runPipeline(orgSlug, pipelineId, { date: dateStr, start_date: dateStr })
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
    setTimeout(() => {
      loadPipelineRuns().catch((err) => {
        console.warn("[Pipelines] Error refreshing runs after execution:", err)
      })
    }, 2000)
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

  // Helper: Get status color - CloudAct Standards
  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "bg-[var(--cloudact-mint-light)] text-[var(--cloudact-mint-text)] border border-[var(--cloudact-mint)]/10"
      case "FAILED":
      case "TIMEOUT":
        return "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/10"
      case "RUNNING":
      case "PENDING":
      case "CANCELLING":
        return "bg-[var(--cloudact-mint)]/5 text-[var(--cloudact-mint-text)] border border-[var(--cloudact-mint)]/10"
      case "CANCELLED":
        return "bg-amber-100 text-amber-700 border border-amber-200"
      case "SKIPPED":
        return "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border"
      default:
        return "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border"
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading pipelines...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header Section */}
      <div className="mb-6 sm:mb-10 px-4 sm:px-0">
        <h1 className="text-[24px] sm:text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Pipelines
        </h1>
        <p className="text-[13px] sm:text-[15px] text-slate-500 mt-1.5 sm:mt-2 max-w-lg">
          Run data pipelines to fetch your cloud data
        </p>
      </div>

      {/* Animated Hero - Pipeline Flow Visualization */}
      <div className="animate-fade-in">
        <AnimatedPipelineFlow />
      </div>

      {/* Quick Stats Row */}
      {backendConnected && hasApiKey && pipelineRuns.length > 0 && (
        <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-8 overflow-x-auto pb-2 px-4 sm:px-0 scrollbar-hide">
          {/* Runs Today */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--cloudact-mint-dark)]" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{quickStats.runsToday}</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Today</p>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>

          {/* Success Rate */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--cloudact-mint-dark)]" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{quickStats.successRate}%</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Success</p>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>

          {/* Avg Duration */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--cloudact-coral)]" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{formatDuration(quickStats.avgDuration)}</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Avg Time</p>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>

          {/* Total Runs */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <History className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--cloudact-mint-dark)]" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{quickStats.totalRuns}</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Total</p>
            </div>
          </div>
        </div>
      )}

      {/* Backend Connection Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-coral)]/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-slate-900">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-slate-600">
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
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="h-10 px-5 bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)] text-[13px] font-semibold rounded-xl inline-flex items-center gap-2 transition-colors">
                  <Cloud className="h-4 w-4" />
                  Go to Organization Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Info Alert */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-mint)]/5 p-4">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
          <p className="text-[15px] text-slate-900">
            Pipelines run daily automatically. Use "Run Now" for manual runs or backfills.
          </p>
        </div>
      </div>

      {/* Result Alert */}
      {lastResult && (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 ${lastResult.success ? 'bg-[var(--cloudact-mint)]/10' : 'bg-[var(--cloudact-coral)]/10'}`}>
          <div className="flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--cloudact-mint-dark)] flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] flex-shrink-0" />
            )}
            <p className={`text-[15px] font-medium ${lastResult.success ? 'text-[var(--cloudact-mint-text)]' : 'text-[var(--cloudact-coral)]'}`}>
              {lastResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Pipelines Cards - Enhanced Design */}
      {(() => {
        // Filter pipelines to only show those with connected integrations
        const connectedPipelines = pipelines.filter((pipeline) => {
          if (!pipeline.required_integration || pipeline.required_integration === "") {
            return true
          }
          const integration = integrations[pipeline.required_integration]
          return integration?.status === "VALID"
        })

        return (
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
              Available Pipelines
            </h2>

            {/* Empty state */}
            {connectedPipelines.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 text-center">
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                    <Plug className="h-12 w-12 text-[var(--cloudact-mint-dark)]" />
                  </div>
                  <h3 className="text-[20px] font-semibold text-slate-900">No pipelines available</h3>
                  <p className="text-[15px] text-slate-600 max-w-md mx-auto">
                    Connect a provider to see available pipelines.
                  </p>
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <button className="h-10 px-5 bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)] text-[13px] font-semibold rounded-xl inline-flex items-center gap-2 transition-colors shadow-sm">
                      <Plug className="h-4 w-4" />
                      Add New Provider
                    </button>
                  </Link>
                </div>
              </div>
            )}

            {/* Pipeline Cards Grid - Mobile and Desktop */}
            {connectedPipelines.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {connectedPipelines.map((pipeline) => {
                  const isRunning = runningPipeline === pipeline.id

                  return (
                    <div
                      key={pipeline.id}
                      className="group relative"
                    >
                      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[var(--cloudact-mint)] opacity-60 group-hover:opacity-100 transition-opacity" />
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm pl-5 py-5 pr-5 hover:shadow-md transition-shadow">
                        <div className="space-y-4">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[17px] font-bold text-slate-900 mb-1">{pipeline.name}</h3>
                              <p className="text-[13px] text-slate-600">{pipeline.description}</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20 flex-shrink-0">
                              <CheckCircle2 className="h-3 w-3" />
                              {!pipeline.required_integration || pipeline.required_integration === "" ? "Ready" : "Connected"}
                            </span>
                          </div>

                          {/* Tags */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {pipeline.provider}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {pipeline.domain}
                            </span>
                            {pipeline.schedule && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--cloudact-coral)]/5 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/10">
                                <Clock className="h-3 w-3" />
                                {pipeline.schedule}
                              </span>
                            )}
                          </div>

                          {/* Action Button */}
                          <button
                            onClick={() => handleRun(pipeline.id)}
                            disabled={isRunning}
                            className="w-full h-10 px-5 bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)] text-[13px] font-semibold rounded-xl disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
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
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Run History Section */}
      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Run History</h2>
              <p className="text-[13px] text-slate-500 mt-1">Recent pipeline executions</p>
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="h-9 px-4 text-[13px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:text-slate-400 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
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
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium">Loading pipeline runs...</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-2">
                    <History className="h-10 w-10 text-[var(--cloudact-mint-dark)]" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-slate-900">No pipeline runs yet</h3>
                  <p className="text-[15px] text-slate-600">Run a pipeline to see history</p>
                </div>
              </div>
            )}

            {/* Mobile Timeline View */}
            {pipelineRuns.length > 0 && (
              <div className="md:hidden divide-y divide-[#E5E5EA]">
                {pipelineRuns.map((run, index) => {
                  const isExpanded = expandedRun === run.pipeline_logging_id
                  const detail = runDetails[run.pipeline_logging_id]
                  const isLoadingThisDetail = loadingDetail === run.pipeline_logging_id

                  return (
                    <div key={run.pipeline_logging_id} className="relative">
                      {/* Timeline connector */}
                      {index < pipelineRuns.length - 1 && (
                        <div className="absolute left-9 top-16 bottom-0 w-0.5 bg-[var(--cloudact-border)]"></div>
                      )}

                      <button
                        className="w-full p-4 text-left touch-manipulation hover:bg-[var(--cloudact-mint)]/5 transition-colors relative"
                        onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Timeline dot with status */}
                          <div className="relative flex-shrink-0 z-10">
                            {run.status === "COMPLETED" ? (
                              <div className="w-8 h-8 rounded-full bg-[var(--cloudact-mint)] flex items-center justify-center shadow-md">
                                <CheckCircle2 className="h-4 w-4 text-white" />
                              </div>
                            ) : run.status === "FAILED" ? (
                              <div className="w-8 h-8 rounded-full bg-[var(--cloudact-coral)] flex items-center justify-center shadow-md">
                                <XCircle className="h-4 w-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[var(--cloudact-mint)]/20 flex items-center justify-center shadow-md">
                                <Loader2 className="h-4 w-4 text-[var(--cloudact-mint-dark)] animate-spin" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <div className="text-[15px] font-semibold text-slate-900 truncate">{run.pipeline_id}</div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {run.pipeline_logging_id.slice(0, 8)}...
                                </div>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[#C7C7CC] flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[#C7C7CC] flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-600">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(run.duration_ms)}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200">
                                {run.trigger_type}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              {formatDateTime(run.start_time)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 bg-[var(--cloudact-mint)]/5 ml-11">
                          {isLoadingThisDetail ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              {(run.error_message || run.error_context) && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-coral)]/10 p-4">
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[15px] font-semibold text-slate-900">Error</p>
                                        {run.error_context?.error_type && (
                                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                            run.error_context.error_type === 'TRANSIENT' ? 'bg-amber-100 text-amber-700' :
                                            run.error_context.error_type === 'TIMEOUT' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                          }`}>
                                            {run.error_context.error_type}
                                          </span>
                                        )}
                                        {run.error_context?.is_retryable && (
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                            Retryable
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[13px] text-slate-600 mt-1 break-words">{run.error_message}</p>
                                      {run.error_context?.suggested_action && (
                                        <p className="text-[12px] text-[#1a7a3a] mt-2 font-medium">
                                          Suggestion: {run.error_context.suggested_action}
                                        </p>
                                      )}
                                      {run.error_context?.retry_count !== undefined && run.error_context.retry_count > 0 && (
                                        <p className="text-[11px] text-slate-500 mt-1">
                                          Retry attempts: {run.error_context.retry_count}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                <h4 className="text-[15px] font-semibold text-slate-900">Steps</h4>
                                {detail.steps.length === 0 ? (
                                  <p className="text-center text-slate-500 text-[13px] py-4">No step logs available</p>
                                ) : (
                                  <div className="space-y-2">
                                    {detail.steps.map((step) => (
                                      <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[13px] font-medium text-slate-900 flex-shrink-0">#{step.step_index}</span>
                                            <span className="text-[13px] font-semibold text-slate-900 truncate">{step.step_name}</span>
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full flex-shrink-0 ${getStatusColor(step.status)}`}>
                                            {step.status}
                                          </span>
                                        </div>
                                        <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-600">
                                          <span className="bg-slate-100 px-2 py-0.5 rounded-full font-mono border border-slate-200">{step.step_type}</span>
                                          <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatDuration(step.duration_ms)}
                                          </span>
                                          {step.rows_processed !== null && step.rows_processed !== undefined && (
                                            <span>Rows: {step.rows_processed.toLocaleString()}</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {detail.steps.filter(s => s.error_message).map((step) => (
                                <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-coral)]/10 p-4">
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-[15px] font-semibold text-slate-900">{step.step_name} Error</p>
                                      <p className="text-[13px] text-slate-600 mt-1 break-words">{step.error_message}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
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
                    <TableRow className="border-b border-[var(--cloudact-border)]">
                      <TableHead className="console-table-header w-10"></TableHead>
                      <TableHead className="console-table-header">Pipeline</TableHead>
                      <TableHead className="console-table-header">Status</TableHead>
                      <TableHead className="console-table-header">Started</TableHead>
                      <TableHead className="console-table-header">Duration</TableHead>
                      <TableHead className="console-table-header">Trigger</TableHead>
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
                                {run.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3" />}
                                {run.status === "FAILED" && <XCircle className="h-3 w-3" />}
                                {(run.status === "RUNNING" || run.status === "PENDING") && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                {run.status}
                              </span>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="text-[13px] text-slate-900">{formatDateTime(run.start_time)}</div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="flex items-center gap-1 text-[13px] text-slate-900">
                                <Clock className="h-3 w-3 text-slate-500" />
                                {formatDuration(run.duration_ms)}
                              </div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {run.trigger_type}
                              </span>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-[var(--cloudact-mint)]/5">
                              <TableCell colSpan={6} className="px-4 sm:px-6 py-6">
                                {isLoadingThisDetail ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)]" />
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-4">
                                    {(run.error_message || run.error_context) && (
                                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-coral)]/10 p-4">
                                        <div className="flex items-start gap-3">
                                          <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-[15px] font-semibold text-slate-900">Error</p>
                                              {run.error_context?.error_type && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                                  run.error_context.error_type === 'TRANSIENT' ? 'bg-amber-100 text-amber-700' :
                                                  run.error_context.error_type === 'TIMEOUT' ? 'bg-orange-100 text-orange-700' :
                                                  'bg-red-100 text-red-700'
                                                }`}>
                                                  {run.error_context.error_type}
                                                </span>
                                              )}
                                              {run.error_context?.is_retryable && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                  Retryable
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-[13px] text-slate-600 mt-1">{run.error_message}</p>
                                            {run.error_context?.suggested_action && (
                                              <p className="text-[12px] text-[#1a7a3a] mt-2 font-medium">
                                                Suggestion: {run.error_context.suggested_action}
                                              </p>
                                            )}
                                            {run.error_context?.retry_count !== undefined && run.error_context.retry_count > 0 && (
                                              <p className="text-[11px] text-slate-500 mt-1">
                                                Retry attempts: {run.error_context.retry_count}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <h4 className="text-[15px] font-semibold text-slate-900">Steps</h4>
                                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="border-b border-slate-200">
                                              <TableHead className="console-table-header">#</TableHead>
                                              <TableHead className="console-table-header">Step</TableHead>
                                              <TableHead className="console-table-header">Type</TableHead>
                                              <TableHead className="console-table-header">Status</TableHead>
                                              <TableHead className="console-table-header">Duration</TableHead>
                                              <TableHead className="console-table-header">Rows</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {detail.steps.length === 0 ? (
                                              <TableRow>
                                                <TableCell colSpan={6} className="text-center text-slate-500 text-[13px] py-6">
                                                  No step logs available
                                                </TableCell>
                                              </TableRow>
                                            ) : (
                                              detail.steps.map((step) => (
                                                <TableRow key={step.step_logging_id} className="console-table-row">
                                                  <TableCell className="console-table-cell text-[13px] font-medium text-slate-900">{step.step_index}</TableCell>
                                                  <TableCell className="console-table-cell text-[13px] font-semibold text-slate-900">{step.step_name}</TableCell>
                                                  <TableCell className="console-table-cell">
                                                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-mono border border-slate-200">{step.step_type}</span>
                                                  </TableCell>
                                                  <TableCell className="console-table-cell">
                                                    <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full ${getStatusColor(step.status)}`}>
                                                      {step.status}
                                                    </span>
                                                  </TableCell>
                                                  <TableCell className="console-table-cell text-[13px] text-slate-900">{formatDuration(step.duration_ms)}</TableCell>
                                                  <TableCell className="console-table-cell text-[13px] text-slate-900">
                                                    {step.rows_processed !== null && step.rows_processed !== undefined
                                                      ? step.rows_processed.toLocaleString()
                                                      : <span className="text-slate-400">N/A</span>}
                                                  </TableCell>
                                                </TableRow>
                                              ))
                                            )}
                                          </TableBody>
                                        </Table>
                                      </div>

                                      {detail.steps.filter(s => s.error_message).map((step) => (
                                        <div key={step.step_logging_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm bg-[var(--cloudact-coral)]/10 p-4">
                                          <div className="flex items-start gap-3">
                                            <AlertCircle className="h-5 w-5 text-[var(--cloudact-coral)] mt-0.5 flex-shrink-0" />
                                            <div>
                                              <p className="text-[15px] font-semibold text-slate-900">{step.step_name} Error</p>
                                              <p className="text-[13px] text-slate-600 mt-1">{step.error_message}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
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

      {/* Coming Soon */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center">
        <p className="text-[13px] text-slate-500 font-medium">
          More pipelines coming soon: AWS Cost Explorer, Azure, LLM Usage Analytics
        </p>
      </div>
    </div>
  )
}
