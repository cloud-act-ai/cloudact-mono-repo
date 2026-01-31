import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import {
  ChevronRight,
  DollarSign,
  Cloud,
  Brain,
  Wallet,
  Zap,
  Settings,
  LayoutDashboard,
  Globe,
  CreditCard,
  Activity
} from "lucide-react"

export default async function OrgRootRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const supabase = await createClient()

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("org_name, plan, billing_status, default_currency, default_timezone, integration_gcp_status, integration_openai_status")
      .eq("org_slug", orgSlug)
      .single()

    if (!org) {
      redirect(`/${orgSlug}/cost-dashboards/overview`)
    }

    const hasCloudIntegration = org.integration_gcp_status === 'active'
    const hasLLMIntegration = org.integration_openai_status === 'active'
    const integrationCount = (hasCloudIntegration ? 1 : 0) + (hasLLMIntegration ? 1 : 0)

    return (
      <div className="space-y-8 max-w-7xl">
        {/* Clean Header */}
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wide">Welcome back</p>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">{org.org_name}</h1>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-6 py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#90FCA6]"></div>
            <span className="text-[14px] font-semibold text-slate-900">Active</span>
          </div>
          <div className="h-5 w-px bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <span className="text-[14px] text-slate-600">
              <span className="font-semibold text-slate-900 capitalize">{org.plan}</span> Plan
            </span>
          </div>
          <div className="h-5 w-px bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-400" />
            <span className="text-[14px] text-slate-600">{org.default_currency || 'USD'}</span>
          </div>
          <div className="h-5 w-px bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-400" />
            <span className="text-[14px] text-slate-600">
              <span className="font-semibold text-[#1a7a3a]">{integrationCount}</span> Integration{integrationCount !== 1 ? 's' : ''} active
            </span>
          </div>
        </div>

        {/* Quick Access Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Quick Access</h2>
            <Link
              href={`/${orgSlug}/cost-dashboards/overview`}
              className="text-[13px] font-semibold text-[#1a7a3a] hover:text-[#0f5a25] transition-colors flex items-center gap-1"
            >
              View Dashboards
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Cost Dashboards */}
            <Link
              href={`/${orgSlug}/cost-dashboards/overview`}
              className="group relative p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#90FCA6]/30 hover:shadow-sm transition-all"
            >
              <div className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-[#90FCA6] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-start justify-between mb-3">
                <div className="h-11 w-11 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-[#1a7a3a]" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#1a7a3a] transition-colors" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Cost Dashboards</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Monitor cloud spending across all providers
              </p>
            </Link>

            {/* Operations */}
            <Link
              href={`/${orgSlug}/dashboard/operations`}
              className="group relative p-5 bg-white rounded-2xl border border-slate-200 hover:border-[var(--cloudact-coral)]/30 hover:shadow-sm transition-all"
            >
              <div className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-[var(--cloudact-coral)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-start justify-between mb-3">
                <div className="h-11 w-11 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-[var(--cloudact-coral)]" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[var(--cloudact-coral)] transition-colors" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Operations</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Monitor pipeline runs and system status
              </p>
            </Link>

            {/* Settings */}
            <Link
              href={`/${orgSlug}/dashboard/settings`}
              className="group relative p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-start justify-between mb-3">
                <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-slate-600" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-1">Settings</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Configure organization and preferences
              </p>
            </Link>
          </div>
        </div>

        {/* Integrations Section */}
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Integrations</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Cloud Providers */}
            <Link
              href={`/${orgSlug}/integrations/cloud-providers`}
              className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#90FCA6]/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
                    <Cloud className="h-6 w-6 text-[#1a7a3a]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">Cloud Providers</h3>
                    <p className="text-[13px] text-slate-500 mt-0.5">GCP, AWS, Azure</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasCloudIntegration ? (
                    <span className="px-2.5 py-1 rounded-full bg-[#90FCA6]/10 text-[#1a7a3a] text-[11px] font-semibold">
                      Connected
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold">
                      Not configured
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#1a7a3a] transition-colors" />
                </div>
              </div>
            </Link>

            {/* GenAI Providers */}
            <Link
              href={`/${orgSlug}/integrations/genai`}
              className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[var(--cloudact-coral)]/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
                    <Brain className="h-6 w-6 text-[var(--cloudact-coral)]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">GenAI Providers</h3>
                    <p className="text-[13px] text-slate-500 mt-0.5">OpenAI, Claude, Gemini</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasLLMIntegration ? (
                    <span className="px-2.5 py-1 rounded-full bg-[#90FCA6]/10 text-[#1a7a3a] text-[11px] font-semibold">
                      Connected
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold">
                      Not configured
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[var(--cloudact-coral)] transition-colors" />
                </div>
              </div>
            </Link>

            {/* SaaS Subscriptions */}
            <Link
              href={`/${orgSlug}/integrations/subscriptions`}
              className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-[#8B5CF6]/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-[#8B5CF6]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">SaaS Subscriptions</h3>
                    <p className="text-[13px] text-slate-500 mt-0.5">Track subscription costs</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#8B5CF6] transition-colors" />
              </div>
            </Link>

            {/* Billing */}
            <Link
              href={`/${orgSlug}/billing`}
              className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">Billing & Plan</h3>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      <span className="capitalize">{org.plan}</span> plan
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
            </Link>
          </div>
        </div>

        {/* Status Footer */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#90FCA6]/10 flex items-center justify-center">
              <LayoutDashboard className="h-4 w-4 text-[#1a7a3a]" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-slate-900">All systems operational</p>
              <p className="text-[12px] text-slate-500">Redirecting to dashboards...</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#90FCA6] animate-pulse"></div>
            <span className="text-[13px] font-medium text-[#1a7a3a]">Active</span>
          </div>
        </div>

        {/* Auto-redirect using safe meta refresh */}
        <meta
          httpEquiv="refresh"
          content={`3; url=/${encodeURIComponent(orgSlug)}/cost-dashboards/overview`}
        />
      </div>
    )
  } catch {
    redirect(`/${orgSlug}/cost-dashboards/overview`)
  }
}
