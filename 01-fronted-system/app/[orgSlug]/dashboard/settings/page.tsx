import Link from "next/link"
import {
  Settings,
  Building2,
  User,
  Shield,
  Cloud,
  Brain,
  Wallet,
  Users,
  Lock,
  BarChart3,
  ChevronRight,
  Globe,
  Bell,
  Palette,
  Database
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // Fetch organization data for status badges
  const supabase = await createClient()
  let integrationStatus = {
    gcp: false,
    aws: false,
    azure: false,
    openai: false,
    claude: false,
    gemini: false
  }

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("integration_gcp_status, integration_aws_status, integration_azure_status, integration_openai_status, integration_claude_status, integration_gemini_status")
      .eq("org_slug", orgSlug)
      .single()

    if (org) {
      integrationStatus = {
        gcp: org.integration_gcp_status === 'active',
        aws: org.integration_aws_status === 'active',
        azure: org.integration_azure_status === 'active',
        openai: org.integration_openai_status === 'active',
        claude: org.integration_claude_status === 'active',
        gemini: org.integration_gemini_status === 'active'
      }
    }
  } catch {
    // Use default values if fetch fails
  }

  const settingsSections = [
    {
      title: "Organization",
      items: [
        {
          icon: Building2,
          label: "Organization Settings",
          description: "Manage organization name, slug, and preferences",
          href: `/${orgSlug}/settings/organization`,
          color: "teal",
          badge: null
        },
        {
          icon: Users,
          label: "Team Members",
          description: "Invite and manage team members and roles",
          href: `/${orgSlug}/settings/team`,
          color: "coral",
          badge: null
        },
        {
          icon: Globe,
          label: "Localization",
          description: "Configure currency, timezone, and regional settings",
          href: `/${orgSlug}/settings/organization`,
          color: "teal",
          badge: null
        }
      ]
    },
    {
      title: "Integrations",
      items: [
        {
          icon: Cloud,
          label: "Cloud Providers",
          description: "Connect AWS, GCP, Azure for cost tracking",
          href: `/${orgSlug}/settings/integrations/cloud`,
          color: "blue",
          badge: integrationStatus.gcp || integrationStatus.aws || integrationStatus.azure ? "Connected" : null
        },
        {
          icon: Brain,
          label: "LLM Providers",
          description: "Connect OpenAI, Claude, Gemini for AI costs",
          href: `/${orgSlug}/settings/integrations/llm`,
          color: "purple",
          badge: integrationStatus.openai || integrationStatus.claude || integrationStatus.gemini ? "Connected" : null
        },
        {
          icon: Database,
          label: "SaaS Subscriptions",
          description: "Track and manage third-party subscription costs",
          href: `/${orgSlug}/settings/integrations/subscriptions`,
          color: "teal",
          badge: null
        }
      ]
    },
    {
      title: "Account & Security",
      items: [
        {
          icon: User,
          label: "Personal Settings",
          description: "Update your profile and personal preferences",
          href: `/${orgSlug}/settings/personal`,
          color: "teal",
          badge: null
        },
        {
          icon: Shield,
          label: "Security",
          description: "API keys, authentication, and access control",
          href: `/${orgSlug}/settings/security`,
          color: "coral",
          badge: null
        },
        {
          icon: BarChart3,
          label: "Quota & Usage",
          description: "Monitor API usage and quota limits",
          href: `/${orgSlug}/settings/quota-usage`,
          color: "teal",
          badge: null
        }
      ]
    },
    {
      title: "Billing",
      items: [
        {
          icon: Wallet,
          label: "Subscription & Billing",
          description: "Manage your plan, payment methods, and invoices",
          href: `/${orgSlug}/billing`,
          color: "teal",
          badge: null
        }
      ]
    }
  ]

  const getIconBgColor = (color: string) => {
    switch (color) {
      case 'teal':
        return 'bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5'
      case 'coral':
        return 'bg-gradient-to-br from-[#FF6E50]/10 to-[#FF6E50]/5'
      case 'blue':
        return 'bg-gradient-to-br from-blue-500/10 to-blue-500/5'
      case 'purple':
        return 'bg-gradient-to-br from-purple-500/10 to-purple-500/5'
      default:
        return 'bg-gradient-to-br from-slate-500/10 to-slate-500/5'
    }
  }

  const getIconColor = (color: string) => {
    switch (color) {
      case 'teal':
        return 'text-[#007A78]'
      case 'coral':
        return 'text-[#FF6E50]'
      case 'blue':
        return 'text-blue-500'
      case 'purple':
        return 'text-purple-500'
      default:
        return 'text-slate-500'
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Settings</h1>
        <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
          Configure your organization, integrations, and preferences
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5">
              <Cloud className="h-5 w-5 text-[#007A78]" />
            </div>
            {(integrationStatus.gcp || integrationStatus.aws || integrationStatus.azure) && (
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Cloud Integrations</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">
              {[integrationStatus.gcp, integrationStatus.aws, integrationStatus.azure].filter(Boolean).length}
            </p>
          </div>
        </div>

        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#FF6E50]/10 to-[#FF6E50]/5">
              <Brain className="h-5 w-5 text-[#FF6E50]" />
            </div>
            {(integrationStatus.openai || integrationStatus.claude || integrationStatus.gemini) && (
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">LLM Integrations</p>
            <p className="text-[28px] font-semibold text-black tracking-tight">
              {[integrationStatus.openai, integrationStatus.claude, integrationStatus.gemini].filter(Boolean).length}
            </p>
          </div>
        </div>

        <div className="health-card">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
              <Shield className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
          </div>
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Security Status</p>
            <p className="text-[15px] font-semibold text-emerald-600 tracking-tight">Protected</p>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      {settingsSections.map((section, idx) => (
        <div key={idx} className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-semibold text-black">{section.title}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.items.map((item, itemIdx) => (
              <Link
                key={itemIdx}
                href={item.href}
                className="health-card group cursor-pointer hover:border-[#007A78]/30"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${getIconBgColor(item.color)}`}>
                    <item.icon className={`h-5 w-5 ${getIconColor(item.color)}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[11px] px-2 py-0.5"
                      >
                        {item.badge}
                      </Badge>
                    )}
                    <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-[#007A78] transition-colors" />
                  </div>
                </div>
                <h3 className="text-[16px] font-semibold text-black mb-1">{item.label}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Help Card */}
      <div className="health-card bg-gradient-to-br from-white to-[#007A78]/[0.02] border-[#007A78]/20">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-[#007A78]">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-semibold text-black mb-1">Need Help?</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
              Check our documentation or contact support for assistance with configuration.
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#007A78] rounded-lg hover:bg-[#005f5d] transition-colors">
                View Docs
              </button>
              <button className="px-3 py-1.5 text-[13px] font-medium text-[#007A78] bg-[#007A78]/10 rounded-lg hover:bg-[#007A78]/20 transition-colors">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
