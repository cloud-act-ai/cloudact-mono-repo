"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Zap,
  TrendingDown,
  Shield,
  Cpu,
  Globe,
  Layers,
  LineChart,
  Bell,
  Sparkles,
  Activity,
  ArrowUpRight,
  Play,
  Loader2,
  BarChart3,
  DollarSign,
  Users,
  Lock,
  Award,
  CheckCircle2,
  Star,
  Quote,
  Cloud,
  CreditCard,
  PieChart,
  Target,
  Gauge,
  FileText,
  Building2,
} from "lucide-react"
import "./premium.css"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"

// ============================================
// ENTERPRISE CUSTOMER LOGOS
// ============================================
const CUSTOMER_LOGOS = [
  { name: "TechCorp", initials: "TC" },
  { name: "DataScale", initials: "DS" },
  { name: "CloudFirst", initials: "CF" },
  { name: "AIVentures", initials: "AV" },
  { name: "FinanceHub", initials: "FH" },
  { name: "DevOpsLab", initials: "DL" },
]

// Provider integration logos
const INTEGRATION_LOGOS = [
  { name: "OpenAI", logo: "/logos/providers/openai.svg", category: "genai" },
  { name: "Anthropic", logo: "/logos/providers/anthropic.svg", category: "genai" },
  { name: "AWS", logo: "/logos/providers/aws.svg", category: "cloud" },
  { name: "GCP", logo: "/logos/providers/gcp.svg", category: "cloud" },
  { name: "Azure", logo: "/logos/providers/azure.svg", category: "cloud" },
  { name: "Slack", logo: "/logos/providers/slack.svg", category: "saas" },
  { name: "GitHub", logo: "/logos/providers/github.svg", category: "saas" },
  { name: "Notion", logo: "/logos/providers/notion.svg", category: "saas" },
  { name: "Figma", logo: "/logos/providers/figma.svg", category: "saas" },
  { name: "Linear", logo: "/logos/providers/linear.svg", category: "saas" },
  { name: "Gemini", logo: "/logos/providers/gemini.svg", category: "genai" },
  { name: "Cursor", logo: "/logos/providers/cursor.svg", category: "genai" },
]

// ============================================
// HERO SECTION
// ============================================
function HeroSection() {
  return (
    <section className="ca-hero-premium">
      {/* Subtle background gradient */}
      <div className="ca-hero-bg-gradient" />

      <div className="ca-hero-container">
        {/* Left content */}
        <div className="ca-hero-content-left">
          {/* G2 / Trust Badge */}
          <div className="ca-trust-badge-hero">
            <div className="ca-trust-badge-stars">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="ca-trust-badge-text">Rated #1 for GenAI Cost Management</span>
          </div>

          {/* Main headline */}
          <h1 className="ca-hero-headline">
            The Modern FinOps Platform for{" "}
            <span className="ca-hero-highlight-genai">GenAI</span>,{" "}
            <span className="ca-hero-highlight-cloud">Cloud</span> &{" "}
            <span className="ca-hero-highlight-saas">SaaS</span>
          </h1>

          {/* Subheadline */}
          <p className="ca-hero-subheadline">
            Complete visibility into every dollar spent across OpenAI, Anthropic, AWS, Azure, GCP,
            and 50+ SaaS tools. Built for engineering teams who demand real-time cost intelligence.
          </p>

          {/* CTA buttons */}
          <div className="ca-hero-cta-group">
            <Link href="/signup" className="ca-btn-hero-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn-hero-secondary">
              <Play className="w-5 h-5" />
              Watch Demo
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="ca-hero-trust-row">
            <div className="ca-hero-trust-item">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>SOC 2 Type II</span>
            </div>
            <div className="ca-hero-trust-divider" />
            <div className="ca-hero-trust-item">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>5-min setup</span>
            </div>
            <div className="ca-hero-trust-divider" />
            <div className="ca-hero-trust-item">
              <TrendingDown className="w-4 h-4 text-emerald-600" />
              <span>20%+ avg savings</span>
            </div>
          </div>
        </div>

        {/* Right - Dashboard preview */}
        <div className="ca-hero-visual">
          <DashboardPreview />
        </div>
      </div>
    </section>
  )
}

