import Link from "next/link"
import type { Metadata } from "next"
import { site, siteTitle } from "@/lib/site"
import {
  ArrowRight,
  Target,
  Shield,
  Sparkles,
  Users,
  TrendingUp,
  Heart,
  MapPin,
  Phone,
  Building2,
  Lightbulb,
  Info,
  BookOpen,
  Award,
  MessageCircle,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: siteTitle("About Us", "Our Mission & Story"),
  description: "Learn about CloudAct.ai's mission to democratize cost intelligence for the GenAI era. Meet our team and discover our values.",
  openGraph: {
    title: siteTitle("About Us"),
    description: "Democratizing cost intelligence for the GenAI era.",
    type: "website",
  },
}

// Company values
const VALUES = [
  {
    title: "Customer Obsessed",
    description: "We measure our success by the money we save our customers. Every feature is designed with your bottom line in mind.",
    icon: Target,
    color: "mint",
  },
  {
    title: "Trust & Transparency",
    description: "Your data is your most valuable asset. We're SOC 2 Type II certified and committed to the highest standards of security.",
    icon: Shield,
    color: "coral",
  },
  {
    title: "Innovation First",
    description: "The cloud and AI landscape changes daily. We stay ahead of the curve, continuously innovating to help you optimize.",
    icon: Lightbulb,
    color: "blue",
  },
  {
    title: "Built for Teams",
    description: "Cost optimization is a team sport. We bring engineering, finance, and leadership together around shared efficiency goals.",
    icon: Users,
    color: "purple",
  },
  {
    title: "Data-Driven Excellence",
    description: "Every recommendation is backed by real data and proven results. We analyze, test, and validate for measurable impact.",
    icon: TrendingUp,
    color: "mint",
  },
  {
    title: "Empathy & Impact",
    description: "We understand the pressure of managing budgets and delivering innovation. Our team supports you with expertise and care.",
    icon: Heart,
    color: "coral",
  },
]

// Team expertise areas
const EXPERTISE_AREAS = [
  { area: "Cloud Architecture", description: "AWS, GCP, Azure experts" },
  { area: "AI & Machine Learning", description: "GenAI optimization" },
  { area: "FinOps", description: "Cost management specialists" },
  { area: "Data Engineering", description: "BigQuery, analytics" },
]

// Platform stats
const PLATFORM_STATS = [
  { value: "50+", label: "Integrations", description: "Cloud, GenAI, and SaaS providers" },
  { value: "Real-time", label: "Cost Intelligence", description: "Live tracking and alerts" },
  { value: "AI-Powered", label: "Recommendations", description: "Smart optimization insights" },
  { value: "SOC 2", label: "Type II Certified", description: "Enterprise-grade security" },
]

