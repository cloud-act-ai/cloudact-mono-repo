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
} from "lucide-react"
import "./premium.css"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"

// Provider logos with actual SVG files
const PROVIDER_LOGOS = [
  { name: "OpenAI", logo: "/logos/providers/openai.svg" },
  { name: "Anthropic", logo: "/logos/providers/anthropic.svg" },
  { name: "AWS", logo: "/logos/providers/aws.svg" },
  { name: "GCP", logo: "/logos/providers/gcp.svg" },
  { name: "Azure", logo: "/logos/providers/azure.svg" },
  { name: "Gemini", logo: "/logos/providers/gemini.svg" },
  { name: "Cursor", logo: "/logos/providers/cursor.svg" },
  { name: "GitHub", logo: "/logos/providers/github.svg" },
  { name: "Slack", logo: "/logos/providers/slack.svg" },
  { name: "Notion", logo: "/logos/providers/notion.svg" },
  { name: "Figma", logo: "/logos/providers/figma.svg" },
  { name: "Linear", logo: "/logos/providers/linear.svg" },
  { name: "Supabase", logo: "/logos/providers/supabase.svg" },
  { name: "Perplexity", logo: "/logos/providers/perplexity.svg" },
]

// Hero badge component
function HeroBadge() {
  return (
    <div className="ca-badge ca-animate">
      <span className="ca-badge-dot" />
      <span>Now tracking 50+ integrations</span>
      <ArrowRight className="w-3.5 h-3.5 ml-1" />
    </div>
  )
}

