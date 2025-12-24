import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  Zap,
  AlertCircle,
  ChevronRight,
  DollarSign,
  Cloud,
  Brain,
  Wallet,
  Sparkles,
  ArrowRight,
  Activity,
  BarChart3,
  Shield,
  Globe
} from "lucide-react"

export default async function OrgRootRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // Try to fetch organization data to show a quick overview
  const supabase = await createClient()

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("org_name, plan, billing_status, locale_currency, locale_timezone, integration_gcp_status, integration_openai_status")
      .eq("org_slug", orgSlug)
      .single()

    if (!org) {
      redirect(`/${orgSlug}/cost-dashboards/overview`)
    }

    const hasCloudIntegration = org.integration_gcp_status === 'active'
    const hasLLMIntegration = org.integration_openai_status === 'active'

    // Quick dashboard overview before redirecting
    return (
      <div className="space-y-8">
        {/* Hero Welcome Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#007A78] via-[#007A78] to-[#005F5D] p-8 sm:p-10">
          {/* Animated decorative elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6E50]/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-2xl"></div>
          <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-[#14b8a6]/20 rounded-full blur-xl"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <Badge className="bg-[#FF6E50] text-white border-0 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide">
                {org.plan} Plan
              </Badge>
            </div>

            <h1 className="text-[40px] sm:text-[52px] font-bold text-white tracking-tight mb-3 leading-tight">
              Welcome to<br />
              <span className="bg-gradient-to-r from-white via-white/90 to-[#FF6E50] bg-clip-text text-transparent">
                {org.org_name}
              </span>
            </h1>

            <p className="text-[17px] text-white/80 max-w-xl mb-8">
              Your unified platform for cloud cost intelligence and optimization
            </p>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 group hover:bg-white/15 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-white/70" />
                  <span className="text-[11px] text-white/60 font-medium uppercase tracking-wide">Status</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
                  <span className="text-[15px] font-semibold text-white">Active</span>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 group hover:bg-white/15 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-white/70" />
                  <span className="text-[11px] text-white/60 font-medium uppercase tracking-wide">Currency</span>
                </div>
                <span className="text-[15px] font-semibold text-white">{org.locale_currency || 'USD'}</span>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 group hover:bg-white/15 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud className="h-4 w-4 text-white/70" />
                  <span className="text-[11px] text-white/60 font-medium uppercase tracking-wide">Cloud</span>
                </div>
                <span className={`text-[15px] font-semibold ${hasCloudIntegration ? 'text-emerald-400' : 'text-white/50'}`}>
                  {hasCloudIntegration ? 'Connected' : 'Not Set'}
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 group hover:bg-white/15 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-white/70" />
                  <span className="text-[11px] text-white/60 font-medium uppercase tracking-wide">LLM</span>
                </div>
                <span className={`text-[15px] font-semibold ${hasLLMIntegration ? 'text-emerald-400' : 'text-white/50'}`}>
                  {hasLLMIntegration ? 'Connected' : 'Not Set'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Access Cards with Stagger Animation */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[24px] font-bold text-black">Quick Access</h2>
            <Link
              href={`/${orgSlug}/cost-dashboards/overview`}
              className="flex items-center gap-2 text-[14px] font-semibold text-[#007A78] hover:text-[#005F5D] transition-colors group"
            >
              View All Dashboards
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-animation">
            {/* Cost Dashboards */}
            <Link
              href={`/${orgSlug}/cost-dashboards/overview`}
              className="health-card group cursor-pointer card-lift hover:border-[#007A78]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#007A78] to-[#005F5D] shadow-lg shadow-[#007A78]/20 group-hover:shadow-[#007A78]/30 transition-shadow">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#007A78] group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">Cost Dashboards</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Monitor and analyze your cloud spending across all providers
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-[12px] text-[#007A78] font-medium">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Real-time analytics</span>
                </div>
              </div>
            </Link>

            {/* Operations */}
            <Link
              href={`/${orgSlug}/dashboard/operations`}
              className="health-card group cursor-pointer card-lift hover:border-[#FF6E50]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#FF6E50] to-[#E55A3C] shadow-lg shadow-[#FF6E50]/20 group-hover:shadow-[#FF6E50]/30 transition-shadow">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#FF6E50] group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">Operations</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Monitor pipeline runs and system operations
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-[12px] text-[#FF6E50] font-medium">
                  <Activity className="h-3.5 w-3.5" />
                  <span>Live monitoring</span>
                </div>
              </div>
            </Link>

            {/* Settings */}
            <Link
              href={`/${orgSlug}/dashboard/settings`}
              className="health-card group cursor-pointer card-lift hover:border-[#007A78]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#007A78] to-[#14b8a6] shadow-lg shadow-[#007A78]/20 group-hover:shadow-[#007A78]/30 transition-shadow">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#007A78] group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">Settings</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Configure organization, integrations, and preferences
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-[12px] text-[#007A78] font-medium">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Secure configuration</span>
                </div>
              </div>
            </Link>

            {/* Cloud Integrations */}
            <Link
              href={`/${orgSlug}/integrations/cloud-providers`}
              className="health-card group cursor-pointer card-lift hover:border-[#14b8a6]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#14b8a6] to-[#0d9488] shadow-lg shadow-[#14b8a6]/20 group-hover:shadow-[#14b8a6]/30 transition-shadow">
                  <Cloud className="h-6 w-6 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  {hasCloudIntegration && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-semibold px-2">
                      Active
                    </Badge>
                  )}
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#14b8a6] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">Cloud Integrations</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Connect AWS, GCP, Azure and other cloud providers
              </p>
            </Link>

            {/* LLM Integrations */}
            <Link
              href={`/${orgSlug}/integrations/llm`}
              className="health-card group cursor-pointer card-lift hover:border-[#FF6E50]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#FF6E50] to-[#f97316] shadow-lg shadow-[#FF6E50]/20 group-hover:shadow-[#FF6E50]/30 transition-shadow">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  {hasLLMIntegration && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-semibold px-2">
                      Active
                    </Badge>
                  )}
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#FF6E50] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">LLM Integrations</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Connect OpenAI, Claude, Gemini and other AI providers
              </p>
            </Link>

            {/* Billing */}
            <Link
              href={`/${orgSlug}/billing`}
              className="health-card group cursor-pointer card-lift hover:border-[#007A78]/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#007A78] to-[#005F5D] shadow-lg shadow-[#007A78]/20 group-hover:shadow-[#007A78]/30 transition-shadow">
                  <Wallet className="h-6 w-6 text-white" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#007A78] group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-[18px] font-bold text-black mb-2">Billing & Plan</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Manage your subscription and billing information
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-slate-500 font-medium">Current Plan</span>
                  <Badge className="bg-[#007A78]/10 text-[#007A78] border-0 px-3 py-1 text-[12px] font-bold capitalize">
                    {org.plan}
                  </Badge>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Organization Status Card */}
        <div className="health-card bg-gradient-to-br from-white via-white to-[#007A78]/[0.03] border-2 border-[#007A78]/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#007A78] to-[#005F5D] shadow-lg shadow-[#007A78]/20">
                <LayoutDashboard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-black">Organization Status</h3>
                <p className="text-[14px] text-muted-foreground">All systems operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100">
              <div className="relative">
                <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
              </div>
              <span className="text-[14px] font-semibold text-emerald-700">Active</span>
            </div>
          </div>
        </div>

        {/* Auto-redirect notice */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-[#007A78]/5 rounded-full border border-[#007A78]/10">
            <div className="h-2 w-2 rounded-full bg-[#007A78] animate-pulse"></div>
            <p className="text-[14px] text-[#007A78] font-medium">
              Redirecting to Cost Dashboards in 3 seconds...
            </p>
          </div>
        </div>

        {/* Auto-redirect script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              setTimeout(function() {
                window.location.href = '/${orgSlug}/cost-dashboards/overview';
              }, 3000);
            `,
          }}
        />
      </div>
    )
  } catch {
    // Fallback to immediate redirect if data fetch fails
    redirect(`/${orgSlug}/cost-dashboards/overview`)
  }
}