// ============================================
// DASHBOARD PREVIEW COMPONENT
// ============================================
function DashboardPreview() {
  return (
    <div className="ca-dashboard-mockup">
      {/* Browser chrome */}
      <div className="ca-dashboard-chrome">
        <div className="ca-chrome-dots">
          <span className="ca-chrome-dot ca-chrome-dot-red" />
          <span className="ca-chrome-dot ca-chrome-dot-yellow" />
          <span className="ca-chrome-dot ca-chrome-dot-green" />
        </div>
        <div className="ca-chrome-url">cloudact.ai/dashboard</div>
      </div>

      {/* Dashboard content */}
      <div className="ca-dashboard-body">
        {/* Metric cards row */}
        <div className="ca-dash-metrics">
          <div className="ca-dash-metric">
            <span className="ca-dash-metric-label">Total Spend</span>
            <span className="ca-dash-metric-value">$47.2K</span>
            <span className="ca-dash-metric-change ca-dash-metric-down">
              <TrendingDown className="w-3 h-3" /> -12%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-coral">
            <span className="ca-dash-metric-label">GenAI Costs</span>
            <span className="ca-dash-metric-value">$12.8K</span>
            <span className="ca-dash-metric-change ca-dash-metric-up">
              <Activity className="w-3 h-3" /> +23%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-blue">
            <span className="ca-dash-metric-label">Cloud Infra</span>
            <span className="ca-dash-metric-value">$28.1K</span>
            <span className="ca-dash-metric-change ca-dash-metric-down">
              <TrendingDown className="w-3 h-3" /> -8%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-mint">
            <span className="ca-dash-metric-label">Savings Found</span>
            <span className="ca-dash-metric-value">$8.4K</span>
            <span className="ca-dash-metric-badge">
              <Sparkles className="w-3 h-3" /> AI
            </span>
          </div>
        </div>

        {/* Chart area */}
        <div className="ca-dash-chart">
          <div className="ca-dash-chart-header">
            <span>Cost Trend (30 Days)</span>
            <div className="ca-dash-chart-legend">
              <span className="ca-legend-item"><span className="ca-legend-dot ca-legend-coral" />GenAI</span>
              <span className="ca-legend-item"><span className="ca-legend-dot ca-legend-blue" />Cloud</span>
              <span className="ca-legend-item"><span className="ca-legend-dot ca-legend-purple" />SaaS</span>
            </div>
          </div>
          <div className="ca-dash-chart-bars">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="ca-chart-bar-stack">
                <div className="ca-bar ca-bar-purple" style={{ height: `${15 + Math.random() * 15}%` }} />
                <div className="ca-bar ca-bar-blue" style={{ height: `${25 + Math.random() * 20}%` }} />
                <div className="ca-bar ca-bar-coral" style={{ height: `${15 + Math.random() * 15}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// CUSTOMER LOGOS SECTION
// ============================================
function CustomerLogosSection() {
  return (
    <section className="ca-customers-section">
      <p className="ca-customers-label">Trusted by innovative teams worldwide</p>
      <div className="ca-customers-grid">
        {CUSTOMER_LOGOS.map((customer) => (
          <div key={customer.name} className="ca-customer-logo">
            <span className="ca-customer-initials">{customer.initials}</span>
            <span className="ca-customer-name">{customer.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// STATS SECTION
// ============================================
function StatsSection() {
  const stats = [
    { value: "$50M+", label: "Cloud spend managed", icon: DollarSign },
    { value: "50+", label: "Integrations", icon: Layers },
    { value: "20%", label: "Average savings", icon: TrendingDown },
    { value: "99.9%", label: "Platform uptime", icon: Activity },
  ]

  return (
    <section className="ca-stats-section-premium">
      <div className="ca-stats-container">
        {stats.map((stat, i) => (
          <div key={i} className="ca-stat-card">
            <div className="ca-stat-icon-wrap">
              <stat.icon className="w-6 h-6" />
            </div>
            <div className="ca-stat-value">{stat.value}</div>
            <div className="ca-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// PLATFORM PILLARS SECTION
// ============================================
function PlatformPillarsSection() {
  const pillars = [
    {
      id: "genai",
      icon: Cpu,
      title: "GenAI Cost Intelligence",
      description: "Track every token, every model, every API call. Get real-time visibility into OpenAI, Anthropic, Google AI, and emerging LLM providers.",
      color: "coral",
      features: ["Token-level tracking", "Model cost comparison", "Usage anomaly alerts", "Team attribution"],
    },
    {
      id: "cloud",
      icon: Cloud,
      title: "Multi-Cloud Management",
      description: "Unified view across AWS, Azure, and GCP. Automatic cost allocation, rightsizing recommendations, and reserved instance optimization.",
      color: "blue",
      features: ["Cross-cloud dashboards", "Resource tagging", "Waste detection", "Budget forecasting"],
    },
    {
      id: "saas",
      icon: CreditCard,
      title: "SaaS Subscription Tracking",
      description: "Never lose track of a subscription again. Monitor Slack, GitHub, Datadog, and 50+ SaaS tools with automatic renewal alerts.",
      color: "purple",
      features: ["Auto-discovery", "License optimization", "Renewal calendar", "Vendor benchmarking"],
    },
  ]

  return (
    <section className="ca-pillars-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">The Platform</span>
        <h2 className="ca-section-title">One platform for all your cost intelligence</h2>
        <p className="ca-section-subtitle">
          Stop juggling multiple tools. CloudAct unifies GenAI, cloud infrastructure, and SaaS
          spending into a single source of truth for your entire organization.
        </p>
      </div>

      <div className="ca-pillars-grid">
        {pillars.map((pillar) => (
          <div key={pillar.id} className={`ca-pillar-card ca-pillar-${pillar.color}`}>
            <div className={`ca-pillar-icon ca-pillar-icon-${pillar.color}`}>
              <pillar.icon className="w-7 h-7" />
            </div>
            <h3 className="ca-pillar-title">{pillar.title}</h3>
            <p className="ca-pillar-desc">{pillar.description}</p>
            <ul className="ca-pillar-features">
              {pillar.features.map((feature, i) => (
                <li key={i}>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link href={`/features#${pillar.id}`} className={`ca-pillar-link ca-pillar-link-${pillar.color}`}>
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// FEATURES SECTION
// ============================================
function FeaturesSection() {
  const features = [
    {
      icon: LineChart,
      title: "Real-Time Dashboards",
      description: "Live cost tracking with customizable views for engineering, finance, and leadership teams.",
      color: "mint",
    },
    {
      icon: Sparkles,
      title: "AI Recommendations",
      description: "Automated suggestions to optimize model selection, rightsize instances, and eliminate waste.",
      color: "coral",
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description: "Get notified instantly when spending exceeds thresholds or anomalies are detected.",
      color: "blue",
    },
    {
      icon: Target,
      title: "Budget Controls",
      description: "Set team-level budgets with automatic enforcement and approval workflows.",
      color: "purple",
    },
    {
      icon: PieChart,
      title: "Cost Allocation",
      description: "Tag and allocate costs by team, project, environment, or any custom dimension.",
      color: "mint",
    },
    {
      icon: FileText,
      title: "Reporting & Exports",
      description: "Generate executive reports, compliance documentation, and custom CSV exports.",
      color: "coral",
    },
  ]

  return (
    <section className="ca-features-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">Features</span>
        <h2 className="ca-section-title">Everything you need to control costs</h2>
        <p className="ca-section-subtitle">
          From real-time tracking to AI-powered optimization, get complete visibility and control.
        </p>
      </div>

      <div className="ca-features-grid-premium">
        {features.map((feature, i) => (
          <div key={i} className={`ca-feature-card-premium ca-feature-${feature.color}`}>
            <div className={`ca-feature-icon-premium ca-feature-icon-${feature.color}`}>
              <feature.icon className="w-6 h-6" />
            </div>
            <h3 className="ca-feature-title-premium">{feature.title}</h3>
            <p className="ca-feature-desc-premium">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// HOW IT WORKS SECTION
// ============================================
function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Connect Your Tools",
      description: "Link your cloud providers, GenAI APIs, and SaaS subscriptions with secure, read-only access.",
    },
    {
      number: "02",
      title: "See Your Costs",
      description: "Get a unified dashboard showing all spending with automatic categorization and trends.",
    },
    {
      number: "03",
      title: "Optimize & Save",
      description: "Receive AI-powered recommendations to reduce waste and optimize your infrastructure.",
    },
  ]

  return (
    <section className="ca-how-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">How It Works</span>
        <h2 className="ca-section-title">Get started in 3 simple steps</h2>
      </div>

      <div className="ca-how-steps">
        {steps.map((step, i) => (
          <div key={i} className="ca-how-step">
            <div className="ca-how-number">{step.number}</div>
            <h3 className="ca-how-title">{step.title}</h3>
            <p className="ca-how-desc">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// INTEGRATIONS SECTION
// ============================================
function IntegrationsSection() {
  return (
    <section className="ca-integrations-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">Integrations</span>
        <h2 className="ca-section-title">Connect your entire stack</h2>
        <p className="ca-section-subtitle">
          50+ integrations with the tools you already use. Set up in minutes, not days.
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
  )
}

// ============================================
// TESTIMONIALS SECTION
// ============================================
const TESTIMONIALS = [
  {
    quote: "CloudAct gave us complete visibility into our GenAI spending. We identified $40K in monthly savings within the first week.",
    author: "Sarah Chen",
    role: "VP of Engineering",
    company: "TechScale Inc.",
    avatar: "SC",
    metric: "$40K saved/month",
  },
  {
    quote: "Finally, one dashboard for all our cloud and AI costs. Our FinOps team went from spending days on reports to having real-time insights.",
    author: "Marcus Rodriguez",
    role: "Director of FinOps",
    company: "DataFirst Corp",
    avatar: "MR",
    metric: "80% time saved",
  },
  {
    quote: "The AI recommendations alone paid for the platform 10x over. CloudAct is essential for any team using LLMs at scale.",
    author: "Emily Watson",
    role: "CTO",
    company: "AI Ventures",
    avatar: "EW",
    metric: "10x ROI",
  },
]

function TestimonialsSection() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % TESTIMONIALS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="ca-testimonials-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">Customer Stories</span>
        <h2 className="ca-section-title">Trusted by FinOps leaders</h2>
      </div>

      <div className="ca-testimonial-container">
        <div className="ca-testimonial-card-premium">
          <Quote className="ca-testimonial-quote-icon" />
          <p className="ca-testimonial-text">{TESTIMONIALS[active].quote}</p>
          <div className="ca-testimonial-footer">
            <div className="ca-testimonial-avatar">{TESTIMONIALS[active].avatar}</div>
            <div className="ca-testimonial-info">
              <div className="ca-testimonial-author">{TESTIMONIALS[active].author}</div>
              <div className="ca-testimonial-role">{TESTIMONIALS[active].role}, {TESTIMONIALS[active].company}</div>
            </div>
            <div className="ca-testimonial-metric">{TESTIMONIALS[active].metric}</div>
          </div>
        </div>

        <div className="ca-testimonial-nav">
          <button
            onClick={() => setActive((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            className="ca-testimonial-nav-btn"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="ca-testimonial-dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`ca-testimonial-dot ${i === active ? "active" : ""}`}
                aria-label={`Testimonial ${i + 1}`}
              />
            ))}
          </div>
          <button
            onClick={() => setActive((prev) => (prev + 1) % TESTIMONIALS.length)}
            className="ca-testimonial-nav-btn"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  )
}

// ============================================
// SECURITY SECTION
// ============================================
function SecuritySection() {
  const badges = [
    { icon: Shield, label: "SOC 2 Type II", description: "Certified" },
    { icon: Lock, label: "GDPR", description: "Compliant" },
    { icon: Award, label: "ISO 27001", description: "Certified" },
    { icon: CheckCircle2, label: "CCPA", description: "Compliant" },
  ]

  return (
    <section className="ca-security-section">
      <div className="ca-security-container">
        <div className="ca-security-content">
          <span className="ca-section-eyebrow">Enterprise Security</span>
          <h2 className="ca-security-title">Built for enterprise-grade security</h2>
          <p className="ca-security-desc">
            Your data security is our top priority. CloudAct is built with bank-grade encryption,
            role-based access controls, and comprehensive audit logging.
          </p>
          <Link href="/security" className="ca-btn-outline-dark">
            Learn about our security
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="ca-security-badges">
          {badges.map((badge, i) => (
            <div key={i} className="ca-security-badge">
              <badge.icon className="w-8 h-8" />
              <div className="ca-badge-label">{badge.label}</div>
              <div className="ca-badge-desc">{badge.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// PRICING PREVIEW SECTION
// ============================================
function PricingPreviewSection() {
  const [plans, setPlans] = useState<DynamicPlan[]>([])
  const [loading, setLoading] = useState(true)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const result = await getStripePlans()
    if (result.data) {
      setPlans(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  return (
    <section className="ca-pricing-preview-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">Pricing</span>
        <h2 className="ca-section-title">Simple, transparent pricing</h2>
        <p className="ca-section-subtitle">
          Start free, scale as you grow. No hidden fees, no surprise charges.
        </p>
      </div>

      <div className="ca-pricing-grid-premium">
        {loading ? (
          <div className="ca-pricing-loading">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : plans.length > 0 ? (
          <>
            {plans.map((plan, i) => (
              <div key={plan.id} className={`ca-pricing-card-premium ${i === 1 ? "ca-pricing-featured" : ""}`}>
                {i === 1 && <div className="ca-pricing-badge">Most Popular</div>}
                <div className="ca-pricing-header">
                  <h3 className="ca-pricing-name">{plan.name}</h3>
                  <div className="ca-pricing-price">
                    <span className="ca-pricing-amount">${plan.price}</span>
                    <span className="ca-pricing-period">/{plan.interval === "year" ? "yr" : "mo"}</span>
                  </div>
                </div>
                <ul className="ca-pricing-features">
                  {plan.features.map((feature, j) => (
                    <li key={j}>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={i === 1 ? "ca-btn-pricing-primary" : "ca-btn-pricing-secondary"}
                >
                  Get started
                </Link>
              </div>
            ))}
            <div className="ca-pricing-card-premium ca-pricing-enterprise">
              <div className="ca-pricing-header">
                <h3 className="ca-pricing-name">Enterprise</h3>
                <div className="ca-pricing-price">
                  <span className="ca-pricing-amount">Custom</span>
                </div>
              </div>
              <ul className="ca-pricing-features">
                <li><Check className="w-4 h-4 text-emerald-500" /><span>Unlimited team members</span></li>
                <li><Check className="w-4 h-4 text-emerald-500" /><span>Unlimited integrations</span></li>
                <li><Check className="w-4 h-4 text-emerald-500" /><span>SSO & SCIM</span></li>
                <li><Check className="w-4 h-4 text-emerald-500" /><span>Dedicated success manager</span></li>
                <li><Check className="w-4 h-4 text-emerald-500" /><span>Custom SLAs</span></li>
              </ul>
              <Link href="/contact" className="ca-btn-pricing-secondary">
                Contact sales
              </Link>
            </div>
          </>
        ) : (
          <div className="ca-pricing-placeholder">
            <p>Contact us for pricing information</p>
          </div>
        )}
      </div>

      <div className="ca-pricing-cta-row">
        <Link href="/pricing" className="ca-link-dark">
          View full pricing details <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}

// ============================================
// FINAL CTA SECTION
// ============================================
function FinalCTASection() {
  return (
    <section className="ca-final-cta-section">
      <div className="ca-final-cta-container">
        <div className="ca-final-cta-badge">
          <Sparkles className="w-4 h-4" />
          {DEFAULT_TRIAL_DAYS}-day free trial • No credit card required
        </div>
        <h2 className="ca-final-cta-title">Ready to take control of your costs?</h2>
        <p className="ca-final-cta-subtitle">
          Join hundreds of teams using CloudAct to track, analyze, and optimize their
          GenAI, cloud, and SaaS spending.
        </p>
        <div className="ca-final-cta-buttons">
          <Link href="/signup" className="ca-btn-cta-primary">
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/contact" className="ca-btn-cta-secondary">
            Talk to Sales
            <ArrowUpRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================
export default function PremiumLandingPage() {
  return (
    <div className="ca-landing-page">
      <HeroSection />
      <CustomerLogosSection />
      <StatsSection />
      <PlatformPillarsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <TestimonialsSection />
      <SecuritySection />
      <PricingPreviewSection />
      <FinalCTASection />
    </div>
  )
}
