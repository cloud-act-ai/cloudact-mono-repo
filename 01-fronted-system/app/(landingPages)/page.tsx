"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
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
} from "lucide-react"
import "./premium.css"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"

// Provider data
const PROVIDERS = [
  { name: "OpenAI", icon: "🤖", type: "GenAI", angle: 0 },
  { name: "Anthropic", icon: "🧠", type: "GenAI", angle: 45 },
  { name: "AWS", icon: "☁️", type: "Cloud", angle: 90 },
  { name: "GCP", icon: "🌐", type: "Cloud", angle: 135 },
  { name: "Azure", icon: "⚡", type: "Cloud", angle: 180 },
  { name: "Stripe", icon: "💳", type: "SaaS", angle: 225 },
  { name: "Slack", icon: "💬", type: "SaaS", angle: 270 },
  { name: "Datadog", icon: "📊", type: "SaaS", angle: 315 },
]

// Animated counter hook
function useCounter(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true)
        }
      },
      { threshold: 0.5 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return
    let start: number
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [started, end, duration])

  return { count, ref }
}

// Live ticker component
function LiveTicker() {
  const [data, setData] = useState({
    savings: 2847392,
    orgs: 847,
    queries: 12847392,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => ({
        savings: prev.savings + Math.floor(Math.random() * 50),
        orgs: prev.orgs + (Math.random() > 0.95 ? 1 : 0),
        queries: prev.queries + Math.floor(Math.random() * 500),
      }))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="ca-ticker ca-animate">
      <div className="ca-ticker-item">
        <div className="ca-ticker-dot" />
        <span className="ca-ticker-label">Savings</span>
        <span className="ca-ticker-value">${data.savings.toLocaleString()}</span>
      </div>
      <div className="ca-ticker-item">
        <div className="ca-ticker-dot" />
        <span className="ca-ticker-label">Orgs</span>
        <span className="ca-ticker-value">{data.orgs.toLocaleString()}</span>
      </div>
      <div className="ca-ticker-item">
        <div className="ca-ticker-dot" />
        <span className="ca-ticker-label">Queries/Day</span>
        <span className="ca-ticker-value">{data.queries.toLocaleString()}</span>
      </div>
    </div>
  )
}

