"use client"

import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  Cloud,
  Cpu,
  CreditCard,
  GitBranch,
  Gauge,
  LineChart,
  PieChart,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Layers,
  Blocks,
  Settings,
  Zap,
  Lock,
  Plug,
  Rocket,
} from "lucide-react"
import "../premium.css"

// Provider integration logos
const INTEGRATION_LOGOS = [
  { name: "AWS", logo: "/logos/providers/aws.svg" },
  { name: "Google Cloud", logo: "/logos/providers/gcp.svg" },
  { name: "Azure", logo: "/logos/providers/azure.svg" },
  { name: "OpenAI", logo: "/logos/providers/openai.svg" },
  { name: "Anthropic", logo: "/logos/providers/anthropic.svg" },
  { name: "Slack", logo: "/logos/providers/slack.svg" },
]

export default function FeaturesPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section - Premium White */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Layers className="w-4 h-4" />
            Platform Features
          </div>
          <h1 className="ca-page-hero-title">
            Every Feature You Need to{" "}
            <span className="ca-hero-highlight-genai">Master</span> Your Costs
          </h1>
          <p className="ca-page-hero-subtitle">
            From GenAI tracking to multi-cloud analytics, CloudAct provides enterprise-grade
            cost intelligence for modern engineering teams. One platform, complete visibility.
          </p>
          <div className="ca-page-hero-actions">
            <Link href="/signup" className="ca-btn-hero-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn-hero-secondary">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Core Platform Pillars */}
      <section className="ca-pillars-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Blocks className="w-4 h-4" />
            Core Capabilities
          </span>
          <h2 className="ca-section-title">Three Pillars of Cost Intelligence</h2>
          <p className="ca-section-subtitle">
            Complete visibility across GenAI, cloud infrastructure, and SaaS subscriptions
          </p>
        </div>

        <div className="ca-pillars-grid">
          {/* GenAI Pillar */}
          <div className="ca-pillar-card ca-pillar-coral">
            <div className="ca-pillar-icon ca-pillar-icon-coral">
              <Cpu className="w-7 h-7" />
            </div>
            <h3 className="ca-pillar-title">GenAI Cost Intelligence</h3>
            <p className="ca-pillar-desc">
              Track every token, every model, every API call. Get real-time visibility into
              OpenAI, Anthropic, Google AI, and emerging LLM providers.
            </p>
            <ul className="ca-pillar-features">
              <li><CheckCircle2 className="w-4 h-4" /><span>Token-level tracking</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Multi-provider support</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Model cost comparison</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Usage anomaly alerts</span></li>
            </ul>
            <Link href="#genai" className="ca-pillar-link ca-pillar-link-coral">
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Cloud Pillar */}
          <div className="ca-pillar-card ca-pillar-blue">
            <div className="ca-pillar-icon ca-pillar-icon-blue">
              <Cloud className="w-7 h-7" />
            </div>
            <h3 className="ca-pillar-title">Multi-Cloud Management</h3>
            <p className="ca-pillar-desc">
              Unified view across AWS, Azure, and GCP. Automatic cost allocation,
              rightsizing recommendations, and reserved instance optimization.
            </p>
            <ul className="ca-pillar-features">
              <li><CheckCircle2 className="w-4 h-4" /><span>Cross-cloud dashboards</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Resource tagging</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Waste detection</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Budget forecasting</span></li>
            </ul>
            <Link href="#cloud" className="ca-pillar-link ca-pillar-link-blue">
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* SaaS Pillar */}
          <div className="ca-pillar-card ca-pillar-purple">
            <div className="ca-pillar-icon ca-pillar-icon-purple">
              <CreditCard className="w-7 h-7" />
            </div>
            <h3 className="ca-pillar-title">SaaS Subscription Tracking</h3>
            <p className="ca-pillar-desc">
              Never lose track of a subscription again. Monitor Slack, GitHub, Datadog,
              and 50+ SaaS tools with automatic renewal alerts.
            </p>
            <ul className="ca-pillar-features">
              <li><CheckCircle2 className="w-4 h-4" /><span>Auto-discovery</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>License optimization</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Renewal calendar</span></li>
              <li><CheckCircle2 className="w-4 h-4" /><span>Vendor benchmarking</span></li>
            </ul>
            <Link href="#saas" className="ca-pillar-link ca-pillar-link-purple">
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="ca-features-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Sparkles className="w-4 h-4" />
            All Features
          </span>
          <h2 className="ca-section-title">Everything you need to control costs</h2>
          <p className="ca-section-subtitle">
            Comprehensive toolset for visibility, optimization, and governance
          </p>
        </div>

        <div className="ca-features-grid-premium">
          <div className="ca-feature-card-premium ca-feature-mint">
            <div className="ca-feature-icon-premium ca-feature-icon-mint">
              <LineChart className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">Real-Time Dashboards</h3>
            <p className="ca-feature-desc-premium">
              Live cost tracking with customizable views for engineering, finance, and leadership teams.
            </p>
          </div>

          <div className="ca-feature-card-premium ca-feature-coral">
            <div className="ca-feature-icon-premium ca-feature-icon-coral">
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">AI Recommendations</h3>
            <p className="ca-feature-desc-premium">
              Machine learning identifies cost-saving opportunities. Get actionable insights on model selection and rightsizing.
            </p>
          </div>

          <div className="ca-feature-card-premium ca-feature-blue">
            <div className="ca-feature-icon-premium ca-feature-icon-blue">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">Smart Alerts</h3>
            <p className="ca-feature-desc-premium">
              Get notified instantly when spending exceeds thresholds or anomalies are detected.
            </p>
          </div>

          <div className="ca-feature-card-premium ca-feature-purple">
            <div className="ca-feature-icon-premium ca-feature-icon-purple">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">Budget Controls</h3>
            <p className="ca-feature-desc-premium">
              Set team-level budgets with automatic enforcement and approval workflows.
            </p>
          </div>

          <div className="ca-feature-card-premium ca-feature-mint">
            <div className="ca-feature-icon-premium ca-feature-icon-mint">
              <PieChart className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">Cost Allocation</h3>
            <p className="ca-feature-desc-premium">
              Tag and allocate costs by team, project, environment, or any custom dimension.
            </p>
          </div>

          <div className="ca-feature-card-premium ca-feature-coral">
            <div className="ca-feature-icon-premium ca-feature-icon-coral">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">Forecasting</h3>
            <p className="ca-feature-desc-premium">
              ML-powered forecasting predicts future spending with 95% accuracy.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="ca-how-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Settings className="w-4 h-4" />
            How It Works
          </span>
          <h2 className="ca-section-title">Up and running in minutes</h2>
          <p className="ca-section-subtitle">
            No complex setup or data migration. Start tracking costs immediately.
          </p>
        </div>

        <div className="ca-how-steps">
          <div className="ca-how-step">
            <div className="ca-how-number">01</div>
            <h3 className="ca-how-title">Connect Your Providers</h3>
            <p className="ca-how-desc">
              Link OpenAI, AWS, GCP, Azure, and SaaS tools in minutes with secure OAuth or API keys.
            </p>
          </div>
          <div className="ca-how-step">
            <div className="ca-how-number">02</div>
            <h3 className="ca-how-title">Automatic Data Sync</h3>
            <p className="ca-how-desc">
              CloudAct pulls usage and billing data every 5 minutes. No manual exports needed.
            </p>
          </div>
          <div className="ca-how-step">
            <div className="ca-how-number">03</div>
            <h3 className="ca-how-title">Get Instant Insights</h3>
            <p className="ca-how-desc">
              View real-time dashboards, receive AI recommendations, and set alerts from day one.
            </p>
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="ca-collab-section ca-section-gray">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Lock className="w-4 h-4" />
            Enterprise Ready
          </span>
          <h2 className="ca-section-title">Security & Scale You Can Trust</h2>
          <p className="ca-section-subtitle">
            Built for teams that demand enterprise-grade reliability and compliance
          </p>
        </div>

        <div className="ca-collab-grid">
          <div className="ca-collab-card ca-collab-mint">
            <h3 className="ca-collab-card-title">Enterprise Security</h3>
            <p className="ca-collab-card-desc">
              SOC 2 Type II certified with GDPR compliance. SSO/SAML, audit logs, and encryption.
            </p>
            <span className="ca-collab-link ca-collab-link-mint">
              <Shield className="w-4 h-4" /> SOC 2 Type II
            </span>
          </div>

          <div className="ca-collab-card ca-collab-coral">
            <h3 className="ca-collab-card-title">99.99% Uptime SLA</h3>
            <p className="ca-collab-card-desc">
              Mission-critical reliability with dedicated support. Multi-region deployment.
            </p>
            <span className="ca-collab-link ca-collab-link-coral">
              <Gauge className="w-4 h-4" /> Enterprise SLA
            </span>
          </div>

          <div className="ca-collab-card ca-collab-blue">
            <h3 className="ca-collab-card-title">Team Collaboration</h3>
            <p className="ca-collab-card-desc">
              Role-based access control, shared dashboards, and team budgets.
            </p>
            <span className="ca-collab-link ca-collab-link-blue">
              <Users className="w-4 h-4" /> RBAC included
            </span>
          </div>

          <div className="ca-collab-card ca-collab-purple">
            <h3 className="ca-collab-card-title">Developer-First API</h3>
            <p className="ca-collab-card-desc">
              RESTful API with comprehensive SDKs. Integrate with your CI/CD workflows.
            </p>
            <span className="ca-collab-link ca-collab-link-purple">
              <GitBranch className="w-4 h-4" /> Full API access
            </span>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="ca-integrations-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Plug className="w-4 h-4" />
            Integrations
          </span>
          <h2 className="ca-section-title">Connect your entire stack</h2>
          <p className="ca-section-subtitle">
            50+ integrations with the tools you already use. Set up in minutes.
          </p>
        </div>

        <div className="ca-integrations-grid">
          {INTEGRATION_LOGOS.map((integration) => (
            <div key={integration.name} className="ca-integration-logo">
              <Image
                src={integration.logo}
                alt={integration.name}
                width={100}
                height={40}
                className="ca-integration-img"
              />
            </div>
          ))}
        </div>

        <div className="ca-integrations-cta">
          <Link href="/integrations" className="ca-btn-outline-dark">
            View all integrations
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Sparkles className="w-4 h-4" />
            14-day free trial • No credit card required
          </div>
          <h2 className="ca-final-cta-title">Ready to Master Your Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Join hundreds of teams using CloudAct to track, analyze, and optimize their
            GenAI, cloud, and SaaS spending.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/pricing" className="ca-btn-cta-secondary">
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
