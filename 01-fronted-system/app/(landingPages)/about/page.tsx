import type { Metadata } from "next"
import {
  Target,
  Shield,
  Sparkles,
  Users,
  TrendingUp,
  Heart,
  Zap,
  Globe,
  Award,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About Us - Building the Future of Cost Intelligence | CloudAct.ai",
  description:
    "CloudAct.ai is on a mission to make GenAI and cloud infrastructure affordable for every organization. Meet our team, learn our story, and discover how we're transforming cost management with AI-powered intelligence.",
  openGraph: {
    title: "About Us - Building the Future of Cost Intelligence | CloudAct.ai",
    description:
      "Meet the team behind CloudAct.ai and learn how we're democratizing cost intelligence for the GenAI era.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Us - Building the Future of Cost Intelligence | CloudAct.ai",
    description: "Making GenAI and cloud infrastructure affordable for every organization.",
  },
}

export default function AboutPage() {
  return (
    <div className="ca-landing">
      {/* Hero Section */}
      <section className="ca-hero">
        <div className="ca-hero-bg">
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
          <div className="ca-hero-grid" />
        </div>

        <div className="ca-hero-content">
          <div className="ca-label ca-animate">Our Mission</div>
          <h1 className="ca-display-xl ca-animate ca-delay-1" style={{ marginTop: "1rem" }}>
            Democratizing Cost Intelligence{" "}
            <span className="ca-gradient-text">for the GenAI Era</span>
          </h1>
          <p
            className="ca-body ca-animate ca-delay-2"
            style={{ maxWidth: "700px", margin: "2rem auto 0" }}
          >
            We believe every organization should have access to enterprise-grade cost intelligence.
            CloudAct.ai makes GenAI and cloud infrastructure affordable, transparent, and optimized.
          </p>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="ca-section">
        <div className="ca-section-header">
          <div className="ca-section-label">The Beginning</div>
          <h2 className="ca-display-md">How CloudAct.ai Started</h2>
        </div>

        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="ca-card" style={{ padding: "3rem" }}>
            <div className="ca-body" style={{ fontSize: "1.125rem", lineHeight: "1.9" }}>
              <p style={{ marginBottom: "1.5rem" }}>
                <span
                  className="ca-gradient-text-teal"
                  style={{
                    fontSize: "4rem",
                    fontWeight: 700,
                    float: "left",
                    lineHeight: "3rem",
                    marginRight: "1rem",
                  }}
                >
                  I
                </span>
                n early 2024, our founding team watched companies struggle with exploding GenAI costs.
                Engineering leaders couldn't explain why their OpenAI bills tripled overnight. Finance teams
                had no visibility into which features or users drove costs. Developers lacked tools to
                optimize without sacrificing quality.
              </p>
              <p style={{ marginBottom: "1.5rem" }}>
                We had all experienced this pain ourselves—seeing innovative AI projects shut down not because
                they didn't work, but because costs spiraled out of control. Millions of dollars were being
                wasted on inefficient prompts, redundant API calls, and unoptimized cloud resources.
              </p>
              <p style={{ marginBottom: "1.5rem" }}>
                That's when we built the first version of CloudAct.ai in a weekend hackathon. A simple
                dashboard that tracked OpenAI usage by feature and user. Within weeks, our pilot customers
                were saving 40-60% on their GenAI bills. Word spread fast.
              </p>
              <p>
                Today, CloudAct.ai has grown into a comprehensive platform for GenAI and multi-cloud cost
                intelligence. We help teams gain visibility into their costs and find optimization opportunities
                —all while accelerating their AI innovation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="ca-stats-section">
        <div className="ca-stats-grid">
          <div>
            <div className="ca-stat-value">50+</div>
            <div className="ca-stat-label">Integrations</div>
          </div>
          <div>
            <div className="ca-stat-value">3</div>
            <div className="ca-stat-label">Cloud Providers</div>
          </div>
          <div>
            <div className="ca-stat-value">Real-time</div>
            <div className="ca-stat-label">Cost Intelligence</div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="ca-section">
        <div className="ca-section-header">
          <div className="ca-section-label">Our Team</div>
          <h2 className="ca-display-md">Building CloudAct.ai</h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "1rem auto 0" }}>
            We're a team of cloud infrastructure veterans, AI engineers, and data scientists passionate about
            making cost intelligence accessible to everyone.
          </p>
        </div>

        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div className="ca-card" style={{ padding: "3rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-teal" style={{ margin: "0 auto 1.5rem" }}>
              <Users size={32} />
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "1rem" }}>
              Our Expertise
            </h3>
            <p className="ca-body" style={{ marginBottom: "2rem" }}>
              Our team brings deep expertise from leading cloud and AI companies. We combine experience in
              cloud infrastructure, machine learning, and FinOps to build the most comprehensive cost
              intelligence platform.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "2rem", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div className="ca-subheading">Cloud Architecture</div>
                <p className="ca-body-sm">AWS, GCP, Azure experts</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="ca-subheading">AI & ML</div>
                <p className="ca-body-sm">GenAI optimization</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="ca-subheading">FinOps</div>
                <p className="ca-body-sm">Cost management specialists</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="ca-section" style={{ background: "var(--ca-gray-50)" }}>
        <div className="ca-section-header">
          <div className="ca-section-label">Core Values</div>
          <h2 className="ca-display-md">What Drives Us Every Day</h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "1rem auto 0" }}>
            Our values aren't just words on a wall—they guide every decision we make and every feature we
            build.
          </p>
        </div>

        <div className="ca-features-grid">
          {/* Value 1 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <Target size={28} />
            </div>
            <h3 className="ca-feature-title">Customer Obsessed</h3>
            <p className="ca-feature-desc">
              We measure our success by the money we save our customers. Every feature, every optimization,
              every improvement is designed with your bottom line and success in mind.
            </p>
          </div>

          {/* Value 2 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-coral">
              <Shield size={28} />
            </div>
            <h3 className="ca-feature-title">Trust & Transparency</h3>
            <p className="ca-feature-desc">
              Your data is your most valuable asset. We're SOC 2 Type II certified and committed to the
              highest standards of security, privacy, and complete transparency.
            </p>
          </div>

          {/* Value 3 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <Sparkles size={28} />
            </div>
            <h3 className="ca-feature-title">Innovation First</h3>
            <p className="ca-feature-desc">
              The cloud and AI landscape changes daily. We stay ahead of the curve, continuously innovating to
              help you optimize costs in new and better ways.
            </p>
          </div>

          {/* Value 4 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-coral">
              <Users size={28} />
            </div>
            <h3 className="ca-feature-title">Built for Teams</h3>
            <p className="ca-feature-desc">
              Cost optimization is a team sport. We build tools that bring engineering, finance, and
              leadership together around a shared goal: efficiency and innovation.
            </p>
          </div>

          {/* Value 5 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <TrendingUp size={28} />
            </div>
            <h3 className="ca-feature-title">Data-Driven Excellence</h3>
            <p className="ca-feature-desc">
              Every recommendation is backed by real data and proven results. We don't guess—we analyze,
              test, and validate to ensure measurable impact for your business.
            </p>
          </div>

          {/* Value 6 */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-coral">
              <Heart size={28} />
            </div>
            <h3 className="ca-feature-title">Empathy & Impact</h3>
            <p className="ca-feature-desc">
              We understand the pressure of managing budgets and delivering innovation. Our team is here to
              support you with expertise, empathy, and actionable solutions.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Capabilities */}
      <section className="ca-section">
        <div className="ca-section-header">
          <div className="ca-section-label">Platform Capabilities</div>
          <h2 className="ca-display-md">What We Offer</h2>
        </div>

        <div className="ca-features-grid">
          {/* Capability 1 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-teal" style={{ margin: "0 auto 1.5rem" }}>
              <Globe size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              50+
            </div>
            <p className="ca-body-sm">Integrations with cloud, GenAI, and SaaS providers</p>
          </div>

          {/* Capability 2 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-coral" style={{ margin: "0 auto 1.5rem" }}>
              <TrendingUp size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              Real-time
            </div>
            <p className="ca-body-sm">Cost tracking and anomaly detection</p>
          </div>

          {/* Capability 3 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-green" style={{ margin: "0 auto 1.5rem" }}>
              <Zap size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              AI-Powered
            </div>
            <p className="ca-body-sm">Optimization recommendations</p>
          </div>

          {/* Capability 4 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-teal" style={{ margin: "0 auto 1.5rem" }}>
              <Shield size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              SOC 2
            </div>
            <p className="ca-body-sm">Type II certified with enterprise-grade security</p>
          </div>
        </div>
      </section>

      {/* Join Us CTA */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <Sparkles size={16} />
              <span>We're Hiring</span>
            </div>
            <h2 className="ca-cta-title">Join Us in Building the Future</h2>
            <p className="ca-cta-subtitle">
              We're looking for exceptional engineers, designers, and leaders who want to make cost
              intelligence accessible to everyone. Work on cutting-edge AI, serve global customers, and make
              a real impact.
            </p>
            <div className="ca-cta-buttons">
              <Link href="/careers" className="ca-cta-btn-white">
                View Open Positions
                <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="ca-cta-btn-outline">
                Get in Touch
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
