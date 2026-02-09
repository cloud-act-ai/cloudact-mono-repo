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
          accent: "#90FCA6"
        },
        {
          icon: Users,
          label: "Team Members",
          description: "Invite and manage team members",
          href: `/${orgSlug}/settings/invite`,
          accent: "#FF6C5E"
        },
        {
          icon: Globe,
          label: "Localization",
          description: "Currency, timezone, and fiscal year",
          href: `/${orgSlug}/settings/organization`,
          accent: "#90FCA6"
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
          accent: "#90FCA6",
          badge: cloudCount > 0 ? `${cloudCount} connected` : null
        },
        {
          icon: Brain,
          label: "GenAI Providers",
          description: "OpenAI, Claude, Gemini usage",
          href: `/${orgSlug}/integrations/genai`,
          accent: "#8B5CF6",
          badge: llmCount > 0 ? `${llmCount} connected` : null
        },
        {
          icon: CreditCard,
          label: "SaaS Subscriptions",
          description: "Track subscription costs",
          href: `/${orgSlug}/integrations/subscriptions`,
          accent: "#90FCA6"
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
          accent: "#90FCA6"
        },
        {
          icon: Shield,
          label: "Security",
          description: "API keys and access control",
          href: `/${orgSlug}/settings/security`,
          accent: "#FF6C5E"
        },
        {
          icon: Activity,
          label: "Quota & Usage",
          description: "Monitor API usage limits",
          href: `/${orgSlug}/settings/quota-usage`,
          accent: "#90FCA6"
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
          accent: "#90FCA6"
        }
      ]
    }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
          Dashboard Settings
        </h1>
        <p className="text-[14px] text-slate-500 mt-2 max-w-lg">
          Configure your organization, integrations, and preferences
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
            <Cloud className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[20px] font-bold text-slate-900 leading-none">{cloudCount}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Cloud Providers</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-[#8B5CF6]" />
          </div>
          <div>
            <p className="text-[20px] font-bold text-slate-900 leading-none">{llmCount}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">GenAI Providers</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[20px] font-bold text-slate-900 leading-none">Protected</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Security Status</p>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      {settingsSections.map((section) => (
        <section key={section.id} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">
              {section.title}
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
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
                    className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: item.accent }}
                  />

                  <div className="pl-5 py-4 pr-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${item.accent}12` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: item.accent }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-slate-900 truncate tracking-tight">
                          {item.label}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.badge && (
                        <span className="px-2.5 py-1 rounded-full bg-[#90FCA6]/10 text-[#1a7a3a] text-[11px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {/* Help Section */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 text-center">
        <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Database className="h-5 w-5 text-slate-600" />
        </div>
        <h3 className="text-[14px] font-semibold text-slate-900 mb-1">
          Need Help?
        </h3>
        <p className="text-[12px] text-slate-500 mb-5 max-w-sm mx-auto">
          Check our documentation or contact support for configuration assistance.
        </p>
        <div className="flex gap-3 justify-center">
          <button className="h-10 px-5 bg-[#90FCA6] hover:bg-[#B8FDCA] text-[#000000] text-[12px] font-semibold rounded-xl transition-colors inline-flex items-center gap-2">
            View Docs
          </button>
          <button className="h-10 px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-[12px] font-semibold rounded-xl transition-colors inline-flex items-center gap-2">
            Contact Support
          </button>
        </div>
      </div>
    </div>
  )
}
