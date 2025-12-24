import Link from "next/link"
import {
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Cloud,
  Brain,
  ChevronRight,
  BarChart3,
  Timer,
  Database
} from "lucide-react"

export default async function OperationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // Mock data for demonstration
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
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">Operations</h1>
        <p className="text-[15px] text-slate-500">
          Monitor pipelines, system health, and operational metrics
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-6 py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-slate-900">{pipelineStats.total}</span> Total
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[#FF6E50] animate-pulse"></div>
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#FF6E50]">{pipelineStats.running}</span> Running
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-emerald-600">{pipelineStats.successRate}%</span> Success
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-amber-600">{pipelineStats.failed}</span> Failed (24h)
          </span>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[#007A78]/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-[#007A78]" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Total Runs</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.total}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[#FF6E50]/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-[#FF6E50]" />
            </div>
            <div className="h-2 w-2 rounded-full bg-[#FF6E50] animate-pulse"></div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Running Now</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.running}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Success Rate</p>
          <p className="text-[24px] font-bold text-emerald-600 mt-1">{pipelineStats.successRate}%</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-[12px] text-slate-500 uppercase tracking-wide">Failed (24h)</p>
          <p className="text-[24px] font-bold text-slate-900 mt-1">{pipelineStats.failed}</p>
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Recent Runs</h2>
          <Link
            href={`/${orgSlug}/pipelines`}
            className="text-[13px] font-semibold text-[#007A78] hover:text-[#005F5D] transition-colors flex items-center gap-1"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {recentPipelines.map((pipeline, idx) => (
            <div
              key={idx}
              className="group relative"
            >
              {/* Left accent */}
              <div
                className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                  pipeline.status === 'running' ? 'bg-[#FF6E50]' : 'bg-emerald-500'
                }`}
              />

              <div className="flex items-center justify-between p-4 pl-5">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    pipeline.provider === 'gcp' ? 'bg-blue-500/10' :
                    pipeline.provider === 'aws' ? 'bg-orange-500/10' :
                    'bg-purple-500/10'
                  }`}>
                    {pipeline.provider === 'gcp' && <Cloud className="h-5 w-5 text-blue-500" />}
                    {pipeline.provider === 'aws' && <Cloud className="h-5 w-5 text-orange-500" />}
                    {pipeline.provider === 'openai' && <Brain className="h-5 w-5 text-purple-500" />}
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-slate-900">{pipeline.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Timer className="h-3 w-3 text-slate-400" />
                      <span className="text-[12px] text-slate-500">{pipeline.duration}</span>
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  pipeline.status === 'running'
                    ? 'bg-[#FF6E50]/10 text-[#FF6E50]'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {pipeline.status === 'running' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FF6E50] animate-pulse"></span>
                      Running
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
          <p className="text-[13px] text-slate-500">
            Real-time pipeline monitoring coming soon
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Quick Actions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href={`/${orgSlug}/pipelines`}
            className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#007A78]/30 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-11 w-11 rounded-xl bg-[#007A78]/10 flex items-center justify-center">
                <PlayCircle className="h-5 w-5 text-[#007A78]" />
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#007A78] transition-colors" />
            </div>
            <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Run Pipeline</h3>
            <p className="text-[13px] text-slate-500">
              Execute cost sync, usage tracking, and data pipelines
            </p>
          </Link>

          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#FF6E50]/30 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-11 w-11 rounded-xl bg-[#FF6E50]/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-[#FF6E50]" />
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#FF6E50] transition-colors" />
            </div>
            <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Cost Analytics</h3>
            <p className="text-[13px] text-slate-500">
              View detailed cost breakdowns and trends
            </p>
          </Link>
        </div>
      </div>

      {/* System Health */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">System Health</h3>
              <p className="text-[13px] text-slate-500">All services operational</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[13px] font-semibold text-emerald-600">Healthy</span>
          </div>
        </div>
      </div>
    </div>
  )
}
