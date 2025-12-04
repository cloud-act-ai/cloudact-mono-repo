import type { Metadata } from "next"
import {
  BarChart3,
  Bell,
  Cloud,
  DollarSign,
  Filter,
  GitBranch,
  Globe,
  LineChart,
  Lock,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Features - Enterprise-Grade Cost Intelligence | CloudAct.ai",
  description: "Real-time cost tracking, AI-powered recommendations, multi-cloud support, predictive analytics, and enterprise security. Everything you need to optimize GenAI and cloud costs.",
  openGraph: {
    title: "Features - Enterprise-Grade Cost Intelligence | CloudAct.ai",
    description: "Real-time cost tracking, AI-powered recommendations, multi-cloud support, and enterprise security for GenAI and cloud cost optimization.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Features - Enterprise-Grade Cost Intelligence | CloudAct.ai",
    description: "Real-time cost tracking, AI-powered recommendations, multi-cloud support, and enterprise security.",
  },
}

export default function FeaturesPage() {
  const features = [
    {
      icon: BarChart3,
      category: "Monitoring",
      title: "Real-Time Cost Tracking",
      description:
        "Monitor every API call, token usage, and infrastructure resource as it happens. Sub-minute data refresh across all providers.",
    },
    {
      icon: Sparkles,
      category: "Intelligence",
      title: "AI-Powered Recommendations",
      description:
        "Automatically identify cost-saving opportunities through model comparison, prompt optimization, and usage pattern analysis.",
    },
    {
      icon: Cloud,
      category: "Integration",
      title: "Multi-Cloud Support",
      description:
        "Unified dashboard for AWS, Azure, GCP, OpenAI, Anthropic, and 10+ other providers. One platform for all your costs.",
    },
    {
      icon: TrendingUp,
      category: "Forecasting",
      title: "Predictive Analytics",
      description:
        "ML-powered cost forecasting with anomaly detection. Predict future spending and catch unexpected spikes before they impact your budget.",
    },
    {
      icon: DollarSign,
      category: "Attribution",
      title: "Cost Allocation",
      description:
        "Track and allocate costs by team, project, customer, or custom tags. Automated chargeback and showback reporting.",
    },
    {
      icon: Bell,
      category: "Alerting",
      title: "Smart Budget Alerts",
      description:
        "Real-time notifications when costs spike or budgets are exceeded. Configure alerts via email, Slack, PagerDuty, or webhooks.",
    },
    {
      icon: Filter,
      category: "Analysis",
      title: "Advanced Filtering",
      description:
        "Drill down into costs by service, region, model, endpoint, or custom dimensions. Export detailed reports in any format.",
    },
    {
      icon: Users,
      category: "Collaboration",
      title: "Team Workspaces",
      description:
        "Multi-user support with role-based access control. Share dashboards, set team budgets, and collaborate on optimization.",
    },
    {
      icon: GitBranch,
      category: "API",
      title: "Developer-First API",
      description:
        "RESTful API with comprehensive SDKs. Integrate CloudAct into your CI/CD, monitoring, and automation workflows.",
    },
    {
      icon: Lock,
      category: "Security",
      title: "Enterprise Security",
      description: "SOC 2 Type II certified, GDPR compliant. SSO/SAML, audit logs, encryption at rest and in transit.",
    },
    {
      icon: LineChart,
      category: "Reporting",
      title: "Custom Dashboards",
      description: "Build custom views tailored to your organization. Schedule automated reports for stakeholders.",
    },
    {
      icon: Globe,
      category: "Global",
      title: "Multi-Region Analytics",
      description:
        "Track costs across all cloud regions and availability zones with geo-specific breakdowns and comparisons.",
    },
  ]

  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="cloudact-badge">
              <span className="flex h-2 w-2 rounded-full bg-cloudact-teal animate-pulse" />
              Powerful Features
            </div>
            <h1 className="cloudact-heading-xl">
              Enterprise-Grade Cost Intelligence
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              Everything you need to monitor, analyze, and optimize your GenAI and cloud infrastructure costs
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => {
                const Icon = feature.icon
                const isCoralIcon = index % 3 === 1
                return (
                  <div key={feature.title} className="cloudact-card group p-8">
                    <div className="space-y-4">
                      <div className={isCoralIcon ? "cloudact-icon-box-coral" : "cloudact-icon-box"}>
                        <Icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <div className="cloudact-body-sm font-medium text-cloudact-teal">{feature.category}</div>
                        <h3 className="cloudact-heading-md">{feature.title}</h3>
                        <p className="cloudact-body-sm leading-relaxed">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="py-20 bg-gray-50 border-t border-gray-200">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="text-center space-y-4 mb-16">
              <h2 className="cloudact-heading-lg">Built for Enterprise</h2>
              <p className="cloudact-body text-lg">Security, compliance, and scale you can trust</p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="cloudact-card group p-10">
                <div className="space-y-6">
                  <div className="cloudact-icon-box">
                    <Shield className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">SOC 2 Type II Certified</h3>
                  <p className="cloudact-body leading-relaxed">
                    Independently audited security controls. GDPR compliant with data residency options. We maintain the highest standards of data protection.
                  </p>
                </div>
              </div>
              <div className="cloudact-card group p-10">
                <div className="space-y-6">
                  <div className="cloudact-icon-box-coral">
                    <Zap className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">99.99% Uptime SLA</h3>
                  <p className="cloudact-body leading-relaxed">
                    Enterprise-grade reliability with dedicated support and guaranteed response times. Your critical infrastructure is safe with us.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
