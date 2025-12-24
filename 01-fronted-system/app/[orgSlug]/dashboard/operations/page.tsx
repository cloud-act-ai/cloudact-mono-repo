import Link from "next/link"
import {
  Activity,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Database,
  Cloud,
  Brain,
  ChevronRight,
  BarChart3,
  Timer,
  GitBranch
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export default async function OperationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // Mock data for demonstration - will be replaced with real data
  const pipelineStats = {
    total: 156,
    running: 2,
    completed: 148,
    failed: 6,
    successRate: 95
  }

  const recentPipelines = [
    { name: "GCP Cost Billing", status: "running", duration: "2m 34s", provider: "gcp" },
    { name: "AWS Cost Usage", status: "completed", duration: "1m 12s", provider: "aws" },
    { name: "OpenAI Usage Sync", status: "completed", duration: "45s", provider: "openai" },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Operations</h1>
        <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
          Monitor pipelines, system health, and operational metrics
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pipelines */}
        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5">
              <Activity className="h-5 w-5 text-[#007A78]" />
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Total Pipelines</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">{pipelineStats.total}</p>
          </div>
        </div>

        {/* Running Now */}
        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#FF6E50]/10 to-[#FF6E50]/5">
              <Zap className="h-5 w-5 text-[#FF6E50]" />
            </div>
            <div className="h-2 w-2 rounded-full bg-[#FF6E50] animate-pulse"></div>
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Running Now</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">{pipelineStats.running}</p>
          </div>
        </div>

        {/* Success Rate */}
        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Success Rate</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">{pipelineStats.successRate}%</p>
          </div>
          <div className="mt-3">
            <Progress value={pipelineStats.successRate} className="h-1.5" />
          </div>
        </div>

        {/* Failed */}
        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Failed (24h)</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">{pipelineStats.failed}</p>
          </div>
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div className="health-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#007A78]" />
            <h2 className="text-[17px] font-semibold text-black">Recent Pipeline Runs</h2>
          </div>
          <Link
            href={`/${orgSlug}/pipelines`}
            className="text-[13px] font-medium text-[#007A78] hover:text-[#005f5d] transition-colors flex items-center gap-1"
          >
            View all
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="space-y-3">
          {recentPipelines.map((pipeline, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-[#007A78]/20 hover:bg-[#007A78]/[0.02] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  pipeline.provider === 'gcp' ? 'bg-blue-500/10' :
                  pipeline.provider === 'aws' ? 'bg-orange-500/10' :
                  'bg-purple-500/10'
                }`}>
                  {pipeline.provider === 'gcp' && <Cloud className="h-4 w-4 text-blue-500" />}
                  {pipeline.provider === 'aws' && <Cloud className="h-4 w-4 text-orange-500" />}
                  {pipeline.provider === 'openai' && <Brain className="h-4 w-4 text-purple-500" />}
                </div>
                <div>
                  <p className="text-[14px] font-medium text-black">{pipeline.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Timer className="h-3 w-3 text-slate-400" />
                    <span className="text-[12px] text-muted-foreground">{pipeline.duration}</span>
                  </div>
                </div>
              </div>
              <Badge
                variant={pipeline.status === 'running' ? 'default' : 'outline'}
                className={
                  pipeline.status === 'running'
                    ? 'bg-[#FF6E50] hover:bg-[#e55a3c] text-white border-0'
                    : 'border-emerald-200 text-emerald-700 bg-emerald-50'
                }
              >
                {pipeline.status === 'running' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse"></div>
                    Running
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Completed
                  </div>
                )}
              </Badge>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-[#007A78]/[0.02] border border-[#007A78]/10">
          <p className="text-[13px] text-muted-foreground text-center">
            Real-time pipeline monitoring coming soon
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Run Pipeline */}
        <Link
          href={`/${orgSlug}/pipelines`}
          className="health-card group cursor-pointer hover:border-[#007A78]/30"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5">
              <PlayCircle className="h-5 w-5 text-[#007A78]" />
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-[#007A78] transition-colors" />
          </div>
          <h3 className="text-[17px] font-semibold text-black mb-1">Run Pipeline</h3>
          <p className="text-[13px] text-muted-foreground">
            Execute cost sync, usage tracking, and data pipelines
          </p>
        </Link>

        {/* View Analytics */}
        <Link
          href={`/${orgSlug}/cost-dashboards/overview`}
          className="health-card group cursor-pointer hover:border-[#FF6E50]/30"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#FF6E50]/10 to-[#FF6E50]/5">
              <BarChart3 className="h-5 w-5 text-[#FF6E50]" />
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-[#FF6E50] transition-colors" />
          </div>
          <h3 className="text-[17px] font-semibold text-black mb-1">Cost Analytics</h3>
          <p className="text-[13px] text-muted-foreground">
            View detailed cost breakdowns and trends
          </p>
        </Link>
      </div>

      {/* System Health Indicator */}
      <div className="health-card bg-gradient-to-br from-white to-emerald-500/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-black">System Health</h3>
              <p className="text-[13px] text-muted-foreground">All services operational</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[13px] font-medium text-emerald-600">Healthy</span>
          </div>
        </div>
      </div>
    </div>
  )
}
