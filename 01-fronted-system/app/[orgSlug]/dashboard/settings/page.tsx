import Link from "next/link"
import {
  Building2,
  User,
  Shield,
  Cloud,
  Brain,
  Wallet,
  Users,
  ChevronRight,
  Globe,
  Database,
  CreditCard,
  Activity
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

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

  const cloudCount = [integrationStatus.gcp, integrationStatus.aws, integrationStatus.azure].filter(Boolean).length
  const llmCount = [integrationStatus.openai, integrationStatus.claude, integrationStatus.gemini].filter(Boolean).length

  const settingsSections = [
    {
      id: "organization",
      title: "Organization",
      items: [
        {
          icon: Building2,
          label: "Organization Settings",
          description: "Name, branding, and locale preferences",
          href: `/${orgSlug}/settings/organization`,
          accent: "#007A78"
        },
        {
          icon: Users,
          label: "Team Members",
          description: "Invite and manage team members",
          href: `/${orgSlug}/settings/invite`,
          accent: "#FF6E50"
        },
        {
          icon: Globe,
          label: "Localization",
          description: "Currency, timezone, and fiscal year",
          href: `/${orgSlug}/settings/organization`,
          accent: "#007A78"
        }
      ]
    },
    {
      id: "integrations",
      title: "Integrations",
      items: [
        {
          icon: Cloud,
          label: "Cloud Providers",
          description: "GCP, AWS, Azure cost tracking",
          href: `/${orgSlug}/integrations/cloud-providers`,
          accent: "#4285F4",
          badge: cloudCount > 0 ? `${cloudCount} connected` : null
        },
        {
          icon: Brain,
          label: "LLM Providers",
          description: "OpenAI, Claude, Gemini usage",
          href: `/${orgSlug}/integrations/llm`,
          accent: "#8B5CF6",
          badge: llmCount > 0 ? `${llmCount} connected` : null
        },
        {
          icon: CreditCard,
          label: "SaaS Subscriptions",
          description: "Track subscription costs",
          href: `/${orgSlug}/integrations/subscriptions`,
          accent: "#007A78"
        }
      ]
    },
    {
      id: "account",
      title: "Account & Security",
      items: [
        {
          icon: User,
          label: "Personal Settings",
          description: "Your profile and preferences",
          href: `/${orgSlug}/settings/profile`,
          accent: "#007A78"
        },
        {
          icon: Shield,
          label: "Security",
          description: "API keys and access control",
          href: `/${orgSlug}/settings/security`,
          accent: "#FF6E50"
        },
        {
          icon: Activity,
          label: "Quota & Usage",
          description: "Monitor API usage limits",
          href: `/${orgSlug}/settings/quota-usage`,
          accent: "#007A78"
        }
      ]
    },
    {
      id: "billing",
      title: "Billing",
      items: [
        {
          icon: Wallet,
          label: "Subscription & Billing",
          description: "Plan, payments, and invoices",
          href: `/${orgSlug}/billing`,
          accent: "#007A78"
        }
      ]
    }
  ]

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-[15px] text-slate-500">
          Configure your organization, integrations, and preferences
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-6 py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-3">
          <Cloud className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#007A78]">{cloudCount}</span> Cloud
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <Brain className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#8B5CF6]">{llmCount}</span> LLM
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-500" />
          <span className="text-[14px] font-medium text-emerald-600">Protected</span>
        </div>
      </div>

      {/* Settings Sections */}
      {settingsSections.map((section) => (
        <div key={section.id} className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">{section.title}</h2>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {section.items.map((item, idx) => {
              const Icon = item.icon
              return (
                <Link
                  key={idx}
                  href={item.href}
                  className="group relative block"
                >
                  {/* Left accent on hover */}
                  <div
                    className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: item.accent }}
                  />

                  <div className="flex items-center justify-between p-4 pl-5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${item.accent}15` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: item.accent }} />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold text-slate-900">{item.label}</h3>
                        <p className="text-[13px] text-slate-500">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.badge && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {/* Help Section */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#007A78]/10 flex items-center justify-center flex-shrink-0">
            <Database className="h-5 w-5 text-[#007A78]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Need Help?</h3>
            <p className="text-[13px] text-slate-500 mt-1">
              Check our documentation or contact support for configuration assistance.
            </p>
            <div className="flex gap-2 mt-3">
              <button className="h-9 px-4 text-[13px] font-semibold text-white bg-[#007A78] hover:bg-[#006664] rounded-lg transition-colors">
                View Docs
              </button>
              <button className="h-9 px-4 text-[13px] font-semibold text-[#007A78] bg-[#007A78]/10 hover:bg-[#007A78]/15 rounded-lg transition-colors">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
