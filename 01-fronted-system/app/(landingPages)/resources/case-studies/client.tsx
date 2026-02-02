"use client"

import Link from "next/link"
import {
  ArrowRight,
  Briefcase,
  Clock,
  TrendingDown,
  Building2,
  Sparkles,
  ArrowLeft,
  DollarSign,
  Users,
} from "lucide-react"

// Case studies data
const CASE_STUDIES = [
  {
    id: "enterprise-fintech",
    category: "Enterprise",
    title: "Fintech Unicorn Reduces Cloud Spend by 42%",
    description: "How a fast-growing fintech company gained visibility into their multi-cloud infrastructure and cut costs without sacrificing performance.",
    readTime: "8 min read",
    date: "Dec 15, 2024",
    tags: ["Fintech", "Multi-Cloud", "42% Savings"],
    featured: true,
    metrics: {
      savings: "$2.4M",
      reduction: "42%",
      timeToValue: "2 weeks",
    },
    industry: "Financial Services",
    size: "500+ employees",
  },
  {
    id: "saas-startup",
    category: "Growth Stage",
    title: "SaaS Startup Optimizes GenAI Costs",
    description: "A Series B startup discovers 60% of their AI spend was going to unused experiments and implements controls.",
    readTime: "6 min read",
    date: "Dec 8, 2024",
    tags: ["SaaS", "GenAI", "60% Savings"],
    metrics: {
      savings: "$180K",
      reduction: "60%",
      timeToValue: "1 week",
    },
    industry: "Technology",
    size: "50-200 employees",
  },
  {
    id: "healthcare-enterprise",
    category: "Enterprise",
    title: "Healthcare System Achieves 100% Cost Allocation",
    description: "A major healthcare provider uses CloudAct to allocate every dollar of cloud spend to departments and projects.",
    readTime: "10 min read",
    date: "Nov 28, 2024",
    tags: ["Healthcare", "Compliance", "Allocation"],
    metrics: {
      savings: "$890K",
      reduction: "28%",
      timeToValue: "3 weeks",
    },
    industry: "Healthcare",
    size: "5000+ employees",
  },
  {
    id: "ecommerce-scale",
    category: "Scale",
    title: "E-commerce Platform Handles Black Friday Costs",
    description: "How an e-commerce company uses anomaly detection to manage seasonal cost spikes during peak shopping.",
    readTime: "7 min read",
    date: "Nov 20, 2024",
    tags: ["E-commerce", "Seasonal", "Anomaly Detection"],
    metrics: {
      savings: "$450K",
      reduction: "35%",
      timeToValue: "1 week",
    },
    industry: "Retail",
    size: "200-500 employees",
  },
  {
    id: "media-streaming",
    category: "Enterprise",
    title: "Streaming Service Optimizes Kubernetes Spend",
    description: "A media company reduces their Kubernetes costs by 40% while improving deployment efficiency.",
    readTime: "9 min read",
    date: "Nov 12, 2024",
    tags: ["Media", "Kubernetes", "40% Savings"],
    metrics: {
      savings: "$1.2M",
      reduction: "40%",
      timeToValue: "4 weeks",
    },
    industry: "Media & Entertainment",
    size: "1000+ employees",
  },
  {
    id: "gaming-studio",
    category: "Growth Stage",
    title: "Gaming Studio Scales Cost-Effectively",
    description: "A mobile gaming company uses CloudAct to maintain profitability while scaling to millions of users.",
    readTime: "6 min read",
    date: "Nov 5, 2024",
    tags: ["Gaming", "Scaling", "Unit Economics"],
    metrics: {
      savings: "$320K",
      reduction: "38%",
      timeToValue: "2 weeks",
    },
    industry: "Gaming",
    size: "100-200 employees",
  },
]

// Impact stats
const IMPACT_STATS = [
  { label: "Average Savings", value: "35%", icon: TrendingDown },
  { label: "Total Saved", value: "$50M+", icon: DollarSign },
  { label: "Companies Helped", value: "500+", icon: Building2 },
  { label: "Happy Teams", value: "10K+", icon: Users },
]

export function CaseStudiesPageClient() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <Link href="/resources" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Resources
          </Link>
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Briefcase className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Case Studies
          </div>
          <h1 className="ca-page-hero-title">
            Real-World{" "}
            <span className="font-semibold">Success Stories</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            See how engineering and finance teams use CloudAct.ai to optimize cloud costs and gain visibility.
          </p>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="ca-resources-categories-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <TrendingDown className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Customer Impact
          </span>
          <h2 className="ca-section-title">Results That Matter</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {IMPACT_STATS.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="text-center p-6 rounded-xl bg-slate-50">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-sm mb-3">
                  <Icon className="w-6 h-6 text-slate-700" aria-hidden="true" />
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
                <div className="text-sm text-slate-600">{stat.label}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Case Studies Grid */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Featured Stories
          </span>
          <h2 className="ca-section-title">Customer Case Studies</h2>
          <p className="ca-section-subtitle">
            {CASE_STUDIES.length} success stories from teams like yours
          </p>
        </div>

        <div className="ca-resources-featured-grid">
          {CASE_STUDIES.map((study) => (
            <Link
              key={study.id}
              href={`/resources/case-studies/${study.id}`}
              className={`ca-resources-featured-card ${study.featured ? "ca-resources-featured-card-highlight" : ""}`}
            >
              {study.featured && (
                <div className="ca-resources-featured-badge">Featured</div>
              )}
              <div className="ca-resources-featured-category">{study.category}</div>
              <h3 className="ca-resources-featured-title">{study.title}</h3>
              <p className="ca-resources-featured-desc">{study.description}</p>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 my-4 p-3 rounded-lg bg-slate-50">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-900">{study.metrics.savings}</div>
                  <div className="text-xs text-slate-500">Saved</div>
                </div>
                <div className="text-center border-x border-slate-200">
                  <div className="text-lg font-bold text-emerald-600">{study.metrics.reduction}</div>
                  <div className="text-xs text-slate-500">Reduction</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-900">{study.metrics.timeToValue}</div>
                  <div className="text-xs text-slate-500">Time to Value</div>
                </div>
              </div>

              <div className="ca-resources-featured-tags">
                {study.tags.map((tag) => (
                  <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                ))}
              </div>
              <div className="ca-resources-featured-meta">
                <div className="ca-resources-featured-meta-left">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{study.readTime}</span>
                  <span>{study.industry}</span>
                </div>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Your Story Starts Here
          </div>
          <h2 className="ca-final-cta-title">Ready to Write Your Success Story?</h2>
          <p className="ca-final-cta-subtitle">
            Join hundreds of teams already saving on cloud costs with CloudAct.ai.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/resources" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Browse All Resources
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