// Logo carousel/marquee with real SVGs
function LogoCarousel() {
  // Double the logos for seamless infinite scroll
  const doubledLogos = [...PROVIDER_LOGOS, ...PROVIDER_LOGOS]

  return (
    <div className="ca-logo-carousel">
      <div className="ca-logo-track">
        {doubledLogos.map((provider, i) => (
          <div key={`${provider.name}-${i}`} className="ca-logo-item">
            <Image
              src={provider.logo}
              alt={provider.name}
              width={120}
              height={40}
              className="h-7 w-auto object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// Dashboard preview mockup - cleaner version
function DashboardMockup() {
  const chartData = Array.from({ length: 24 }, (_, i) => ({
    cloud: 25 + Math.sin(i * 0.3) * 15 + Math.random() * 10,
    genai: 15 + Math.cos(i * 0.4) * 10 + Math.random() * 8,
    saas: 8 + Math.sin(i * 0.5) * 5 + Math.random() * 4,
  }))

  return (
    <div className="ca-dashboard-preview ca-animate ca-delay-4">
      <div className="ca-dashboard-header">
        <div className="ca-dashboard-dot ca-dashboard-dot-red" />
        <div className="ca-dashboard-dot ca-dashboard-dot-yellow" />
        <div className="ca-dashboard-dot ca-dashboard-dot-green" />
        <span className="ca-dashboard-title">cloudact.ai — Cost Intelligence Dashboard</span>
      </div>
      <div className="ca-dashboard-content">
        <div className="ca-metrics-grid">
          <div className="ca-metric-card">
            <div className="ca-metric-label">Total Spend</div>
            <div className="ca-metric-value ca-mono">$24.8K</div>
            <div className="ca-metric-change ca-metric-change-positive">
              <TrendingDown className="w-3 h-3" /> -12% vs last month
            </div>
          </div>
          <div className="ca-metric-card">
            <div className="ca-metric-label">GenAI Costs</div>
            <div className="ca-metric-value ca-mono" style={{ color: 'var(--ca-coral)' }}>$8.2K</div>
            <div className="ca-metric-change ca-metric-change-negative">
              <Activity className="w-3 h-3" /> +23% growth
            </div>
          </div>
          <div className="ca-metric-card">
            <div className="ca-metric-label">Cloud Infra</div>
            <div className="ca-metric-value ca-mono">$12.4K</div>
            <div className="ca-metric-change ca-metric-change-positive">
              <Globe className="w-3 h-3" /> -8% optimized
            </div>
          </div>
          <div className="ca-metric-card ca-metric-card-highlight">
            <div className="ca-metric-label">Savings Found</div>
            <div className="ca-metric-value ca-mono">$4.2K</div>
            <div className="ca-metric-change" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
              <Sparkles className="w-3 h-3" /> AI recommendations
            </div>
          </div>
        </div>

        <div className="ca-chart-container">
          <div className="ca-chart-header">
            <span className="ca-chart-title">Cost Trend (Last 24 Days)</span>
            <div className="ca-chart-legend">
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: 'var(--ca-mint)' }} />
                Cloud
              </div>
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: 'var(--ca-coral)' }} />
                GenAI
              </div>
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: 'var(--ca-gray-300)' }} />
                SaaS
              </div>
            </div>
          </div>
          <div className="ca-chart-bars">
            {chartData.map((d, i) => (
              <div key={i} className="ca-chart-bar-group">
                <div
                  className="ca-chart-bar ca-chart-bar-gray"
                  style={{ height: `${d.saas}%` }}
                />
                <div
                  className="ca-chart-bar ca-chart-bar-coral"
                  style={{ height: `${d.genai}%` }}
                />
                <div
                  className="ca-chart-bar ca-chart-bar-teal"
                  style={{ height: `${d.cloud}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Feature card component
function FeatureCard({
  icon: Icon,
  title,
  description,
  color = "mint",
}: {
  icon: React.ElementType
  title: string
  description: string
  color?: "mint" | "coral" | "blue" | "purple" | "green"
}) {
  return (
    <div className="ca-feature-card">
      <div className={`ca-feature-icon ca-feature-icon-${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="ca-feature-title">{title}</h3>
      <p className="ca-feature-desc">{description}</p>
    </div>
  )
}

// Pricing card component
function PricingCard({
  name,
  price,
  period,
  description,
  features,
  featured = false,
  ctaText = "Get started",
}: {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  featured?: boolean
  ctaText?: string
}) {
  return (
    <div className={`ca-pricing-card ${featured ? 'ca-pricing-card-featured' : ''}`}>
      {featured && <div className="ca-pricing-badge">Most Popular</div>}
      <h3 className="ca-pricing-name">{name}</h3>
      <p className="ca-pricing-desc">{description}</p>
      <div className="ca-pricing-price">
        <span className="ca-pricing-amount">{price}</span>
        {period && <span className="ca-pricing-period">/{period}</span>}
      </div>
      <ul className="ca-pricing-features">
        {features.map((feature, i) => (
          <li key={i} className="ca-pricing-feature">
            <Check />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={featured ? "ca-btn ca-btn-primary ca-btn-lg" : "ca-btn ca-btn-secondary ca-btn-lg"}
        style={{ width: '100%' }}
      >
        {ctaText}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}

// Testimonials data
const TESTIMONIALS = [
  {
    quote: "CloudAct.ai gave us complete visibility into token usage across OpenAI and Anthropic. The unified dashboard was a game-changer for our FinOps team.",
    author: "Sarah Chen",
    role: "VP of Engineering",
    company: "Series B Startup",
    avatar: "SC",
    highlight: "Complete visibility",
  },
  {
    quote: "Finally, a single dashboard for all our cloud and AI costs. We went from spending days on monthly reports to having real-time insights.",
    author: "Marcus Rodriguez",
    role: "CTO",
    company: "AI Platform",
    avatar: "MR",
    highlight: "Real-time insights",
  },
  {
    quote: "The automated recommendations helped us identify significant optimization opportunities. CloudAct.ai is essential for any team using LLMs at scale.",
    author: "Emily Watson",
    role: "Head of FinOps",
    company: "Enterprise SaaS",
    avatar: "EW",
    highlight: "AI recommendations",
  },
]

export default function PremiumLandingPage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [plans, setPlans] = useState<DynamicPlan[]>([])
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)

  // Fetch Stripe plans
  const loadPlans = useCallback(async () => {
    setIsLoadingPlans(true)
    const result = await getStripePlans()
    if (result.data) {
      setPlans(result.data)
    }
    setIsLoadingPlans(false)
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  // Auto-rotate testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial(prev => (prev + 1) % TESTIMONIALS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="ca-landing">
      {/* Announcement Banner */}
      <div className="ca-announcement-banner">
        <span className="ca-announcement-badge">New</span>
        <span>GenAI cost tracking now supports Claude 3.5 Sonnet, GPT-4o & Gemini 2.0</span>
        <Link href="/features" className="ca-announcement-link">
          Learn more <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Hero Section */}
      <section className="ca-hero">
        <div className="ca-hero-bg">
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
          <div className="ca-hero-orb ca-hero-orb-3" />
          <div className="ca-hero-grid" />
        </div>

        <div className="ca-hero-content">
          <HeroBadge />

          <h1 className="ca-display-xl ca-animate ca-delay-1">
            Track Every Dollar Across{' '}
            <span className="ca-gradient-text">GenAI, Cloud & SaaS</span>
          </h1>

          <p className="ca-body ca-hero-subtitle ca-animate ca-delay-2">
            The unified cost intelligence platform for engineering and finance teams.
            Complete visibility into OpenAI, Anthropic, AWS, GCP, Azure, and 50+ integrations.
          </p>

          <div className="ca-hero-cta ca-animate ca-delay-3">
            <Link href="/signup" className="ca-btn ca-btn-primary ca-btn-lg">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn ca-btn-secondary ca-btn-lg">
              <Play className="w-5 h-5" />
              Watch Demo
            </Link>
          </div>

          <div className="ca-hero-trust ca-animate ca-delay-4">
            <div className="ca-hero-trust-item">
              <Shield className="w-4 h-4" style={{ color: 'var(--ca-mint-dark)' }} />
              <span>SOC 2 Type II</span>
            </div>
            <div className="ca-hero-trust-item">
              <Zap className="w-4 h-4" style={{ color: 'var(--ca-coral)' }} />
              <span>5-minute setup</span>
            </div>
            <div className="ca-hero-trust-item">
              <TrendingDown className="w-4 h-4" style={{ color: 'var(--ca-green)' }} />
              <span>Reduce costs 20%+</span>
            </div>
          </div>

          <DashboardMockup />
        </div>
      </section>

      {/* Logo Carousel - Trusted By */}
      <section className="ca-trusted-section">
        <p className="ca-trusted-label">Integrates with your entire stack</p>
        <LogoCarousel />
      </section>

      {/* Stats Section */}
      <section className="ca-stats-section">
        <div className="ca-stats-grid">
          <div className="ca-stat-item">
            <div className="ca-stat-icon">
              <Layers className="w-6 h-6" />
            </div>
            <div className="ca-stat-value ca-mono">50+</div>
            <p className="ca-stat-label">Integrations</p>
          </div>
          <div className="ca-stat-item">
            <div className="ca-stat-icon">
              <Globe className="w-6 h-6" />
            </div>
            <div className="ca-stat-value ca-mono">3</div>
            <p className="ca-stat-label">Major clouds</p>
          </div>
          <div className="ca-stat-item">
            <div className="ca-stat-icon">
              <Activity className="w-6 h-6" />
            </div>
            <div className="ca-stat-value ca-mono">Real-time</div>
            <p className="ca-stat-label">Cost tracking</p>
          </div>
          <div className="ca-stat-item">
            <div className="ca-stat-icon">
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="ca-stat-value ca-mono">20%+</div>
            <p className="ca-stat-label">Avg. savings</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">Platform Features</span>
          <h2 className="ca-display-lg">
            Everything you need to control costs
          </h2>
          <p className="ca-body ca-section-desc">
            From real-time tracking to AI-powered optimization, CloudAct.ai gives you
            complete visibility and control over your spending.
          </p>
        </div>

        <div className="ca-features-grid">
          <FeatureCard
            icon={Cpu}
            title="GenAI Cost Tracking"
            description="Monitor token usage, model costs, and API spending across OpenAI, Anthropic, Google AI, and more in real-time."
            color="coral"
          />
          <FeatureCard
            icon={Globe}
            title="Multi-Cloud Support"
            description="Unified view of AWS, GCP, and Azure costs with automatic data sync and intelligent categorization."
            color="mint"
          />
          <FeatureCard
            icon={Layers}
            title="SaaS Subscription Tracking"
            description="Never lose track of a subscription again. Monitor Slack, GitHub, Datadog, and 50+ SaaS tools."
            color="purple"
          />
          <FeatureCard
            icon={LineChart}
            title="Cost Forecasting"
            description="ML-powered predictions help you budget accurately and avoid surprise bills at month-end."
            color="blue"
          />
          <FeatureCard
            icon={Bell}
            title="Smart Alerts"
            description="Get notified instantly when spending exceeds thresholds or anomalies are detected."
            color="coral"
          />
          <FeatureCard
            icon={Sparkles}
            title="AI Recommendations"
            description="Automated suggestions to optimize model selection, rightsize instances, and eliminate waste."
            color="green"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="ca-section ca-section-alt">
        <div className="ca-section-header">
          <span className="ca-section-label">How It Works</span>
          <h2 className="ca-display-lg">
            Get started in 3 simple steps
          </h2>
        </div>

        <div className="ca-steps-grid">
          <div className="ca-step-card">
            <div className="ca-step-number">1</div>
            <h3 className="ca-step-title">Connect Your Tools</h3>
            <p className="ca-step-desc">
              Link your cloud providers, GenAI APIs, and SaaS subscriptions with read-only access in minutes.
            </p>
          </div>
          <div className="ca-step-card">
            <div className="ca-step-number">2</div>
            <h3 className="ca-step-title">See Your Costs</h3>
            <p className="ca-step-desc">
              Get a unified dashboard showing all your spending with automatic categorization and trends.
            </p>
          </div>
          <div className="ca-step-card">
            <div className="ca-step-number">3</div>
            <h3 className="ca-step-title">Optimize & Save</h3>
            <p className="ca-step-desc">
              Receive AI-powered recommendations to reduce waste and optimize your infrastructure spend.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="ca-testimonials">
        <div className="ca-section-header">
          <span className="ca-section-label">Customer Stories</span>
          <h2 className="ca-display-lg">What teams are saying</h2>
        </div>

        <div className="ca-testimonial-card">
          <div className="ca-testimonial-header">
            <div className="ca-testimonial-avatar">
              {TESTIMONIALS[activeTestimonial].avatar}
            </div>
            <div>
              <div className="ca-testimonial-author">{TESTIMONIALS[activeTestimonial].author}</div>
              <div className="ca-testimonial-role">
                {TESTIMONIALS[activeTestimonial].role} · {TESTIMONIALS[activeTestimonial].company}
              </div>
            </div>
            <div className="ca-testimonial-savings">
              {TESTIMONIALS[activeTestimonial].highlight}
            </div>
          </div>
          <p className="ca-testimonial-quote">
            "{TESTIMONIALS[activeTestimonial].quote}"
          </p>
        </div>

        <div className="ca-testimonial-nav">
          <button
            className="ca-testimonial-btn"
            onClick={() => setActiveTestimonial(prev => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="ca-testimonial-dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                className={`ca-testimonial-dot ${i === activeTestimonial ? 'active' : ''}`}
                onClick={() => setActiveTestimonial(i)}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
          <button
            className="ca-testimonial-btn"
            onClick={() => setActiveTestimonial(prev => (prev + 1) % TESTIMONIALS.length)}
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Pricing */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">Simple Pricing</span>
          <h2 className="ca-display-lg">
            Start free, scale as you grow
          </h2>
          <p className="ca-body ca-section-desc">
            No hidden fees. No surprise charges. Just transparent pricing.
          </p>
        </div>

        <div className="ca-pricing-grid">
          {isLoadingPlans ? (
            <div className="ca-pricing-loading">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--ca-mint)' }} />
            </div>
          ) : plans.length > 0 ? (
            <>
              {plans.map((plan, index) => (
                <PricingCard
                  key={plan.id}
                  name={plan.name}
                  price={plan.price === 0 ? "$0" : `$${plan.price}`}
                  period={plan.interval === "year" ? "yr" : "mo"}
                  description={plan.description || (index === 0 ? "Perfect for small teams" : "For growing teams")}
                  featured={index === 1}
                  features={plan.features}
                />
              ))}
              <PricingCard
                name="Enterprise"
                price="Custom"
                description="For large organizations"
                ctaText="Contact sales"
                features={[
                  "Unlimited team members",
                  "Unlimited integrations",
                  "Advanced security (SSO, SCIM)",
                  "Unlimited data retention",
                  "Dedicated success manager",
                  "Custom SLAs & contracts",
                ]}
              />
            </>
          ) : (
            <>
              <PricingCard
                name="Starter"
                price="Free"
                period="mo"
                description="Perfect for small teams"
                features={[
                  "Up to 3 team members",
                  "5 integrations",
                  "Basic cost dashboards",
                  "7-day data retention",
                  "Community support",
                ]}
              />
              <PricingCard
                name="Pro"
                price="Contact us"
                description="For growing teams"
                featured
                features={[
                  "Up to 20 team members",
                  "Unlimited integrations",
                  "AI-powered recommendations",
                  "90-day data retention",
                  "Priority support",
                  "Custom alerts & reports",
                ]}
              />
              <PricingCard
                name="Enterprise"
                price="Custom"
                description="For large organizations"
                ctaText="Contact sales"
                features={[
                  "Unlimited team members",
                  "Unlimited integrations",
                  "Advanced security (SSO, SCIM)",
                  "Unlimited data retention",
                  "Dedicated success manager",
                  "Custom SLAs & contracts",
                ]}
              />
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <Sparkles className="w-4 h-4" />
              {DEFAULT_TRIAL_DAYS}-day free trial • No credit card required
            </div>
            <h2 className="ca-cta-title">Ready to take control of your costs?</h2>
            <p className="ca-cta-subtitle">
              Join hundreds of teams using CloudAct.ai to track, analyze, and optimize their
              GenAI, cloud, and SaaS spending in one unified platform.
            </p>
            <div className="ca-cta-buttons">
              <Link href="/signup" className="ca-cta-btn-white">
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/contact" className="ca-cta-btn-outline">
                Talk to Sales
                <ArrowUpRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
