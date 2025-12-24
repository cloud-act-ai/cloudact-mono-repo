"use client"

import Link from "next/link"
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Cloud,
  Cpu,
  DollarSign,
  GitBranch,
  Globe,
  LineChart,
  Lock,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  Brain,
  Gauge,
  Wallet,
  AlertCircle,
  Target,
  RefreshCw,
} from "lucide-react"
import "../premium.css"

// Provider logos data
const INTEGRATIONS = [
  { name: "OpenAI", icon: "🤖", category: "GenAI" },
  { name: "Anthropic", icon: "🧠", category: "GenAI" },
  { name: "Google AI", icon: "🌟", category: "GenAI" },
  { name: "AWS", icon: "☁️", category: "Cloud" },
  { name: "GCP", icon: "🌐", category: "Cloud" },
  { name: "Azure", icon: "⚡", category: "Cloud" },
  { name: "Stripe", icon: "💳", category: "SaaS" },
  { name: "Slack", icon: "💬", category: "SaaS" },
  { name: "Datadog", icon: "📊", category: "SaaS" },
  { name: "GitHub", icon: "🔧", category: "SaaS" },
]

export default function FeaturesPage() {
  const coreFeatures = [
    {
      icon: Activity,
      iconColor: "teal",
      title: "GenAI Cost Tracking",
      description:
        "Monitor every API call across OpenAI, Anthropic, Google AI, and more. Track token usage, model performance, and costs in real-time with sub-minute granularity.",
      highlights: ["Token-level tracking", "Multi-provider support", "Real-time updates"],
    },
    {
      icon: Cloud,
      iconColor: "coral",
      title: "Multi-Cloud Support",
      description:
        "Unified dashboard for AWS, GCP, and Azure infrastructure costs. Correlate cloud spending with GenAI usage for complete visibility into your tech stack.",
      highlights: ["AWS + GCP + Azure", "Unified billing", "Cross-cloud analytics"],
    },
    {
      icon: Wallet,
      iconColor: "teal",
      title: "SaaS Subscription Tracking",
      description:
        "Track and manage all your SaaS subscriptions in one place. Monitor Stripe, Slack, Datadog, and 50+ providers with automated renewal alerts and usage insights.",
      highlights: ["50+ SaaS providers", "Renewal alerts", "License optimization"],
    },
    {
      icon: LineChart,
      iconColor: "coral",
      title: "Real-Time Dashboards",
      description:
        "Beautiful, customizable dashboards that update in real-time. Build views for executives, finance teams, or engineering with drag-and-drop simplicity.",
      highlights: ["Custom views", "Live updates", "Export to PDF/Excel"],
    },
    {
      icon: Brain,
      iconColor: "teal",
      title: "AI-Powered Recommendations",
      description:
        "Machine learning identifies cost-saving opportunities automatically. Get actionable insights on model selection, prompt optimization, and resource rightsizing.",
      highlights: ["Smart suggestions", "Model comparison", "ROI predictions"],
    },
    {
      icon: Bell,
      iconColor: "coral",
      title: "Budget Alerts & Forecasting",
      description:
        "Set budgets at any level and get instant alerts when thresholds are crossed. ML-powered forecasting predicts future spending with 95% accuracy.",
      highlights: ["Smart alerts", "Predictive forecasting", "Slack/Email/PagerDuty"],
    },
  ]

  const enterpriseFeatures = [
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SOC 2 Type II certified with GDPR compliance. SSO/SAML, audit logs, and encryption at rest and in transit.",
    },
    {
      icon: Gauge,
      title: "99.99% Uptime SLA",
      description: "Mission-critical reliability with dedicated support. Multi-region deployment and automated failover.",
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Role-based access control, shared dashboards, and team budgets. Collaborate across finance and engineering.",
    },
    {
      icon: GitBranch,
      title: "Developer-First API",
      description: "RESTful API with comprehensive SDKs. Integrate with your CI/CD, monitoring, and automation workflows.",
    },
  ]

  const howItWorks = [
    {
      number: "01",
      title: "Connect Your Providers",
      description: "Link OpenAI, AWS, GCP, Azure, and SaaS tools in minutes with secure OAuth or API keys.",
      icon: Zap,
    },
    {
      number: "02",
      title: "Automatic Data Sync",
      description: "CloudAct pulls usage and billing data every 5 minutes. No manual exports or spreadsheets needed.",
      icon: RefreshCw,
    },
    {
      number: "03",
      title: "Get Instant Insights",
      description: "View real-time dashboards, receive AI recommendations, and set budget alerts from day one.",
      icon: Target,
    },
  ]

  return (
    <>
      <style jsx>{`
        @media (max-width: 768px) {
          .responsive-feature-grid {
            grid-template-columns: 1fr !important;
            gap: 2rem !important;
          }
        }
      `}</style>
      <div className="ca-landing">
        {/* Hero Section */}
        <section className="ca-hero">
        <div className="ca-hero-bg">
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
          <div className="ca-hero-orb ca-hero-orb-3" />
          <div className="ca-hero-grid" />
        </div>

        <div className="ca-hero-content">
          <div className="ca-animate">
            <div className="ca-cta-badge" style={{ marginBottom: "2rem" }}>
              <Sparkles className="w-4 h-4" />
              <span>All-in-One Cost Intelligence</span>
            </div>
          </div>

          <h1 className="ca-display-xl ca-animate ca-delay-1" style={{ marginBottom: "1.5rem" }}>
            Every Feature You Need to{" "}
            <span className="ca-gradient-text">Master Your Costs</span>
          </h1>

          <p className="ca-body ca-animate ca-delay-2" style={{ maxWidth: "700px", margin: "0 auto 3rem" }}>
            From GenAI tracking to multi-cloud analytics, CloudAct provides enterprise-grade cost intelligence
            for modern engineering teams. One platform, complete visibility.
          </p>

          <div className="ca-animate ca-delay-3" style={{ marginBottom: "4rem" }}>
            <Link href="/signup" className="ca-btn ca-btn-primary ca-btn-lg">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">CORE CAPABILITIES</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "1rem" }}>
            Built for Modern Cloud Operations
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            Everything you need to monitor, analyze, and optimize costs across your entire tech stack
          </p>
        </div>

        <div className="ca-features-grid">
          {coreFeatures.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="ca-feature-card">
                <div
                  className={
                    feature.iconColor === "teal" ? "ca-feature-icon ca-feature-icon-teal" : "ca-feature-icon ca-feature-icon-coral"
                  }
                >
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="ca-feature-title">{feature.title}</h3>
                <p className="ca-feature-desc" style={{ marginBottom: "1.5rem" }}>
                  {feature.description}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {feature.highlights.map((highlight) => (
                    <div key={highlight} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          background: feature.iconColor === "teal" ? "var(--ca-teal)" : "var(--ca-coral)",
                        }}
                      />
                      <span className="ca-body-sm" style={{ color: "var(--ca-gray-600)" }}>
                        {highlight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Integration Logos */}
      <section className="ca-trusted">
        <div className="ca-trusted-label">SEAMLESS INTEGRATIONS</div>
        <div className="ca-trusted-logos">
          {INTEGRATIONS.map((integration) => (
            <div
              key={integration.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                transition: "transform 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.1)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)"
              }}
            >
              <div style={{ fontSize: "2.5rem" }}>{integration.icon}</div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ca-gray-700)" }}>
                {integration.name}
              </div>
              <div className="ca-label" style={{ fontSize: "0.625rem" }}>
                {integration.category}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="ca-section" style={{ background: "var(--ca-gray-50)" }}>
        <div className="ca-section-header">
          <span className="ca-section-label">HOW IT WORKS</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "1rem" }}>
            Up and Running in{" "}
            <span className="ca-gradient-text">Minutes</span>
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            No complex setup or data migration. Start tracking costs immediately.
          </p>
        </div>

        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            {howItWorks.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.number} style={{ position: "relative" }}>
                  <div className="ca-card" style={{ padding: "2.5rem", height: "100%" }}>
                    <div
                      style={{
                        position: "absolute",
                        top: "-1rem",
                        right: "2rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "4rem",
                        fontWeight: 800,
                        color: "var(--ca-gray-100)",
                        lineHeight: 1,
                      }}
                    >
                      {step.number}
                    </div>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "16px",
                        background: index % 2 === 0 ? "var(--ca-teal-50)" : "var(--ca-coral-50)",
                        color: index % 2 === 0 ? "var(--ca-teal)" : "var(--ca-coral)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "1.5rem",
                      }}
                    >
                      <Icon className="w-8 h-8" />
                    </div>
                    <h3 className="ca-heading" style={{ marginBottom: "1rem" }}>
                      {step.title}
                    </h3>
                    <p className="ca-body-sm">{step.description}</p>
                  </div>
                  {index < howItWorks.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        right: "-2rem",
                        transform: "translateY(-50%)",
                        color: "var(--ca-teal)",
                        display: "none",
                      }}
                      className="hidden lg:block"
                    >
                      <ArrowRight className="w-8 h-8" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">ENTERPRISE READY</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "1rem" }}>
            Security & Scale You Can Trust
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            Built for teams that demand enterprise-grade reliability and compliance
          </p>
        </div>

        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
            {enterpriseFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="ca-card" style={{ padding: "2rem" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: index % 2 === 0 ? "var(--ca-teal-50)" : "var(--ca-coral-50)",
                      color: index % 2 === 0 ? "var(--ca-teal)" : "var(--ca-coral)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "1rem",
                    }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="ca-subheading" style={{ marginBottom: "0.75rem" }}>
                    {feature.title}
                  </h3>
                  <p className="ca-body-sm">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="ca-stats-section">
        <div className="ca-stats-grid">
          <div>
            <div className="ca-stat-value">95%</div>
            <div className="ca-stat-label">Forecast Accuracy</div>
          </div>
          <div>
            <div className="ca-stat-value">$2.8M</div>
            <div className="ca-stat-label">Total Savings Tracked</div>
          </div>
          <div>
            <div className="ca-stat-value">847</div>
            <div className="ca-stat-label">Organizations</div>
          </div>
        </div>
      </section>

      {/* Feature Deep Dive */}
      <section className="ca-section" style={{ background: "var(--ca-gray-50)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4rem",
              alignItems: "center",
            }}
            className="responsive-feature-grid"
          >
            {/* Left - Feature Details */}
            <div>
              <span className="ca-section-label">DETAILED TRACKING</span>
              <h2 className="ca-display-md" style={{ margin: "1rem 0 1.5rem" }}>
                See Every Dollar,{" "}
                <span className="ca-gradient-text">Every Token</span>
              </h2>
              <p className="ca-body" style={{ marginBottom: "2rem" }}>
                CloudAct tracks costs at the most granular level possible. From individual API calls to
                infrastructure resources, nothing escapes our monitoring.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      minWidth: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "var(--ca-teal)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="ca-subheading" style={{ marginBottom: "0.25rem" }}>
                      Token-Level Granularity
                    </div>
                    <p className="ca-body-sm">Track every single token across all GenAI providers with per-request attribution</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      minWidth: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "var(--ca-coral)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="ca-subheading" style={{ marginBottom: "0.25rem" }}>
                      Custom Dimensions
                    </div>
                    <p className="ca-body-sm">Tag costs by team, project, customer, or any custom dimension you define</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      minWidth: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "var(--ca-teal)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="ca-subheading" style={{ marginBottom: "0.25rem" }}>
                      Historical Analysis
                    </div>
                    <p className="ca-body-sm">Unlimited retention with second-level granularity for trend analysis</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - Visual */}
            <div className="ca-card" style={{ padding: "2rem" }}>
              <div className="ca-metric-card ca-metric-card-highlight" style={{ marginBottom: "1rem" }}>
                <div className="ca-metric-label">TOTAL COST (TODAY)</div>
                <div className="ca-metric-value">$1,247</div>
                <div className="ca-metric-change ca-metric-change-positive">
                  <TrendingUp className="w-3 h-3" />
                  <span>12% vs yesterday</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="ca-metric-card">
                  <div className="ca-metric-label">GenAI</div>
                  <div className="ca-metric-value" style={{ fontSize: "1.5rem" }}>
                    $847
                  </div>
                </div>
                <div className="ca-metric-card">
                  <div className="ca-metric-label">Cloud</div>
                  <div className="ca-metric-value" style={{ fontSize: "1.5rem" }}>
                    $312
                  </div>
                </div>
                <div className="ca-metric-card">
                  <div className="ca-metric-label">SaaS</div>
                  <div className="ca-metric-value" style={{ fontSize: "1.5rem" }}>
                    $88
                  </div>
                </div>
                <div className="ca-metric-card">
                  <div className="ca-metric-label">Other</div>
                  <div className="ca-metric-value" style={{ fontSize: "1.5rem" }}>
                    $0
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <Sparkles className="w-4 h-4" />
              <span>14-Day Free Trial • No Credit Card Required</span>
            </div>
            <h2 className="ca-cta-title">Ready to Master Your Costs?</h2>
            <p className="ca-cta-subtitle">
              Join hundreds of companies using CloudAct to optimize their GenAI and cloud spending.
              Start tracking in minutes.
            </p>
            <div className="ca-cta-buttons">
              <Link href="/signup" className="ca-cta-btn-white">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/pricing" className="ca-cta-btn-outline">
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
      </div>
    </>
  )
}