// Provider constellation
function Constellation() {
  const radius = 170

  return (
    <div className="ca-constellation ca-animate ca-delay-3">
      {/* SVG for connection lines */}
      <svg className="ca-constellation-lines" viewBox="0 0 900 420">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#007A78" />
            <stop offset="100%" stopColor="#FF6E50" />
          </linearGradient>
        </defs>
        {PROVIDERS.map((provider, i) => {
          const angle = (provider.angle * Math.PI) / 180
          const x = 450 + Math.cos(angle) * radius
          const y = 210 + Math.sin(angle) * radius
          return (
            <line
              key={i}
              className="ca-constellation-line"
              x1="450"
              y1="210"
              x2={x}
              y2={y}
            />
          )
        })}
      </svg>

      {/* Center hub */}
      <div className="ca-constellation-center">
        <div className="ca-constellation-center-logo">CloudAct</div>
        <div className="ca-constellation-center-sub">Cost Hub</div>
      </div>

      {/* Provider nodes */}
      {PROVIDERS.map((provider, i) => {
        const angle = (provider.angle * Math.PI) / 180
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius

        return (
          <div
            key={provider.name}
            className="ca-constellation-node"
            style={{
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="ca-constellation-node-icon">{provider.icon}</span>
            <span className="ca-constellation-node-name">{provider.name}</span>
            <span className="ca-constellation-node-type">{provider.type}</span>
          </div>
        )
      })}

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="ca-particle"
          style={{
            left: `${20 + Math.random() * 60}%`,
            top: `${20 + Math.random() * 60}%`,
            '--tx': `${-50 + Math.random() * 100}px`,
            '--ty': `${-50 + Math.random() * 100}px`,
            animationDelay: `${i * 0.6}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

// Dashboard preview
function DashboardPreview() {
  const chartData = Array.from({ length: 30 }, () => ({
    cloud: 30 + Math.random() * 40,
    genai: 20 + Math.random() * 30,
    saas: 10 + Math.random() * 15,
  }))

  return (
    <div className="ca-dashboard-preview ca-animate ca-delay-4">
      <div className="ca-dashboard-header">
        <div className="ca-dashboard-dot ca-dashboard-dot-red" />
        <div className="ca-dashboard-dot ca-dashboard-dot-yellow" />
        <div className="ca-dashboard-dot ca-dashboard-dot-green" />
        <span className="ca-dashboard-title">cloudact.ai/dashboard — Cost Intelligence</span>
      </div>
      <div className="ca-dashboard-content">
        <div className="ca-metrics-grid">
          <div className="ca-metric-card">
            <div className="ca-metric-label">Monthly Spend</div>
            <div className="ca-metric-value ca-mono">$127,432</div>
            <div className="ca-metric-change ca-metric-change-positive">
              <TrendingDown className="w-3 h-3" /> -23%
            </div>
          </div>
          <div className="ca-metric-card">
            <div className="ca-metric-label">GenAI Costs</div>
            <div className="ca-metric-value ca-mono" style={{ color: '#FF6E50' }}>$43,892</div>
            <div className="ca-metric-change ca-metric-change-negative">
              <Activity className="w-3 h-3" /> 4.2M tokens
            </div>
          </div>
          <div className="ca-metric-card">
            <div className="ca-metric-label">Cloud Infra</div>
            <div className="ca-metric-value ca-mono">$68,240</div>
            <div className="ca-metric-change ca-metric-change-positive">
              <Globe className="w-3 h-3" /> 3 providers
            </div>
          </div>
          <div className="ca-metric-card ca-metric-card-highlight">
            <div className="ca-metric-label">Savings Found</div>
            <div className="ca-metric-value ca-mono">$31,847</div>
            <div className="ca-metric-change" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
              <Sparkles className="w-3 h-3" /> 12 tips
            </div>
          </div>
        </div>

        <div className="ca-chart-container">
          <div className="ca-chart-header">
            <span className="ca-chart-title">Cost Trend (30 days)</span>
            <div className="ca-chart-legend">
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: '#007A78' }} />
                Cloud
              </div>
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: '#FF6E50' }} />
                GenAI
              </div>
              <div className="ca-chart-legend-item">
                <div className="ca-chart-legend-dot" style={{ background: '#D4D4D8' }} />
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

// Feature card
function FeatureCard({
  icon: Icon,
  title,
  description,
  color = "teal",
}: {
  icon: React.ElementType
  title: string
  description: string
  color?: "teal" | "coral" | "green"
}) {
  return (
    <div className="ca-feature-card">
      <div className={`ca-feature-icon ca-feature-icon-${color}`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="ca-feature-title">{title}</h3>
      <p className="ca-feature-desc">{description}</p>
    </div>
  )
}

// Pricing card
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

// Testimonials
const TESTIMONIALS = [
  {
    quote: "CloudAct.ai reduced our GenAI costs by 47% in the first month. The visibility into token usage across OpenAI and Anthropic was a game-changer.",
    author: "Sarah Chen",
    role: "VP of Engineering, TechScale Inc",
    avatar: "SC",
    savings: "$127K",
  },
  {
    quote: "Finally, a single dashboard for all our cloud and AI costs. We went from spending 2 days on monthly reports to having real-time insights.",
    author: "Marcus Rodriguez",
    role: "CTO, DataFlow Technologies",
    avatar: "MR",
    savings: "$340K",
  },
  {
    quote: "The automated recommendations alone have saved us over $200K annually. CloudAct.ai is essential for any team using LLMs at scale.",
    author: "Emily Watson",
    role: "Head of FinOps, Enterprise AI Corp",
    avatar: "EW",
    savings: "$210K",
  },
]

export default function PremiumLandingPage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const savingsCounter = useCounter(2847000, 2500)
  const orgsCounter = useCounter(847, 2000)

  // Auto-rotate testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial(prev => (prev + 1) % TESTIMONIALS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="ca-landing">
      {/* Promo Banner */}
      <div style={{
        background: 'linear-gradient(90deg, #007A78 0%, #005C5A 100%)',
        color: 'white',
        padding: '12px 16px',
        textAlign: 'center',
        fontSize: '0.875rem',
      }}>
        <span style={{
          display: 'inline-block',
          background: 'rgba(255,255,255,0.2)',
          padding: '2px 10px',
          borderRadius: '100px',
          fontSize: '0.625rem',
          fontWeight: 700,
          marginRight: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          New
        </span>
        GenAI cost tracking now supports Claude 3.5, GPT-4o & Gemini 2.0
        <Link href="/features" style={{ marginLeft: '8px', textDecoration: 'underline', opacity: 0.9 }}>
          Learn more →
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
          <LiveTicker />

          <h1 className="ca-display-xl ca-animate ca-delay-1" style={{ marginBottom: '24px', maxWidth: '900px', marginLeft: 'auto', marginRight: 'auto' }}>
            Track Every Dollar Across{' '}
            <span className="ca-gradient-text">GenAI, Cloud & SaaS</span>
          </h1>

          <p className="ca-body ca-animate ca-delay-2" style={{ maxWidth: '650px', margin: '0 auto 40px', fontSize: '1.25rem' }}>
            The unified cost intelligence platform for engineering and finance teams.
            Complete visibility into OpenAI, Anthropic, AWS, GCP, Azure, and 50+ integrations.
          </p>

          <div className="ca-animate ca-delay-3" style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="ca-btn ca-btn-primary ca-btn-lg">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn ca-btn-secondary ca-btn-lg">
              <Play className="w-5 h-5" />
              Watch Demo
            </Link>
          </div>

          <div className="ca-animate ca-delay-4" style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '32px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52525B', fontSize: '0.875rem' }}>
              <Shield className="w-4 h-4" style={{ color: '#007A78' }} />
              SOC 2 Type II
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52525B', fontSize: '0.875rem' }}>
              <Zap className="w-4 h-4" style={{ color: '#FF6E50' }} />
              5-minute setup
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52525B', fontSize: '0.875rem' }}>
              <TrendingDown className="w-4 h-4" style={{ color: '#10B981' }} />
              67% avg. cost reduction
            </div>
          </div>

          <Constellation />
          <DashboardPreview />
        </div>
      </section>

      {/* Trusted By */}
      <section className="ca-trusted">
        <p className="ca-trusted-label">Trusted by forward-thinking teams</p>
        <div className="ca-trusted-logos">
          {["Anthropic", "OpenAI", "Stripe", "Vercel", "Cloudflare", "MongoDB", "Supabase"].map((company) => (
            <span key={company} className="ca-trusted-logo">{company}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">Platform Features</span>
          <h2 className="ca-display-lg" style={{ marginBottom: '16px' }}>
            Everything you need to control costs
          </h2>
          <p className="ca-body" style={{ maxWidth: '600px', margin: '0 auto' }}>
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
            color="teal"
          />
          <FeatureCard
            icon={Layers}
            title="SaaS Subscription Tracking"
            description="Never lose track of a subscription again. Monitor Slack, GitHub, Datadog, and 50+ SaaS tools."
            color="green"
          />
          <FeatureCard
            icon={LineChart}
            title="Cost Forecasting"
            description="ML-powered predictions help you budget accurately and avoid surprise bills at month-end."
            color="teal"
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

      {/* Stats */}
      <section className="ca-stats-section">
        <div className="ca-stats-grid" ref={savingsCounter.ref}>
          <div>
            <div className="ca-stat-value ca-mono">
              ${(savingsCounter.count / 1000000).toFixed(1)}M+
            </div>
            <p className="ca-stat-label">Total customer savings</p>
          </div>
          <div ref={orgsCounter.ref}>
            <div className="ca-stat-value ca-mono">
              {orgsCounter.count}+
            </div>
            <p className="ca-stat-label">Organizations worldwide</p>
          </div>
          <div>
            <div className="ca-stat-value ca-mono">50+</div>
            <p className="ca-stat-label">Integrations supported</p>
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
              <div className="ca-testimonial-role">{TESTIMONIALS[activeTestimonial].role}</div>
            </div>
            <div className="ca-testimonial-savings">
              Saved {TESTIMONIALS[activeTestimonial].savings}
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
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="ca-testimonial-dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                className={`ca-testimonial-dot ${i === activeTestimonial ? 'active' : ''}`}
                onClick={() => setActiveTestimonial(i)}
              />
            ))}
          </div>
          <button
            className="ca-testimonial-btn"
            onClick={() => setActiveTestimonial(prev => (prev + 1) % TESTIMONIALS.length)}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Pricing */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">Simple Pricing</span>
          <h2 className="ca-display-lg" style={{ marginBottom: '16px' }}>
            Start free, scale as you grow
          </h2>
          <p className="ca-body" style={{ maxWidth: '500px', margin: '0 auto' }}>
            No hidden fees. No surprise charges. Just transparent pricing.
          </p>
        </div>

        <div className="ca-pricing-grid">
          <PricingCard
            name="Starter"
            price="$0"
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
            price="$249"
            period="mo"
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
        </div>
      </section>

      {/* CTA */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <Sparkles className="w-4 h-4" />
              {DEFAULT_TRIAL_DAYS}-day free trial • No credit card required
            </div>
            <h2 className="ca-cta-title">Ready to take control of your costs?</h2>
            <p className="ca-cta-subtitle">
              Join 800+ teams using CloudAct.ai to track, analyze, and optimize their
              GenAI, cloud, and SaaS spending.
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
