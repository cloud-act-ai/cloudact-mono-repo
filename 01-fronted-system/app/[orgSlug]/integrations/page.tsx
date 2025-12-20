"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { Server, Brain, CreditCard, ChevronRight } from "lucide-react"

const INTEGRATION_CATEGORIES = [
  {
    id: "cloud-providers",
    name: "Cloud Providers",
    description: "Connect GCP, AWS, or Azure for cloud cost tracking",
    icon: Server,
    href: "cloud-providers",
  },
  {
    id: "llm",
    name: "LLM Providers",
    description: "Connect OpenAI, Anthropic, Gemini, or DeepSeek for AI cost tracking",
    icon: Brain,
    href: "llm",
  },
  {
    id: "subscriptions",
    name: "Subscription Providers",
    description: "Track SaaS subscription costs like Slack, Canva, and more",
    icon: CreditCard,
    href: "subscriptions",
  },
]

export default function IntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Integrations</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Connect your cloud providers, LLM APIs, and subscription services
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {INTEGRATION_CATEGORIES.map((category) => {
          const Icon = category.icon
          return (
            <Link key={category.id} href={`/${orgSlug}/integrations/${category.href}`}>
              <div className="metric-card p-5 transition-all cursor-pointer hover:border-[#007A78]/30 hover:shadow-md">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#007A78]/10">
                      <Icon className="h-5 w-5 text-[#007A78]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-black truncate">{category.name}</p>
                      <p className="text-[13px] text-muted-foreground line-clamp-2">{category.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-[13px] font-medium text-[#007A78] flex items-center gap-1">
                    Configure
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="health-card p-6 text-center">
        <p className="text-[13px] text-muted-foreground font-medium">
          All credentials are encrypted using Google Cloud KMS before storage.
        </p>
      </div>
    </div>
  )
}
