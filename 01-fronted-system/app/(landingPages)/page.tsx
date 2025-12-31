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
  Layers,
  LineChart,
  Bell,
  Sparkles,
  ArrowUpRight,
  Play,
  DollarSign,
  Users,
  CheckCircle2,
  Star,
  Quote,
  Cloud,
  CreditCard,
  PieChart,
  Target,
  Gauge,
  Activity,
  Award,
  FileText,
  Loader2,
  Blocks,
  Settings,
  Plug,
  MessageSquare,
  Rocket,
  X,
} from "lucide-react"
import "./premium.css"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"

// ============================================
// HOME PAGE ANNOUNCEMENT BANNER
// ============================================
function HomeAnnouncementBanner({
  isVisible,
  onClose
}: {
  isVisible: boolean
  onClose: () => void
}) {
  if (!isVisible) return null

  return (
    <div className="ca-home-announcement">
      <div className="ca-home-announcement-inner">
        <div className="ca-home-announcement-content">
          <span className="ca-home-announcement-badge">New</span>
          <span className="ca-home-announcement-text">
            Introducing AI-Powered Cost Anomaly Detection — Catch overspend before it happens
          </span>
          <Link href="/features#alerts" className="ca-home-announcement-link">
            Learn more <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ca-home-announcement-close"
          aria-label="Close announcement"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// INDUSTRY BADGES (More credible than fake company logos)
// ============================================
const INDUSTRY_BADGES = [
  { label: "500+", sublabel: "Engineering Teams" },
  { label: "$100M+", sublabel: "Cloud Spend Managed" },
  { label: "50+", sublabel: "Enterprise Customers" },
  { label: "15+", sublabel: "Countries" },
]

// Provider integrations - expanded list with categories
const INTEGRATION_CATEGORIES = [
  {
    title: "Cloud Providers",
    icon: Cloud,
    providers: [
      { name: "AWS", logo: "/logos/providers/aws.svg" },
      { name: "Google Cloud", logo: "/logos/providers/gcp.svg" },
      { name: "Microsoft Azure", logo: "/logos/providers/azure.svg" },
    ],
  },
  {
    title: "GenAI Platforms",
    icon: Cpu,
    providers: [
      { name: "OpenAI", logo: "/logos/providers/openai.svg" },
      { name: "Anthropic", logo: "/logos/providers/anthropic.svg" },
      { name: "Gemini", logo: "/logos/providers/gemini.svg" },
      { name: "Perplexity", logo: "/logos/providers/perplexity.svg" },
    ],
  },
  {
    title: "SaaS & DevTools",
    icon: Layers,
    providers: [
      { name: "Slack", logo: "/logos/providers/slack.svg" },
      { name: "GitHub", logo: "/logos/providers/github.svg" },
      { name: "Notion", logo: "/logos/providers/notion.svg" },
      { name: "Jira", logo: "/logos/providers/jira.svg" },
    ],
  },
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
          {/* Main headline */}
          <h1 className="ca-hero-headline">
            The Modern FinOps Platform for{" "}
            <span className="ca-hero-highlight-genai">GenAI</span>,{" "}
            <span className="ca-hero-highlight-cloud">Cloud</span> &{" "}
            <span className="ca-hero-highlight-saas">SaaS</span>
          </h1>

          {/* Subheadline */}
          <p className="ca-hero-subheadline">
            Multi-cloud and enterprise-ready, CloudAct.ai gives Finance, Engineering, and FinOps teams
            a shared system of record for managing spend so you can align on budgets, act on insights,
            and scale with control.
          </p>

          {/* CTA buttons */}
          <div className="ca-hero-cta-group">
            <Link href="/signup" className="ca-btn-hero-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn-hero-secondary">
              <Play className="w-5 h-5" />
              Book a Demo
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="ca-hero-trust-row">
            <div className="ca-hero-trust-item">
              <Zap className="w-4 h-4 ca-icon-coral" />
              <span>5-min setup</span>
            </div>
            <div className="ca-hero-trust-divider" />
            <div className="ca-hero-trust-item">
              <TrendingDown className="w-4 h-4 ca-icon-mint" />
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
// Pre-generated bar heights to avoid hydration mismatch (server/client must match)
const CHART_BAR_DATA = [
  { purple: 22, blue: 35, coral: 18 },
  { purple: 19, blue: 42, coral: 21 },
  { purple: 26, blue: 31, coral: 16 },
  { purple: 18, blue: 38, coral: 24 },
  { purple: 24, blue: 29, coral: 19 },
  { purple: 21, blue: 44, coral: 17 },
  { purple: 28, blue: 33, coral: 22 },
  { purple: 17, blue: 40, coral: 20 },
  { purple: 23, blue: 36, coral: 15 },
  { purple: 25, blue: 32, coral: 23 },
  { purple: 20, blue: 41, coral: 18 },
  { purple: 27, blue: 30, coral: 21 },
  { purple: 16, blue: 43, coral: 19 },
  { purple: 22, blue: 37, coral: 16 },
  { purple: 29, blue: 34, coral: 24 },
  { purple: 18, blue: 39, coral: 20 },
  { purple: 24, blue: 31, coral: 17 },
  { purple: 21, blue: 45, coral: 22 },
  { purple: 26, blue: 33, coral: 15 },
  { purple: 19, blue: 38, coral: 23 },
]

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
            {CHART_BAR_DATA.map((bar, i) => (
              <div key={i} className="ca-chart-bar-stack">
                <div className="ca-bar ca-bar-purple" style={{ height: `${bar.purple}%` }} />
                <div className="ca-bar ca-bar-blue" style={{ height: `${bar.blue}%` }} />
                <div className="ca-bar ca-bar-coral" style={{ height: `${bar.coral}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// TRUSTED BY SECTION (Credibility bar)
// ============================================
function TrustedBySection() {
  return (
    <section className="ca-credibility-section">
      <div className="ca-credibility-container">
        {/* Stats row */}
        <div className="ca-credibility-stats">
          {INDUSTRY_BADGES.map((badge, i) => (
            <div key={i} className="ca-credibility-stat">
              <span className="ca-credibility-value">{badge.label}</span>
              <span className="ca-credibility-label">{badge.sublabel}</span>
            </div>
          ))}
        </div>

        {/* Partner badges */}
        <div className="ca-partner-badges">
          <div className="ca-partner-badge">
            <Award className="w-4 h-4" />
            <span>FinOps Certified</span>
          </div>
          <div className="ca-partner-badge">
            <Cloud className="w-4 h-4" />
            <span>Multi-Cloud Ready</span>
          </div>
        </div>
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
// COLLABORATION SECTION (Clean minimal design)
// ============================================
function CollaborationSection() {
  const personas = [
    {
      title: "FinOps Teams",
      description: "Standardize reporting using FOCUS-compliant billing data.",
      color: "coral",
      link: "/solutions#finops",
    },
    {
      title: "Engineering",
      description: "Eliminate waste faster with tailored recommendations.",
      color: "blue",
      link: "/solutions#engineering",
    },
    {
      title: "Finance",
      description: "Reduce budget variance with cost visibility and forecasting.",
      color: "purple",
      link: "/solutions#finance",
    },
    {
      title: "MSPs & Partners",
      description: "Deliver higher client ROI through proactive optimization.",
      color: "mint",
      link: "/solutions#partners",
    },
  ]

  return (
    <section className="ca-collab-section">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <Users className="w-4 h-4" />
          Teams
        </span>
        <h2 className="ca-collab-title">Collaboration that delivers results</h2>
      </div>
      <div className="ca-collab-grid">
        {personas.map((persona, i) => (
          <Link key={i} href={persona.link} className={`ca-collab-card ca-collab-${persona.color}`}>
            <h3 className="ca-collab-card-title">{persona.title}</h3>
            <p className="ca-collab-card-desc">{persona.description}</p>
            <span className={`ca-collab-link ca-collab-link-${persona.color}`}>
              Learn more <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ============================================
// RATING SECTION (moved from hero)
// ============================================
function RatingSection() {
  return (
    <section className="ca-rating-section">
      <div className="ca-rating-container">
        <div className="ca-rating-content">
          <span className="ca-section-eyebrow">
            <Award className="w-4 h-4" />
            Recognition
          </span>
          <div className="ca-rating-stars">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 ca-star-filled" />
            ))}
          </div>
          <span className="ca-rating-text">Rated #1 for GenAI Cost Management on G2</span>
        </div>
        <div className="ca-rating-badges">
          <div className="ca-rating-badge">
            <span className="ca-rating-badge-value">4.9/5</span>
            <span className="ca-rating-badge-label">G2 Rating</span>
          </div>
          <div className="ca-rating-badge">
            <span className="ca-rating-badge-value">500+</span>
            <span className="ca-rating-badge-label">Reviews</span>
          </div>
          <div className="ca-rating-badge">
            <span className="ca-rating-badge-value">Leader</span>
            <span className="ca-rating-badge-label">FinOps 2025</span>
          </div>
        </div>
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
        <span className="ca-section-eyebrow">
          <Blocks className="w-4 h-4" />
          The Platform
        </span>
        <h2 className="ca-section-title">One platform for all your cost intelligence</h2>
        <p className="ca-section-subtitle">
          Stop juggling multiple tools. CloudAct.ai unifies GenAI, cloud infrastructure, and SaaS
          spending into a single source of truth for your entire organization.
        </p>
      </div>

      <div className="ca-pillars-grid">
        {pillars.map((pillar) => (
          <div key={pillar.id} className={`ca-pillar-card ca-pillar-${pillar.color}`}>
            <div className="ca-pillar-header">
              <div className={`ca-pillar-icon ca-pillar-icon-${pillar.color}`}>
                <pillar.icon className="w-5 h-5" />
              </div>
              <h3 className="ca-pillar-title">{pillar.title}</h3>
            </div>
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
        <span className="ca-section-eyebrow">
          <Sparkles className="w-4 h-4" />
          Features
        </span>
        <h2 className="ca-section-title">Everything you need to control costs</h2>
        <p className="ca-section-subtitle">
          From real-time tracking to AI-powered optimization, get complete visibility and control.
        </p>
      </div>

      <div className="ca-features-grid-premium">
        {features.map((feature, i) => (
          <div key={i} className={`ca-feature-card-premium ca-feature-${feature.color}`}>
            <div className="ca-feature-header-premium">
              <div className={`ca-feature-icon-premium ca-feature-icon-${feature.color}`}>
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="ca-feature-title-premium">{feature.title}</h3>
            </div>
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
        <span className="ca-section-eyebrow">
          <Settings className="w-4 h-4" />
          How It Works
        </span>
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
        <span className="ca-section-eyebrow">
          <Plug className="w-4 h-4" />
          Integrations
        </span>
        <h2 className="ca-section-title">Connect your entire stack</h2>
        <p className="ca-section-subtitle">
          50+ integrations with the tools you already use. Set up in minutes.
        </p>
      </div>

      <div className="ca-integrations-categories">
        {INTEGRATION_CATEGORIES.map((category) => (
          <div key={category.title} className="ca-integration-category">
            <div className="ca-integration-category-header">
              <category.icon className="w-5 h-5" />
              <h3>{category.title}</h3>
            </div>
            <div className="ca-integration-logos-row">
              {category.providers.map((provider) => (
                <div key={provider.name} className="ca-integration-logo-compact">
                  <Image
                    src={provider.logo}
                    alt={provider.name}
                    width={80}
                    height={32}
                    className="ca-integration-img"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ca-integrations-cta">
        <Link href="/integrations" className="ca-btn-outline-dark">
          View all 50+ integrations
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
    quote: "CloudAct.ai gave us complete visibility into our GenAI spending. We identified $40K in monthly savings within the first week.",
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
    quote: "The AI recommendations alone paid for the platform 10x over. CloudAct.ai is essential for any team using LLMs at scale.",
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
        <span className="ca-section-eyebrow">
          <MessageSquare className="w-4 h-4" />
          Customer Stories
        </span>
        <h2 className="ca-section-title">Trusted by FinOps leaders</h2>
      </div>

      <div className="ca-testimonial-container">
        <div className="ca-testimonial-card-premium" role="region" aria-live="polite" aria-atomic="true">
          <Quote className="ca-testimonial-quote-icon" aria-hidden="true" />
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

        <div className="ca-testimonial-nav" role="group" aria-label="Testimonial navigation">
          <button
            type="button"
            onClick={() => setActive((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            className="ca-testimonial-nav-btn"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="ca-testimonial-dots" role="tablist" aria-label="Testimonials">
            {TESTIMONIALS.map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setActive(i)}
                className={`ca-testimonial-dot ${i === active ? "active" : ""}`}
                role="tab"
                aria-selected={i === active}
                aria-label={`View testimonial ${i + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setActive((prev) => (prev + 1) % TESTIMONIALS.length)}
            className="ca-testimonial-nav-btn"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
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
        <span className="ca-section-eyebrow">
          <DollarSign className="w-4 h-4" />
          Pricing
        </span>
        <h2 className="ca-section-title">Simple, transparent pricing</h2>
        <p className="ca-section-subtitle">
          Start free, scale as you grow. No hidden fees, no surprise charges.
        </p>
      </div>

      <div className="ca-pricing-grid-premium">
        {loading ? (
          <div className="ca-pricing-loading" role="status" aria-label="Loading pricing plans">
            <Loader2 className="w-8 h-8 animate-spin ca-icon-mint" />
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
                      <Check className="w-4 h-4 ca-icon-mint" />
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
                <li><Check className="w-4 h-4 ca-icon-mint" /><span>Unlimited team members</span></li>
                <li><Check className="w-4 h-4 ca-icon-mint" /><span>Unlimited integrations</span></li>
                <li><Check className="w-4 h-4 ca-icon-mint" /><span>SSO & SCIM</span></li>
                <li><Check className="w-4 h-4 ca-icon-mint" /><span>Dedicated success manager</span></li>
                <li><Check className="w-4 h-4 ca-icon-mint" /><span>Custom SLAs</span></li>
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
          Join hundreds of teams using CloudAct.ai to track, analyze, and optimize their
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
  const [bannerVisible, setBannerVisible] = useState(true)

  return (
    <div className="ca-landing-page">
      <HomeAnnouncementBanner isVisible={bannerVisible} onClose={() => setBannerVisible(false)} />
      <HeroSection />
      <TrustedBySection />
      <IntegrationsSection />
      <CollaborationSection />
      <RatingSection />
      <PlatformPillarsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingPreviewSection />
      <FinalCTASection />
    </div>
  )
}