export default function AboutPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Info className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            About Us
          </div>
          <h1 className="ca-page-hero-title">
            Democratizing Cost Intelligence{" "}
            <span className="font-semibold">for the GenAI Era</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            We believe every organization should have access to enterprise-grade cost intelligence.
            CloudAct.ai makes GenAI and cloud infrastructure affordable, transparent, and optimized.
          </p>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="ca-story-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <BookOpen className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            The Beginning
          </span>
          <h2 className="ca-section-title">{`How ${site.name} Started`}</h2>
        </div>

        <div className="ca-story-container">
          <div className="ca-story-card">
            <div className="ca-story-content">
              <p className="ca-story-lead">
                <span className="ca-story-dropcap">I</span>n early 2024, our founding team watched
                companies struggle with exploding GenAI costs. Engineering leaders couldn't explain
                why their OpenAI bills tripled overnight. Finance teams had no visibility into which
                features or users drove costs.
              </p>
              <p>
                We had all experienced this pain ourselves—seeing innovative AI projects shut down
                not because they didn't work, but because costs spiraled out of control. Millions of
                dollars were being wasted on inefficient prompts, redundant API calls, and unoptimized
                cloud resources.
              </p>
              <p>
                That's when we built the first version of CloudAct.ai in a weekend hackathon. A simple
                dashboard that tracked OpenAI usage by feature and user. Within weeks, our pilot customers
                were saving 40-60% on their GenAI bills. Word spread fast.
              </p>
              <p>
                Today, CloudAct.ai has grown into a comprehensive platform for GenAI and multi-cloud
                cost intelligence. We help teams gain visibility into their costs and find optimization
                opportunities—all while accelerating their AI innovation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="ca-about-stats-section">
        <div className="ca-about-stats-grid">
          {PLATFORM_STATS.map((stat) => (
            <div key={stat.label} className="ca-about-stat-card">
              <div className="ca-about-stat-value">{stat.value}</div>
              <div className="ca-about-stat-label">{stat.label}</div>
              <div className="ca-about-stat-desc">{stat.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Team Section */}
      <section className="ca-team-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Users className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Our Team
          </span>
          <h2 className="ca-section-title">{`Building ${site.name}`}</h2>
          <p className="ca-section-subtitle">
            We're a team of cloud infrastructure veterans, AI engineers, and data scientists
            passionate about making cost intelligence accessible to everyone.
          </p>
        </div>

        <div className="ca-team-expertise-card">
          <div className="ca-team-expertise-icon">
            <Users className="w-8 h-8" aria-hidden="true" />
          </div>
          <h3 className="ca-team-expertise-title">Our Expertise</h3>
          <p className="ca-team-expertise-desc">
            Our team brings deep expertise from leading cloud and AI companies. We combine experience
            in cloud infrastructure, machine learning, and FinOps to build the most comprehensive
            cost intelligence platform.
          </p>
          <div className="ca-team-expertise-grid">
            {EXPERTISE_AREAS.map((expertise) => (
              <div key={expertise.area} className="ca-team-expertise-item">
                <div className="ca-team-expertise-item-title">{expertise.area}</div>
                <div className="ca-team-expertise-item-desc">{expertise.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="ca-values-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Award className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Core Values
          </span>
          <h2 className="ca-section-title">What Drives Us Every Day</h2>
          <p className="ca-section-subtitle">
            Our values aren't just words on a wall—they guide every decision we make
            and every feature we build.
          </p>
        </div>

        <div className="ca-values-grid">
          {VALUES.map((value) => {
            const Icon = value.icon
            return (
              <div key={value.title} className={`ca-value-card ca-value-${value.color}`}>
                <div className={`ca-value-icon ca-value-icon-${value.color}`}>
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="ca-value-title">{value.title}</h3>
                <p className="ca-value-desc">{value.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Company Info */}
      <section className="ca-company-info-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <MessageCircle className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Get in Touch
          </span>
          <h2 className="ca-section-title">Our Office</h2>
        </div>

        <div className="ca-company-info-grid">
          <div className="ca-company-info-card">
            <div className="ca-company-info-icon">
              <MapPin className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-company-info-label">Address</h3>
            <p className="ca-company-info-value">
              100 S Murphy Ave, STE 200 PMB4013<br />
              Sunnyvale, CA 94086
            </p>
          </div>
          <div className="ca-company-info-card">
            <div className="ca-company-info-icon">
              <Phone className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-company-info-label">Phone</h3>
            <p className="ca-company-info-value">
              (850) 988-7471
            </p>
          </div>
          <div className="ca-company-info-card">
            <div className="ca-company-info-icon">
              <Building2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-company-info-label">Headquarters</h3>
            <p className="ca-company-info-value">
              Silicon Valley, California
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA - Careers */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            We're Hiring
          </div>
          <h2 className="ca-final-cta-title">Join Us in Building the Future</h2>
          <p className="ca-final-cta-subtitle">
            We're looking for exceptional engineers, designers, and leaders who want to make
            cost intelligence accessible to everyone. Work on cutting-edge AI and make real impact.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/careers" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              View Open Positions
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Get in Touch
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
