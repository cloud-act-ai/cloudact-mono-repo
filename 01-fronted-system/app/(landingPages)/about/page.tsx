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
                Today, CloudAct.ai has grown into the leading platform for GenAI and multi-cloud cost
                intelligence. We serve over 500 companies, manage $50M+ in annual cloud spend, and help teams
                reduce costs by an average of 67%—all while accelerating their AI innovation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="ca-stats-section">
        <div className="ca-stats-grid">
          <div>
            <div className="ca-stat-value">500+</div>
            <div className="ca-stat-label">Companies Trust Us</div>
          </div>
          <div>
            <div className="ca-stat-value">$50M+</div>
            <div className="ca-stat-label">Costs Optimized Annually</div>
          </div>
          <div>
            <div className="ca-stat-value">67%</div>
            <div className="ca-stat-label">Average Cost Reduction</div>
          </div>
        </div>
      </section>

      {/* Team/Leadership Section */}
      <section className="ca-section">
        <div className="ca-section-header">
          <div className="ca-section-label">Leadership</div>
          <h2 className="ca-display-md">Meet the Team Building CloudAct.ai</h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "1rem auto 0" }}>
            We're a team of cloud infrastructure veterans, AI engineers, and data scientists passionate about
            making cost intelligence accessible to everyone.
          </p>
        </div>

        <div className="ca-features-grid">
          {/* Team Member 1 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #007A78 0%, #005C5A 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              SM
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Sarah Mitchell
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              Co-Founder & CEO
            </p>
            <p className="ca-body-sm">
              Former Head of Cloud Infrastructure at a Fortune 500 company. 15+ years building scalable
              systems. MIT Computer Science.
            </p>
          </div>

          {/* Team Member 2 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #FF6E50 0%, #E55A3C 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              AK
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Alex Kim
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              Co-Founder & CTO
            </p>
            <p className="ca-body-sm">
              AI researcher and engineer with 12+ years at Google Brain and OpenAI. PhD in Machine Learning
              from Stanford.
            </p>
          </div>

          {/* Team Member 3 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #007A78 0%, #FF6E50 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              RP
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Raj Patel
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              VP of Engineering
            </p>
            <p className="ca-body-sm">
              Built cost optimization systems at AWS and Azure. 10+ years in cloud architecture. Carnegie
              Mellon Engineering.
            </p>
          </div>

          {/* Team Member 4 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              LW
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Lisa Wang
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              Head of Product
            </p>
            <p className="ca-body-sm">
              Product leader from Stripe and Databricks. Specialized in FinOps and developer tools. Berkeley
              MBA.
            </p>
          </div>

          {/* Team Member 5 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              MC
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Marcus Chen
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              VP of Customer Success
            </p>
            <p className="ca-body-sm">
              Customer success veteran from Snowflake and MongoDB. 8+ years helping enterprises adopt cloud
              technologies.
            </p>
          </div>

          {/* Team Member 6 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "2.5rem",
                fontWeight: 700,
                margin: "0 auto 1.5rem",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              EN
            </div>
            <h3 className="ca-heading" style={{ marginBottom: "0.5rem" }}>
              Elena Novak
            </h3>
            <p className="ca-label" style={{ marginBottom: "1rem" }}>
              Head of Security
            </p>
            <p className="ca-body-sm">
              Security architect with SOC 2 and ISO 27001 expertise. Former security lead at Cloudflare and
              Auth0.
            </p>
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

      {/* Additional Stats */}
      <section className="ca-section">
        <div className="ca-section-header">
          <div className="ca-section-label">By the Numbers</div>
          <h2 className="ca-display-md">Impact at Scale</h2>
        </div>

        <div className="ca-features-grid">
          {/* Stat 1 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-teal" style={{ margin: "0 auto 1.5rem" }}>
              <Users size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              500+
            </div>
            <p className="ca-body-sm">Companies across 40+ countries trust CloudAct.ai</p>
          </div>

          {/* Stat 2 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-coral" style={{ margin: "0 auto 1.5rem" }}>
              <TrendingUp size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              $50M+
            </div>
            <p className="ca-body-sm">Total cloud and GenAI costs optimized annually</p>
          </div>

          {/* Stat 3 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-green" style={{ margin: "0 auto 1.5rem" }}>
              <Zap size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              67%
            </div>
            <p className="ca-body-sm">Average cost reduction without performance loss</p>
          </div>

          {/* Stat 4 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-teal" style={{ margin: "0 auto 1.5rem" }}>
              <Globe size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              12+
            </div>
            <p className="ca-body-sm">Cloud and GenAI provider integrations supported</p>
          </div>

          {/* Stat 5 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-coral" style={{ margin: "0 auto 1.5rem" }}>
              <Heart size={32} />
            </div>
            <div className="ca-stat-value" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              98%
            </div>
            <p className="ca-body-sm">Customer satisfaction and retention rate</p>
          </div>

          {/* Stat 6 */}
          <div className="ca-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div className="ca-feature-icon ca-feature-icon-green" style={{ margin: "0 auto 1.5rem" }}>
              <Award size={32} />
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
