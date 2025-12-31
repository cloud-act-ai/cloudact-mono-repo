import type { Metadata } from "next"
import Link from "next/link"
import {
  TrendingUp,
  ArrowRight,
  Building2,
  DollarSign,
  Users,
  Globe,
  BarChart3,
  Target,
  Mail,
  FileText,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Investors | CloudAct.ai",
  description: "Investor relations at CloudAct.ai. Learn about our mission to transform cloud cost management and FinOps.",
  openGraph: {
    title: "Investors | CloudAct.ai",
    description: "Investor relations at CloudAct.ai.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const KEY_METRICS = [
  {
    value: "$2.4M+",
    label: "Customer Savings",
    description: "Annual cloud cost savings for our customers",
  },
  {
    value: "340+",
    label: "Teams",
    description: "Engineering and FinOps teams using CloudAct.ai",
  },
  {
    value: "99.9%",
    label: "Uptime",
    description: "Platform reliability and availability",
  },
  {
    value: "50+",
    label: "Integrations",
    description: "Cloud, GenAI, and SaaS integrations",
  },
]

const MARKET_HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: "$200B+ Cloud Market",
    description: "The cloud infrastructure market continues to grow at 20%+ annually.",
  },
  {
    icon: DollarSign,
    title: "30% Cloud Waste",
    description: "Companies overspend by an average of 30% on cloud resources.",
  },
  {
    icon: BarChart3,
    title: "$50B+ GenAI Spend",
    description: "GenAI spending is projected to exceed $50B by 2027.",
  },
]

export default function InvestorsPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <TrendingUp className="w-4 h-4" />
            Investor Relations
          </div>
          <h1 className="ca-page-hero-title">
            Invest in the Future of <span className="ca-hero-highlight-mint">FinOps</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            CloudAct.ai is transforming how companies manage cloud and GenAI costs.
            We're building the intelligence layer for cloud financial operations.
          </p>
          <div className="ca-hero-cta-group">
            <a href="mailto:investors@cloudact.ai?subject=Investment Inquiry" className="ca-btn-hero-primary">
              Contact IR Team
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/about" className="ca-btn-hero-secondary">
              About Us
            </Link>
          </div>
        </div>
      </section>

      {/* Key Metrics Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <BarChart3 className="w-4 h-4" />
              Key Metrics
            </span>
            <h2 className="ca-section-title">Our growth at a glance</h2>
          </div>

          <div className="ca-investors-metrics-grid">
            {KEY_METRICS.map((metric, i) => (
              <div key={i} className="ca-investors-metric-card">
                <span className="ca-investors-metric-value">{metric.value}</span>
                <span className="ca-investors-metric-label">{metric.label}</span>
                <span className="ca-investors-metric-desc">{metric.description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Market Opportunity Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Target className="w-4 h-4" />
              Market Opportunity
            </span>
            <h2 className="ca-section-title">A massive and growing market</h2>
            <p className="ca-section-subtitle">
              The cloud cost management market is expanding rapidly as enterprises seek to optimize their spending.
            </p>
          </div>

          <div className="ca-investors-market-grid">
            {MARKET_HIGHLIGHTS.map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="ca-investors-market-card">
                  <div className="ca-investors-market-icon">
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="ca-investors-market-title">{item.title}</h3>
                  <p className="ca-investors-market-desc">{item.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Company Overview */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-investors-overview">
            <div className="ca-investors-overview-content">
              <h2 className="ca-investors-overview-title">Company Overview</h2>
              <p className="ca-investors-overview-text">
                CloudAct.ai provides a unified platform for managing cloud, GenAI, and SaaS costs.
                Our AI-powered solution helps engineering and finance teams gain visibility,
                optimize spending, and make data-driven decisions.
              </p>
              <p className="ca-investors-overview-text">
                Founded by cloud infrastructure veterans, we're backed by leading investors
                and trusted by companies ranging from startups to enterprises.
              </p>
              <ul className="ca-investors-overview-list">
                <li><strong>Founded:</strong> 2023</li>
                <li><strong>Headquarters:</strong> Sunnyvale, California</li>
                <li><strong>Stage:</strong> Series A</li>
                <li><strong>Team:</strong> 20+ employees across 8 countries</li>
              </ul>
            </div>
            <div className="ca-investors-overview-cta">
              <h3>Investor Resources</h3>
              <a href="mailto:investors@cloudact.ai?subject=Investor Deck Request" className="ca-investors-resource-link">
                <FileText className="w-5 h-5" />
                Request Investor Deck
                <ArrowRight className="w-4 h-4" />
              </a>
              <a href="mailto:investors@cloudact.ai?subject=Financial Information Request" className="ca-investors-resource-link">
                <BarChart3 className="w-5 h-5" />
                Financial Information
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-investors-contact">
            <h2 className="ca-investors-contact-title">Investor Relations Contact</h2>
            <p className="ca-investors-contact-desc">
              For investor inquiries, please contact our investor relations team.
            </p>
            <a href="mailto:investors@cloudact.ai" className="ca-investors-contact-email">
              <Mail className="w-5 h-5" />
              investors@cloudact.ai
            </a>
            <p className="ca-investors-contact-address">
              <strong>CloudAct Inc.</strong><br />
              100 S Murphy Ave, STE 200 PMB4013<br />
              Sunnyvale, CA 94086<br />
              United States
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Interested in CloudAct.ai?</h2>
          <p className="ca-final-cta-subtitle">
            Learn more about our mission and growth opportunities.
          </p>
          <div className="ca-final-cta-buttons">
            <a href="mailto:investors@cloudact.ai?subject=Investment Inquiry" className="ca-btn-cta-primary">
              Contact IR Team
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/about" className="ca-btn-cta-secondary">
              About Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
