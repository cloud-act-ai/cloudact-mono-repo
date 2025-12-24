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

function ProgressRing({ progress, size = 60, strokeWidth = 4, color = "#007A78" }: {
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
        stroke="#E5E5EA"
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
    <div className="relative w-full h-32 bg-gradient-to-br from-[#007A78]/5 via-[#F0FDFA] to-[#FF6E50]/5 rounded-2xl overflow-hidden border border-[#007A78]/10">
      <div className="absolute inset-0 flex items-center justify-between px-8">
        {/* Source */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-[#007A78] flex items-center justify-center shadow-lg">
            <Cloud className="h-6 w-6 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-[#007A78]">Source</span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-4">
          <div className="absolute inset-0 bg-[#007A78]/20 rounded-full"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#007A78] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite]"></div>
        </div>

        {/* Processing */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center shadow-lg animate-pulse">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-[#007A78]">Process</span>
        </div>

        {/* Animated Flow Lines */}
        <div className="flex-1 relative h-1 mx-4">
          <div className="absolute inset-0 bg-[#FF6E50]/20 rounded-full"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#FF6E50] to-transparent rounded-full animate-[flow_2s_ease-in-out_infinite_0.5s]"></div>
        </div>

        {/* Destination */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-[#FF6E50] flex items-center justify-center shadow-lg">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-[#FF6E50]">Analytics</span>
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
      }
    } catch {
      // Pipeline runs load failure handled silently - will retry on next poll
    }
    setRunsLoading(false)
  }, [orgSlug, calculateQuickStats])

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
      } catch {
        // Run details load failure handled silently
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
    setTimeout(() => {
      loadPipelineRuns().catch(() => {
        // Silently handle refresh errors
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
        return "bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10"
      case "FAILED":
      case "TIMEOUT":
        return "bg-[#FF6E50]/10 text-[#FF6E50] border border-[#FF6E50]/10"
      case "RUNNING":
      case "PENDING":
      case "CANCELLING":
        return "bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/10"
      case "CANCELLED":
        return "bg-amber-100 text-amber-700 border border-amber-200"
      case "SKIPPED":
        return "bg-[#007A78]/5 text-muted-foreground border border-border"
      default:
        return "bg-[#007A78]/5 text-muted-foreground border border-border"
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Section - Apple Health Style */}
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Pipelines</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Run data pipelines to fetch your cloud data.
        </p>
      </div>

      {/* Animated Hero - Pipeline Flow Visualization */}
      <div className="animate-fade-in">
        <AnimatedPipelineFlow />
      </div>

      {/* Quick Stats Dashboard */}
      {backendConnected && hasApiKey && pipelineRuns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up">
          {/* Runs Today */}
          <div className="health-card p-4 sm:p-5 relative overflow-hidden group hover:shadow-premium-md transition-all">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#007A78]/5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <Clock className="h-5 w-5 text-[#007A78]" />
                <div className="text-[24px] sm:text-[28px] font-bold text-[#007A78]">
                  {quickStats.runsToday}
                </div>
              </div>
              <p className="text-[13px] font-semibold text-black">Runs Today</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Last 24 hours</p>
            </div>
          </div>

          {/* Success Rate */}
          <div className="health-card p-4 sm:p-5 relative overflow-hidden group hover:shadow-premium-md transition-all">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#007A78]/5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="relative">
                  <ProgressRing progress={quickStats.successRate} size={48} strokeWidth={4} color="#007A78" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-bold text-[#007A78]">{quickStats.successRate}%</span>
                  </div>
                </div>
                <TrendingUp className="h-5 w-5 text-[#007A78]" />
              </div>
              <p className="text-[13px] font-semibold text-black">Success Rate</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">All completed runs</p>
            </div>
          </div>

          {/* Avg Duration */}
          <div className="health-card p-4 sm:p-5 relative overflow-hidden group hover:shadow-premium-md transition-all">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF6E50]/5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <Activity className="h-5 w-5 text-[#FF6E50]" />
                <div className="text-[24px] sm:text-[28px] font-bold text-[#FF6E50]">
                  {formatDuration(quickStats.avgDuration)}
                </div>
              </div>
              <p className="text-[13px] font-semibold text-black">Avg Duration</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Execution time</p>
            </div>
          </div>

          {/* Total Runs */}
          <div className="health-card p-4 sm:p-5 relative overflow-hidden group hover:shadow-premium-md transition-all">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#007A78]/5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <History className="h-5 w-5 text-[#007A78]" />
                <div className="text-[24px] sm:text-[28px] font-bold text-black">
                  {quickStats.totalRuns}
                </div>
              </div>
              <p className="text-[13px] font-semibold text-black">Total Runs</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Last {MAX_RUNS} records</p>
            </div>
          </div>
        </div>
      )}

      {/* Backend Connection Warning - Apple Health Style */}
      {(!backendConnected || !hasApiKey) && (
        <div className="health-card bg-[#FF6E50]/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-muted-foreground">
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
                <button className="inline-flex items-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors">
                  <Cloud className="h-4 w-4" />
                  Go to Organization Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Info Alert - Apple Health Style */}
      <div className="health-card bg-[#007A78]/5 p-4 border border-border">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-[#007A78] flex-shrink-0" />
          <p className="text-[15px] text-black">
            Pipelines run daily automatically. Use "Run Now" for manual runs or backfills.
          </p>
        </div>
      </div>

      {/* Result Alert - Apple Health Style */}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[22px] font-bold text-black">Available Pipelines</h2>
              <span className="text-[13px] text-muted-foreground font-medium">
                {connectedPipelines.length} pipeline{connectedPipelines.length !== 1 ? 's' : ''} ready
              </span>
            </div>

            {/* Empty state */}
            {connectedPipelines.length === 0 && (
              <div className="health-card p-8 sm:p-12 text-center">
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-2">
                    <Plug className="h-12 w-12 text-[#007A78]" />
                  </div>
                  <h3 className="text-[20px] font-semibold text-black">No pipelines available</h3>
                  <p className="text-[15px] text-muted-foreground max-w-md mx-auto">
                    Connect a provider to see available pipelines.
                  </p>
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <button className="inline-flex items-center gap-2 h-11 px-6 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors shadow-sm">
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
                      className="health-card p-5 sm:p-6 group hover:shadow-premium-md transition-all relative overflow-hidden"
                    >
                      {/* Background Gradient */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#007A78]/5 to-transparent rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>

                      <div className="relative space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-[#007A78] animate-pulse"></div>
                              <h3 className="text-[17px] font-bold text-black">{pipeline.name}</h3>
                            </div>
                            <p className="text-[13px] text-muted-foreground">{pipeline.description}</p>
                          </div>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10 flex-shrink-0">
                            <CheckCircle2 className="h-3 w-3" />
                            {!pipeline.required_integration || pipeline.required_integration === "" ? "Ready" : "Connected"}
                          </span>
                        </div>

                        {/* Tags */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#007A78]/5 text-muted-foreground border border-border">
                            {pipeline.provider}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#007A78]/5 text-muted-foreground border border-border">
                            {pipeline.domain}
                          </span>
                          {pipeline.schedule && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FF6E50]/5 text-[#FF6E50] border border-[#FF6E50]/10">
                              <Clock className="h-3 w-3" />
                              {pipeline.schedule}
                            </span>
                          )}
                        </div>

                        {/* Action Button */}
                        <button
                          onClick={() => handleRun(pipeline.id)}
                          disabled={isRunning}
                          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-70 transition-all touch-manipulation shadow-sm hover:shadow-md group"
                        >
                          {isRunning ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Running...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 group-hover:scale-110 transition-transform" />
                              Run Now
                              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Run History Section - Timeline Visualization */}
      {backendConnected && hasApiKey && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold text-black">Run History</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Recent pipeline executions</p>
            </div>
            <button
              onClick={loadPipelineRuns}
              disabled={runsLoading}
              className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#007A78]/5 text-muted-foreground text-[15px] font-medium rounded-xl hover:bg-[#007A78]/10 disabled:text-[#C7C7CC] disabled:cursor-not-allowed disabled:opacity-50 transition-colors touch-manipulation border border-border"
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
            {/* Loading state */}
            {runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#007A78]" />
              </div>
            )}

            {/* Empty state */}
            {!runsLoading && pipelineRuns.length === 0 && (
              <div className="px-4 sm:px-6 py-12 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 rounded-2xl bg-[#8E8E93]/10 mb-2">
                    <History className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-black">No pipeline runs yet</h3>
                  <p className="text-[15px] text-muted-foreground">Run a pipeline to see history</p>
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
                        <div className="absolute left-9 top-16 bottom-0 w-0.5 bg-[#E5E5EA]"></div>
                      )}

                      <button
                        className="w-full p-4 text-left touch-manipulation hover:bg-[#007A78]/5 transition-colors relative"
                        onClick={() => toggleRunExpansion(run.pipeline_logging_id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Timeline dot with status */}
                          <div className="relative flex-shrink-0 z-10">
                            {run.status === "COMPLETED" ? (
                              <div className="w-8 h-8 rounded-full bg-[#007A78] flex items-center justify-center shadow-md">
                                <CheckCircle2 className="h-4 w-4 text-white" />
                              </div>
                            ) : run.status === "FAILED" ? (
                              <div className="w-8 h-8 rounded-full bg-[#FF6E50] flex items-center justify-center shadow-md">
                                <XCircle className="h-4 w-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#007A78]/20 flex items-center justify-center shadow-md">
                                <Loader2 className="h-4 w-4 text-[#007A78] animate-spin" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <div className="text-[15px] font-semibold text-black truncate">{run.pipeline_id}</div>
                                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                  {run.pipeline_logging_id.slice(0, 8)}...
                                </div>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[#C7C7CC] flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[#C7C7CC] flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(run.duration_ms)}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#007A78]/5 border border-border">
                                {run.trigger_type}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {formatDateTime(run.start_time)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 bg-[#007A78]/5 ml-11">
                          {isLoadingThisDetail ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              {(run.error_message || run.error_context) && (
                                <div className="health-card bg-[#FF6E50]/10 p-4">
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[15px] font-semibold text-black">Error</p>
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
                                      <p className="text-[13px] text-muted-foreground mt-1 break-words">{run.error_message}</p>
                                      {run.error_context?.suggested_action && (
                                        <p className="text-[12px] text-[#007A78] mt-2 font-medium">
                                          Suggestion: {run.error_context.suggested_action}
                                        </p>
                                      )}
                                      {run.error_context?.retry_count !== undefined && run.error_context.retry_count > 0 && (
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                          Retry attempts: {run.error_context.retry_count}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                <h4 className="text-[15px] font-semibold text-black">Steps</h4>
                                {detail.steps.length === 0 ? (
                                  <p className="text-center text-muted-foreground text-[13px] py-4">No step logs available</p>
                                ) : (
                                  <div className="space-y-2">
                                    {detail.steps.map((step) => (
                                      <div key={step.step_logging_id} className="health-card p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[13px] font-medium text-black flex-shrink-0">#{step.step_index}</span>
                                            <span className="text-[13px] font-semibold text-black truncate">{step.step_name}</span>
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full flex-shrink-0 ${getStatusColor(step.status)}`}>
                                            {step.status}
                                          </span>
                                        </div>
                                        <div className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground">
                                          <span className="bg-[#007A78]/5 px-2 py-0.5 rounded-full font-mono border border-border">{step.step_type}</span>
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
                                <div key={step.step_logging_id} className="health-card bg-[#FF6E50]/10 p-4">
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-[15px] font-semibold text-black">{step.step_name} Error</p>
                                      <p className="text-[13px] text-muted-foreground mt-1 break-words">{step.error_message}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-muted-foreground text-[13px] py-6">
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
                            className="console-table-row cursor-pointer touch-manipulation hover:bg-[#007A78]/5 transition-colors"
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
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
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
                              <div className="text-[13px] text-black">{formatDateTime(run.start_time)}</div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <div className="flex items-center gap-1 text-[13px] text-black">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                {formatDuration(run.duration_ms)}
                              </div>
                            </TableCell>
                            <TableCell className="console-table-cell">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#007A78]/5 text-muted-foreground border border-border">
                                {run.trigger_type}
                              </span>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-[#007A78]/5">
                              <TableCell colSpan={6} className="px-4 sm:px-6 py-6">
                                {isLoadingThisDetail ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-4">
                                    {(run.error_message || run.error_context) && (
                                      <div className="health-card bg-[#FF6E50]/10 p-4">
                                        <div className="flex items-start gap-3">
                                          <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-[15px] font-semibold text-black">Error</p>
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
                                            <p className="text-[13px] text-muted-foreground mt-1">{run.error_message}</p>
                                            {run.error_context?.suggested_action && (
                                              <p className="text-[12px] text-[#007A78] mt-2 font-medium">
                                                Suggestion: {run.error_context.suggested_action}
                                              </p>
                                            )}
                                            {run.error_context?.retry_count !== undefined && run.error_context.retry_count > 0 && (
                                              <p className="text-[11px] text-muted-foreground mt-1">
                                                Retry attempts: {run.error_context.retry_count}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <h4 className="text-[15px] font-semibold text-black">Steps</h4>
                                      <div className="health-card p-0 overflow-hidden">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="border-b border-[#E5E5EA]">
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
                                                <TableCell colSpan={6} className="text-center text-muted-foreground text-[13px] py-6">
                                                  No step logs available
                                                </TableCell>
                                              </TableRow>
                                            ) : (
                                              detail.steps.map((step) => (
                                                <TableRow key={step.step_logging_id} className="console-table-row">
                                                  <TableCell className="console-table-cell text-[13px] font-medium text-black">{step.step_index}</TableCell>
                                                  <TableCell className="console-table-cell text-[13px] font-semibold text-black">{step.step_name}</TableCell>
                                                  <TableCell className="console-table-cell">
                                                    <span className="text-[11px] bg-[#007A78]/5 text-muted-foreground px-2 py-1 rounded-full font-mono border border-border">{step.step_type}</span>
                                                  </TableCell>
                                                  <TableCell className="console-table-cell">
                                                    <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full ${getStatusColor(step.status)}`}>
                                                      {step.status}
                                                    </span>
                                                  </TableCell>
                                                  <TableCell className="console-table-cell text-[13px] text-black">{formatDuration(step.duration_ms)}</TableCell>
                                                  <TableCell className="console-table-cell text-[13px] text-black">
                                                    {step.rows_processed !== null && step.rows_processed !== undefined
                                                      ? step.rows_processed.toLocaleString()
                                                      : <span className="text-[#C7C7CC]">N/A</span>}
                                                  </TableCell>
                                                </TableRow>
                                              ))
                                            )}
                                          </TableBody>
                                        </Table>
                                      </div>

                                      {detail.steps.filter(s => s.error_message).map((step) => (
                                        <div key={step.step_logging_id} className="health-card bg-[#FF6E50]/10 p-4">
                                          <div className="flex items-start gap-3">
                                            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
                                            <div>
                                              <p className="text-[15px] font-semibold text-black">{step.step_name} Error</p>
                                              <p className="text-[13px] text-muted-foreground mt-1">{step.error_message}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center text-muted-foreground text-[13px] py-6">
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

      {/* Coming Soon - Apple Health Style */}
      <div className="health-card p-6 sm:p-8 text-center border border-border">
        <p className="text-[13px] text-muted-foreground font-medium">
          More pipelines coming soon: AWS Cost Explorer, Azure, LLM Usage Analytics
        </p>
      </div>
    </div>
  )
}
