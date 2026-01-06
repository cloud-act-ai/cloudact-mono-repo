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
  X,
} from "lucide-react"
import "./premium.css"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"
import { HeroSlider } from "./_components/hero-slider"

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
            Learn more <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ca-home-announcement-close"
          aria-label="Close announcement"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// INDUSTRY BADGES (More credible than fake company logos)
// ============================================
const INDUSTRY_BADGES = [
  { label: "500+", sublabel: "Engineering Teams", icon: Users },
  { label: "$100M+", sublabel: "Cloud Spend Managed", icon: DollarSign },
  { label: "50+", sublabel: "Enterprise Customers", icon: Blocks },
  { label: "15+", sublabel: "Countries", icon: Cloud },
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
              <TrendingDown className="w-3 h-3" aria-hidden="true" /> -12%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-coral">
            <span className="ca-dash-metric-label">GenAI Costs</span>
            <span className="ca-dash-metric-value">$12.8K</span>
            <span className="ca-dash-metric-change ca-dash-metric-up">
              <Activity className="w-3 h-3" aria-hidden="true" /> +23%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-blue">
            <span className="ca-dash-metric-label">Cloud Infra</span>
            <span className="ca-dash-metric-value">$28.1K</span>
            <span className="ca-dash-metric-change ca-dash-metric-down">
              <TrendingDown className="w-3 h-3" aria-hidden="true" /> -8%
            </span>
          </div>
          <div className="ca-dash-metric ca-dash-metric-mint">
            <span className="ca-dash-metric-label">Savings Found</span>
            <span className="ca-dash-metric-value">$8.4K</span>
            <span className="ca-dash-metric-badge">
              <Sparkles className="w-3 h-3" aria-hidden="true" /> AI
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
              <div key={`chart-bar-${i}`} className="ca-chart-bar-stack">
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
    <section className="ca-credibility-section-enhanced">
      <div className="ca-credibility-container">
        {/* Stats row with icons */}
        <div className="ca-credibility-stats-enhanced">
          {INDUSTRY_BADGES.map((badge) => (
            <div key={badge.label} className="ca-credibility-stat-enhanced">
              <div className="ca-credibility-icon-wrap">
                <badge.icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="ca-credibility-text">
                <span className="ca-credibility-value">{badge.label}</span>
                <span className="ca-credibility-label">{badge.sublabel}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Partner badges - more prominent */}
        <div className="ca-partner-badges-enhanced">
          <div className="ca-partner-badge-enhanced">
            <Shield className="w-5 h-5" aria-hidden="true" />
            <span>SOC2 Type II</span>
          </div>
          <div className="ca-partner-badge-enhanced">
            <Award className="w-5 h-5" aria-hidden="true" />
            <span>FinOps Certified</span>
          </div>
          <div className="ca-partner-badge-enhanced">
            <Cloud className="w-5 h-5" aria-hidden="true" />
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
        {stats.map((stat) => (
          <div key={stat.label} className="ca-stat-card">
            <div className="ca-stat-icon-wrap">
              <stat.icon className="w-6 h-6" aria-hidden="true" />
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
      description: "Standardize reporting using FOCUS-compliant billing data. Align engineering and finance on shared cost metrics.",
      color: "coral",
      link: "/solutions#finops",
      icon: Target,
    },
    {
      title: "Engineering",
      description: "Eliminate waste faster with tailored recommendations. Get actionable insights without leaving your workflow.",
      color: "blue",
      link: "/solutions#engineering",
      icon: Cpu,
    },
    {
      title: "Finance",
      description: "Reduce budget variance with cost visibility and forecasting. Build accurate financial models for tech spend.",
      color: "purple",
      link: "/solutions#finance",
      icon: PieChart,
    },
    {
      title: "MSPs & Partners",
      description: "Deliver higher client ROI through proactive optimization. White-label dashboards for your customers.",
      color: "mint",
      link: "/solutions#partners",
      icon: Users,
    },
  ]

  return (
    <section className="ca-collab-section-enhanced">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <Users className="w-4 h-4" aria-hidden="true" />
          Teams
        </span>
        <h2 className="ca-collab-title">Collaboration that delivers results</h2>
        <p className="ca-section-subtitle">
          Built for every stakeholder in your organization
        </p>
      </div>
      <div className="ca-collab-grid-enhanced">
        {personas.map((persona) => (
          <Link key={persona.title} href={persona.link} className={`ca-collab-card-enhanced ca-collab-${persona.color}`}>
            <div className={`ca-collab-icon-wrap ca-collab-icon-${persona.color}`}>
              <persona.icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="ca-collab-card-title">{persona.title}</h3>
            <p className="ca-collab-card-desc">{persona.description}</p>
            <span className="ca-collab-link-enhanced">
              Learn more <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
    <section className="ca-rating-section-enhanced">
      <div className="ca-rating-container-enhanced">
        {/* G2 Featured Badge - Large and Prominent */}
        <div className="ca-rating-g2-featured">
          <div className="ca-g2-badge-large">
            <Image
              src="/logos/g2-leader-badge.svg"
              alt="G2 Leader Badge"
              width={80}
              height={80}
              className="ca-g2-badge-img"
            />
          </div>
          <div className="ca-g2-info">
            <div className="ca-rating-stars-large">
              {[...Array(5)].map((_, i) => (
                <Star key={`star-${i}`} className="w-6 h-6 ca-star-filled" aria-hidden="true" />
              ))}
            </div>
            <span className="ca-rating-score">4.9 out of 5</span>
            <span className="ca-rating-reviews">Based on 500+ verified reviews</span>
          </div>
        </div>

        {/* Quote from reviews */}
        <div className="ca-rating-quote">
          <Quote className="w-8 h-8 ca-quote-icon" aria-hidden="true" />
          <p>&quot;The only platform that truly unifies GenAI, cloud, and SaaS costs in one place.&quot;</p>
          <span className="ca-quote-source">— G2 Verified Reviewer, Enterprise</span>
        </div>

        {/* Achievement badges */}
        <div className="ca-rating-achievements">
          <div className="ca-achievement-badge">
            <Award className="w-5 h-5" aria-hidden="true" />
            <div className="ca-achievement-info">
              <span className="ca-achievement-title">Leader</span>
              <span className="ca-achievement-subtitle">FinOps Software 2025</span>
            </div>
          </div>
          <div className="ca-achievement-badge">
            <TrendingDown className="w-5 h-5" aria-hidden="true" />
            <div className="ca-achievement-info">
              <span className="ca-achievement-title">High Performer</span>
              <span className="ca-achievement-subtitle">Cost Management</span>
            </div>
          </div>
          <div className="ca-achievement-badge">
            <Users className="w-5 h-5" aria-hidden="true" />
            <div className="ca-achievement-info">
              <span className="ca-achievement-title">Best Support</span>
              <span className="ca-achievement-subtitle">Enterprise Software</span>
            </div>
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
          <Blocks className="w-4 h-4" aria-hidden="true" />
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
                <pillar.icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="ca-pillar-title">{pillar.title}</h3>
            </div>
            <p className="ca-pillar-desc">{pillar.description}</p>
            <ul className="ca-pillar-features">
              {pillar.features.map((feature) => (
                <li key={feature}>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link href={`/features#${pillar.id}`} className={`ca-pillar-link ca-pillar-link-${pillar.color}`}>
              Learn more <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          Features
        </span>
        <h2 className="ca-section-title">Everything you need to control costs</h2>
        <p className="ca-section-subtitle">
          From real-time tracking to AI-powered optimization, get complete visibility and control.
        </p>
      </div>

      <div className="ca-features-grid-premium">
        {features.map((feature) => (
          <div key={feature.title} className={`ca-feature-card-premium ca-feature-${feature.color}`}>
            <div className="ca-feature-header-premium">
              <div className={`ca-feature-icon-premium ca-feature-icon-${feature.color}`}>
                <feature.icon className="w-5 h-5" aria-hidden="true" />
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
      number: "1",
      title: "Connect Your Tools",
      description: "Link your cloud providers, GenAI APIs, and SaaS subscriptions with secure, read-only access. Setup takes less than 5 minutes.",
      icon: Plug,
    },
    {
      number: "2",
      title: "See Your Costs",
      description: "Get a unified dashboard showing all spending with automatic categorization, trends, and real-time anomaly detection.",
      icon: LineChart,
    },
    {
      number: "3",
      title: "Optimize & Save",
      description: "Receive AI-powered recommendations to reduce waste, rightsize resources, and optimize your infrastructure spend.",
      icon: Sparkles,
    },
  ]

  return (
    <section className="ca-how-section-enhanced">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <Settings className="w-4 h-4" aria-hidden="true" />
          How It Works
        </span>
        <h2 className="ca-section-title">Get started in 3 simple steps</h2>
        <p className="ca-section-subtitle">
          From connection to optimization in minutes, not months
        </p>
      </div>

      <div className="ca-how-steps-enhanced">
        {steps.map((step, index) => (
          <div key={step.number} className="ca-how-step-enhanced">
            <div className="ca-how-step-header">
              <div className="ca-how-number-dark">{step.number}</div>
              <div className="ca-how-icon-wrap">
                <step.icon className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
            <h3 className="ca-how-title">{step.title}</h3>
            <p className="ca-how-desc">{step.description}</p>
            {index < steps.length - 1 && (
              <div className="ca-how-connector" aria-hidden="true" />
            )}
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
    <section className="ca-integrations-section-enhanced">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <Plug className="w-4 h-4" aria-hidden="true" />
          Integrations
        </span>
        <h2 className="ca-section-title">Connect your entire stack</h2>
        <p className="ca-section-subtitle">
          50+ integrations with the tools you already use. Set up in minutes.
        </p>
      </div>

      <div className="ca-integrations-categories-enhanced">
        {INTEGRATION_CATEGORIES.map((category) => (
          <div key={category.title} className="ca-integration-category-enhanced">
            <div className="ca-integration-category-icon">
              <category.icon className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-integration-category-title">{category.title}</h3>
            <div className="ca-integration-logos-enhanced">
              {category.providers.map((provider) => (
                <div key={provider.name} className="ca-integration-logo-item" title={provider.name}>
                  <Image
                    src={provider.logo}
                    alt={provider.name}
                    width={80}
                    height={32}
                    className="ca-integration-img"
                  />
                  <span className="ca-integration-tooltip">{provider.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ca-integrations-cta-enhanced">
        <Link href="/integrations" className="ca-btn-integrations">
          <span>Explore All Integrations</span>
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
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
    rating: 5,
  },
  {
    quote: "Finally, one dashboard for all our cloud and AI costs. Our FinOps team went from spending days on reports to having real-time insights.",
    author: "Marcus Rodriguez",
    role: "Director of FinOps",
    company: "DataFirst Corp",
    avatar: "MR",
    metric: "80% time saved",
    rating: 5,
  },
  {
    quote: "The AI recommendations alone paid for the platform 10x over. CloudAct.ai is essential for any team using LLMs at scale.",
    author: "Emily Watson",
    role: "CTO",
    company: "AI Ventures",
    avatar: "EW",
    metric: "10x ROI",
    rating: 5,
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
    <section className="ca-testimonials-section-enhanced">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          Customer Stories
        </span>
        <h2 className="ca-section-title">Trusted by FinOps leaders</h2>
        <p className="ca-section-subtitle">
          See how teams are transforming their cost management
        </p>
      </div>

      {/* Desktop: Show all 3 testimonials */}
      <div className="ca-testimonials-grid">
        {TESTIMONIALS.map((testimonial) => (
          <div key={testimonial.author} className="ca-testimonial-card-enhanced">
            <div className="ca-testimonial-rating">
              {[...Array(testimonial.rating)].map((_, i) => (
                <Star key={`star-${testimonial.author}-${i}`} className="w-4 h-4 ca-star-filled" aria-hidden="true" />
              ))}
            </div>
            <Quote className="ca-testimonial-quote-icon-small" aria-hidden="true" />
            <p className="ca-testimonial-text-enhanced">{testimonial.quote}</p>
            <div className="ca-testimonial-metric-badge">{testimonial.metric}</div>
            <div className="ca-testimonial-footer-enhanced">
              <div className="ca-testimonial-avatar-enhanced">{testimonial.avatar}</div>
              <div className="ca-testimonial-info">
                <div className="ca-testimonial-author">{testimonial.author}</div>
                <div className="ca-testimonial-role">{testimonial.role}</div>
                <div className="ca-testimonial-company">{testimonial.company}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: Carousel */}
      <div className="ca-testimonials-carousel">
        <div className="ca-testimonial-card-mobile" role="region" aria-live="polite" aria-atomic="true">
          <div className="ca-testimonial-rating">
            {[...Array(TESTIMONIALS[active].rating)].map((_, i) => (
              <Star key={`star-mobile-${i}`} className="w-4 h-4 ca-star-filled" aria-hidden="true" />
            ))}
          </div>
          <Quote className="ca-testimonial-quote-icon-small" aria-hidden="true" />
          <p className="ca-testimonial-text-enhanced">{TESTIMONIALS[active].quote}</p>
          <div className="ca-testimonial-metric-badge">{TESTIMONIALS[active].metric}</div>
          <div className="ca-testimonial-footer-enhanced">
            <div className="ca-testimonial-avatar-enhanced">{TESTIMONIALS[active].avatar}</div>
            <div className="ca-testimonial-info">
              <div className="ca-testimonial-author">{TESTIMONIALS[active].author}</div>
              <div className="ca-testimonial-role">{TESTIMONIALS[active].role}</div>
              <div className="ca-testimonial-company">{TESTIMONIALS[active].company}</div>
            </div>
          </div>
        </div>

        <div className="ca-testimonial-nav-enhanced" role="group" aria-label="Testimonial navigation">
          <button
            type="button"
            onClick={() => setActive((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            className="ca-testimonial-nav-btn-enhanced"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="ca-testimonial-dots" role="tablist" aria-label="Testimonials">
            {TESTIMONIALS.map((_, i) => (
              <button
                type="button"
                key={`testimonial-dot-${i}`}
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
            className="ca-testimonial-nav-btn-enhanced"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

// ============================================
// PRICING PREVIEW SECTION
// ============================================
const PLAN_ICONS = [Zap, Star, Gauge, Blocks] // Starter, Pro, Scale, Enterprise

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
    <section className="ca-pricing-preview-section-enhanced">
      <div className="ca-section-header-centered">
        <span className="ca-section-eyebrow">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          Pricing
        </span>
        <h2 className="ca-section-title">Simple, transparent pricing</h2>
        <p className="ca-section-subtitle">
          Start free, scale as you grow. No hidden fees, no surprise charges.
        </p>
      </div>

      <div className="ca-pricing-grid-enhanced">
        {loading ? (
          <div className="ca-pricing-loading" role="status" aria-label="Loading pricing plans">
            <Loader2 className="w-8 h-8 animate-spin ca-icon-mint" aria-hidden="true" />
          </div>
        ) : plans.length > 0 ? (
          <>
            {plans.map((plan, i) => {
              const PlanIcon = PLAN_ICONS[i] || Zap
              return (
                <div key={plan.id} className={`ca-pricing-card-enhanced ${i === 1 ? "ca-pricing-featured-enhanced" : ""}`}>
                  {i === 1 && <div className="ca-pricing-badge-enhanced">Most Popular</div>}
                  <div className="ca-pricing-header-enhanced">
                    <div className={`ca-pricing-icon-wrap ca-pricing-icon-${i}`}>
                      <PlanIcon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="ca-pricing-name">{plan.name}</h3>
                    <div className="ca-pricing-price">
                      <span className="ca-pricing-amount">${plan.price}</span>
                      <span className="ca-pricing-period">/{plan.interval === "year" ? "yr" : "mo"}</span>
                    </div>
                  </div>
                  <ul className="ca-pricing-features-enhanced">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={i === 1 ? "ca-btn-pricing-primary-enhanced" : "ca-btn-pricing-secondary-enhanced"}
                  >
                    Get started
                  </Link>
                </div>
              )
            })}
            <div className="ca-pricing-card-enhanced ca-pricing-enterprise-enhanced">
              <div className="ca-pricing-header-enhanced">
                <div className="ca-pricing-icon-wrap ca-pricing-icon-enterprise">
                  <Blocks className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="ca-pricing-name">Enterprise</h3>
                <div className="ca-pricing-price">
                  <span className="ca-pricing-amount-custom">Custom</span>
                </div>
              </div>
              <ul className="ca-pricing-features-enhanced">
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>Unlimited team members</span></li>
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>Unlimited integrations</span></li>
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>SSO & SCIM provisioning</span></li>
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>Dedicated success manager</span></li>
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>Custom SLAs & contracts</span></li>
                <li><CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>On-premise deployment option</span></li>
              </ul>
              <Link href="/contact" className="ca-btn-pricing-enterprise">
                Contact Sales
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </>
        ) : (
          <div className="ca-pricing-placeholder">
            <p>Contact us for pricing information</p>
          </div>
        )}
      </div>

      <div className="ca-pricing-cta-row-enhanced">
        <Link href="/pricing" className="ca-link-pricing">
          Compare all plans <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
    <section className="ca-final-cta-section-enhanced">
      <div className="ca-final-cta-bg-pattern" aria-hidden="true" />
      <div className="ca-final-cta-container-enhanced">
        {/* Social proof stat */}
        <div className="ca-final-cta-proof">
          <div className="ca-proof-stat">
            <span className="ca-proof-value">$2.4M+</span>
            <span className="ca-proof-label">saved by teams this month</span>
          </div>
        </div>

        <div className="ca-final-cta-badge-enhanced">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {DEFAULT_TRIAL_DAYS}-day free trial • No credit card required
        </div>

        <h2 className="ca-final-cta-title-enhanced">Ready to take control of your costs?</h2>
        <p className="ca-final-cta-subtitle-enhanced">
          Join hundreds of teams using CloudAct.ai to track, analyze, and optimize their
          GenAI, cloud, and SaaS spending.
        </p>

        <div className="ca-final-cta-buttons-enhanced">
          <Link href="/signup" className="ca-btn-cta-primary-enhanced">
            Start Free Trial
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </Link>
          <Link href="/contact" className="ca-btn-cta-secondary-enhanced">
            Talk to Sales
            <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="ca-final-cta-trust">
          <div className="ca-trust-item">
            <Shield className="w-4 h-4" aria-hidden="true" />
            <span>SOC2 Compliant</span>
          </div>
          <div className="ca-trust-item">
            <Zap className="w-4 h-4" aria-hidden="true" />
            <span>5 min setup</span>
          </div>
          <div className="ca-trust-item">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>500+ teams</span>
          </div>
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
      <HeroSlider />
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
