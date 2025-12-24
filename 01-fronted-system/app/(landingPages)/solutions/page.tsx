"use client"

import Link from "next/link"
import {
  ArrowRight,
  CheckCircle,
  TrendingDown,
  Users,
  BarChart3,
  Shield,
  Zap,
  DollarSign,
  Target,
  Eye,
  Settings,
  Award,
  Gauge,
  Clock,
  LineChart
} from "lucide-react"

export default function SolutionsPage() {
  return (
    <div className="ca-landing">
      {/* Hero Section */}
      <section className="ca-hero" style={{ minHeight: "80vh" }}>
        <div className="ca-hero-bg">
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
          <div className="ca-hero-grid" />
        </div>

        <div className="ca-hero-content">
          <div className="ca-animate">
            <span className="ca-label" style={{ marginBottom: "var(--space-6)", display: "block" }}>
              SOLUTIONS FOR EVERY TEAM
            </span>
            <h1 className="ca-display-xl" style={{ marginBottom: "var(--space-6)" }}>
              Built for How You{" "}
              <span className="ca-gradient-text">Actually Work</span>
            </h1>
            <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto var(--space-10)" }}>
              Whether you're a FinOps engineer optimizing costs, a CFO managing budgets, or a developer
              building GenAI features - we have the right solution for your workflow.
            </p>

            <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/signup" className="ca-btn ca-btn-primary ca-btn-lg">
                Start Free Trial
                <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="ca-btn ca-btn-secondary ca-btn-lg">
                Talk to Sales
              </Link>
            </div>
          </div>

          {/* Live Stats Ticker */}
          <div className="ca-ticker ca-animate ca-delay-2">
            <div className="ca-ticker-item">
              <div className="ca-ticker-dot" />
              <div>
                <div className="ca-ticker-label">Avg Savings</div>
                <div className="ca-ticker-value">32%</div>
              </div>
            </div>
            <div className="ca-ticker-item">
              <div className="ca-ticker-dot" style={{ background: "var(--ca-coral)" }} />
              <div>
                <div className="ca-ticker-label">Setup Time</div>
                <div className="ca-ticker-value">5 min</div>
              </div>
            </div>
            <div className="ca-ticker-item">
              <div className="ca-ticker-dot" style={{ background: "var(--ca-green)" }} />
              <div>
                <div className="ca-ticker-label">Teams Optimized</div>
                <div className="ca-ticker-value">2,400+</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions by Role */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">SOLUTIONS BY ROLE</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "var(--space-4)" }}>
            Every Role, Perfectly Supported
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            Custom workflows and insights designed for how each team actually works
          </p>
        </div>

        <div className="ca-features-grid">
          {/* FinOps */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <Gauge size={28} />
            </div>
            <h3 className="ca-feature-title">For FinOps Teams</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              Advanced cost allocation, chargeback automation, and executive reporting tools built for FinOps professionals.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Custom tagging strategies
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Automated cost allocation
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Multi-cloud normalization
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                FinOps maturity tracking
              </li>
            </ul>
          </div>

          {/* Engineering */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-coral">
              <Settings size={28} />
            </div>
            <h3 className="ca-feature-title">For Engineering Teams</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              Developer-friendly APIs, CI/CD integrations, and real-time cost feedback in your existing workflow.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Cost-per-deployment tracking
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                GenAI cost attribution
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Slack/Teams alerts
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Infrastructure as Code scanning
              </li>
            </ul>
          </div>

          {/* Finance */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <DollarSign size={28} />
            </div>
            <h3 className="ca-feature-title">For Finance Leaders</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              Budget controls, forecasting models, and financial reporting aligned with your accounting systems.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Budget vs. actual tracking
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Multi-currency support
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Monthly/quarterly reporting
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                ERP/accounting integrations
              </li>
            </ul>
          </div>

          {/* Executives */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-green">
              <BarChart3 size={28} />
            </div>
            <h3 className="ca-feature-title">For Executives</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              High-level dashboards, ROI tracking, and strategic insights to inform cloud investment decisions.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-green)", flexShrink: 0, marginTop: "2px" }} />
                Executive summary reports
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-green)", flexShrink: 0, marginTop: "2px" }} />
                Strategic cost trends
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-green)", flexShrink: 0, marginTop: "2px" }} />
                Cloud ROI metrics
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-green)", flexShrink: 0, marginTop: "2px" }} />
                Savings opportunity pipeline
              </li>
            </ul>
          </div>

          {/* Product Teams */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-coral">
              <Target size={28} />
            </div>
            <h3 className="ca-feature-title">For Product Teams</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              Feature-level cost tracking, unit economics, and profitability analysis for product decisions.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Cost per user/transaction
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Feature profitability
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                A/B test cost impact
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-coral)", flexShrink: 0, marginTop: "2px" }} />
                Product margin analysis
              </li>
            </ul>
          </div>

          {/* DevOps */}
          <div className="ca-feature-card">
            <div className="ca-feature-icon ca-feature-icon-teal">
              <Zap size={28} />
            </div>
            <h3 className="ca-feature-title">For DevOps Teams</h3>
            <p className="ca-feature-desc" style={{ marginBottom: "var(--space-5)" }}>
              Infrastructure optimization, rightsizing recommendations, and automated remediation workflows.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Automated rightsizing
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Idle resource detection
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Kubernetes cost optimization
              </li>
              <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                <CheckCircle size={18} style={{ color: "var(--ca-teal)", flexShrink: 0, marginTop: "2px" }} />
                Reserved instance planning
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Solutions by Challenge */}
      <section className="ca-section" style={{ background: "var(--ca-gray-50)" }}>
        <div className="ca-section-header">
          <span className="ca-section-label">SOLUTIONS BY CHALLENGE</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "var(--space-4)" }}>
            Solve Your Biggest Cost Challenges
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            Purpose-built solutions for the most common cloud cost problems
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-6)", maxWidth: "1100px", margin: "0 auto" }} className="ca-responsive-grid">
          {/* Cost Visibility */}
          <div className="ca-card" style={{ padding: "var(--space-10)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
              <div className="ca-feature-icon ca-feature-icon-teal" style={{ width: "64px", height: "64px" }}>
                <Eye size={32} />
              </div>
              <div>
                <h3 className="ca-display-md" style={{ marginBottom: "var(--space-2)" }}>Cost Visibility</h3>
                <p className="ca-body-sm">See exactly where every dollar goes</p>
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ marginBottom: "var(--space-3)" }}>Real-time cost dashboards</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Team/project cost breakdown</li>
              <li style={{ marginBottom: "var(--space-3)" }}>GenAI usage tracking</li>
              <li>Multi-cloud unified view</li>
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--ca-teal-50)", borderRadius: "12px" }}>
              <TrendingDown size={24} style={{ color: "var(--ca-teal)" }} />
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--ca-gray-500)", fontWeight: 600 }}>AVG IMPROVEMENT</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ca-teal)" }}>2.5x faster insights</div>
              </div>
            </div>
          </div>

          {/* Budget Management */}
          <div className="ca-card" style={{ padding: "var(--space-10)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
              <div className="ca-feature-icon ca-feature-icon-coral" style={{ width: "64px", height: "64px" }}>
                <Shield size={32} />
              </div>
              <div>
                <h3 className="ca-display-md" style={{ marginBottom: "var(--space-2)" }}>Budget Management</h3>
                <p className="ca-body-sm">Stay on budget automatically</p>
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ marginBottom: "var(--space-3)" }}>Custom budget alerts</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Anomaly detection</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Automated spending controls</li>
              <li>Forecast accuracy tracking</li>
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--ca-coral-50)", borderRadius: "12px" }}>
              <Clock size={24} style={{ color: "var(--ca-coral)" }} />
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--ca-gray-500)", fontWeight: 600 }}>TIME SAVED</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ca-coral)" }}>15 hours/month</div>
              </div>
            </div>
          </div>

          {/* Cost Optimization */}
          <div className="ca-card" style={{ padding: "var(--space-10)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
              <div className="ca-feature-icon ca-feature-icon-green" style={{ width: "64px", height: "64px" }}>
                <LineChart size={32} />
              </div>
              <div>
                <h3 className="ca-display-md" style={{ marginBottom: "var(--space-2)" }}>Cost Optimization</h3>
                <p className="ca-body-sm">Reduce waste, maximize efficiency</p>
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ marginBottom: "var(--space-3)" }}>AI-powered recommendations</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Idle resource cleanup</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Reserved instance planning</li>
              <li>Commitment optimization</li>
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--ca-green-light)", borderRadius: "12px" }}>
              <Award size={24} style={{ color: "var(--ca-green)" }} />
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--ca-gray-500)", fontWeight: 600 }}>COST REDUCTION</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ca-green)" }}>32% average</div>
              </div>
            </div>
          </div>

          {/* GenAI Cost Control */}
          <div className="ca-card" style={{ padding: "var(--space-10)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
              <div className="ca-feature-icon ca-feature-icon-teal" style={{ width: "64px", height: "64px" }}>
                <Zap size={32} />
              </div>
              <div>
                <h3 className="ca-display-md" style={{ marginBottom: "var(--space-2)" }}>GenAI Cost Control</h3>
                <p className="ca-body-sm">Optimize LLM and AI workloads</p>
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-6) 0", fontSize: "0.9375rem", color: "var(--ca-gray-600)" }}>
              <li style={{ marginBottom: "var(--space-3)" }}>Token usage tracking</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Model cost comparison</li>
              <li style={{ marginBottom: "var(--space-3)" }}>Prompt optimization insights</li>
              <li>OpenAI/Anthropic/AWS integration</li>
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--ca-teal-50)", borderRadius: "12px" }}>
              <Users size={24} style={{ color: "var(--ca-teal)" }} />
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--ca-gray-500)", fontWeight: 600 }}>GENAI SAVINGS</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ca-teal)" }}>Up to 45%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Case Study Highlights */}
      <section className="ca-section">
        <div className="ca-section-header">
          <span className="ca-section-label">SUCCESS STORIES</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "var(--space-4)" }}>
            Real Teams, Real Results
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-6)", maxWidth: "1200px", margin: "0 auto" }} className="ca-case-studies">
          <div className="ca-card" style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "var(--space-4)" }}>🚀</div>
            <div className="ca-metric-value" style={{ color: "var(--ca-coral)", marginBottom: "var(--space-2)" }}>$2.4M</div>
            <div className="ca-heading" style={{ marginBottom: "var(--space-3)" }}>Annual Savings</div>
            <p className="ca-body-sm" style={{ marginBottom: "var(--space-4)" }}>
              SaaS company reduced GenAI costs by 42% with token optimization
            </p>
            <div className="ca-label">FINTECH • SERIES B</div>
          </div>

          <div className="ca-card" style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "var(--space-4)" }}>📊</div>
            <div className="ca-metric-value" style={{ color: "var(--ca-teal)", marginBottom: "var(--space-2)" }}>3 days</div>
            <div className="ca-heading" style={{ marginBottom: "var(--space-3)" }}>to Full Visibility</div>
            <p className="ca-body-sm" style={{ marginBottom: "var(--space-4)" }}>
              Enterprise team got complete cost visibility across 200+ services
            </p>
            <div className="ca-label">HEALTHCARE • ENTERPRISE</div>
          </div>

          <div className="ca-card" style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "var(--space-4)" }}>⚡</div>
            <div className="ca-metric-value" style={{ color: "var(--ca-green)", marginBottom: "var(--space-2)" }}>68%</div>
            <div className="ca-heading" style={{ marginBottom: "var(--space-3)" }}>Idle Resource Reduction</div>
            <p className="ca-body-sm" style={{ marginBottom: "var(--space-4)" }}>
              DevOps team automated cleanup of unused cloud resources
            </p>
            <div className="ca-label">E-COMMERCE • GROWTH</div>
          </div>
        </div>
      </section>

      {/* Integration Ecosystem */}
      <section className="ca-section" style={{ background: "var(--ca-gray-50)" }}>
        <div className="ca-section-header">
          <span className="ca-section-label">SEAMLESS INTEGRATIONS</span>
          <h2 className="ca-display-lg" style={{ marginBottom: "var(--space-4)" }}>
            Works with Your Entire Stack
          </h2>
          <p className="ca-body" style={{ maxWidth: "700px", margin: "0 auto" }}>
            Connect CloudAct to your cloud providers, GenAI platforms, and business tools in minutes
          </p>
        </div>

        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            {/* Cloud Providers */}
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>☁️</div>
              <div className="ca-subheading">GCP</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>☁️</div>
              <div className="ca-subheading">AWS</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>☁️</div>
              <div className="ca-subheading">Azure</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>🔷</div>
              <div className="ca-subheading">Kubernetes</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            {/* GenAI Platforms */}
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>🤖</div>
              <div className="ca-subheading">OpenAI</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>🧠</div>
              <div className="ca-subheading">Anthropic</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>⚡</div>
              <div className="ca-subheading">Bedrock</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>🔮</div>
              <div className="ca-subheading">Vertex AI</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-4)" }}>
            {/* Business Tools */}
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>💬</div>
              <div className="ca-subheading">Slack</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>📧</div>
              <div className="ca-subheading">Email</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>📊</div>
              <div className="ca-subheading">Jira</div>
            </div>
            <div className="ca-card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>🔔</div>
              <div className="ca-subheading">PagerDuty</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "var(--space-10)" }}>
          <Link href="/integrations" className="ca-btn ca-btn-secondary">
            View All Integrations
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <div className="ca-ticker-dot" style={{ background: "white" }} />
              <span>Join 2,400+ teams optimizing costs</span>
            </div>

            <h2 className="ca-cta-title">
              Ready to Solve Your Cost Challenge?
            </h2>
            <p className="ca-cta-subtitle">
              Start your free 14-day trial. No credit card required. Setup in 5 minutes.
            </p>

            <div className="ca-cta-buttons">
              <Link href="/signup" className="ca-cta-btn-white">
                Start Free Trial
                <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="ca-cta-btn-outline">
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile responsive styles */}
      <style jsx>{`
        @media (max-width: 768px) {
          .ca-responsive-grid {
            grid-template-columns: 1fr !important;
          }
          .ca-case-studies {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
