import { Metadata } from "next"
import Link from "next/link"
import { site, siteTitle } from "@/lib/site"
import {
  ArrowRight,
  CheckCircle2,
  Users,
  BarChart3,
  Shield,
  Zap,
  DollarSign,
  Target,
  Eye,
  Settings,
  Gauge,
  LineChart,
  Sparkles,
  Building2,
  Code2,
  PieChart,
  TrendingDown,
  Cpu,
  Puzzle,
  UserCog,
  AlertTriangle,
  Briefcase,
  Award,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: siteTitle("Solutions", "Cost Intelligence for Every Team"),
  description: "Purpose-built cost solutions for FinOps, Engineering, Finance, and DevOps teams. Solve visibility, budget, and optimization challenges.",
  openGraph: {
    title: siteTitle("Solutions"),
    description: "Cost intelligence solutions for every team and challenge.",
    type: "website",
  },
}

// Role-based solutions data
const ROLE_SOLUTIONS = [
  {
    id: "finops",
    title: "For FinOps Teams",
    icon: Gauge,
    description: "Advanced cost allocation, chargeback automation, and executive reporting tools built for FinOps professionals.",
    color: "mint",
    features: [
      "Custom tagging strategies",
      "Automated cost allocation",
      "Multi-cloud normalization",
      "FinOps maturity tracking",
    ],
  },
  {
    id: "engineering",
    title: "For Engineering Teams",
    icon: Code2,
    description: "Developer-friendly APIs, CI/CD integrations, and real-time cost feedback in your existing workflow.",
    color: "coral",
    features: [
      "Cost-per-deployment tracking",
      "GenAI cost attribution",
      "Slack/Teams alerts",
      "Infrastructure as Code scanning",
    ],
  },
  {
    id: "finance",
    title: "For Finance Leaders",
    icon: DollarSign,
    description: "Budget controls, forecasting models, and financial reporting aligned with your accounting systems.",
    color: "blue",
    features: [
      "Budget vs. actual tracking",
      "Multi-currency support",
      "Monthly/quarterly reporting",
      "ERP/accounting integrations",
    ],
  },
  {
    title: "For Executives",
    icon: BarChart3,
    description: "High-level dashboards, ROI tracking, and strategic insights to inform cloud investment decisions.",
    color: "purple",
    features: [
      "Executive summary reports",
      "Strategic cost trends",
      "Cloud ROI metrics",
      "Savings opportunity pipeline",
    ],
  },
  {
    title: "For Product Teams",
    icon: Target,
    description: "Feature-level cost tracking, unit economics, and profitability analysis for product decisions.",
    color: "coral",
    features: [
      "Cost per user/transaction",
      "Feature profitability",
      "A/B test cost impact",
      "Product margin analysis",
    ],
  },
  {
    title: "For DevOps Teams",
    icon: Settings,
    description: "Infrastructure optimization, rightsizing recommendations, and automated remediation workflows.",
    color: "mint",
    features: [
      "Automated rightsizing",
      "Idle resource detection",
      "Kubernetes cost optimization",
      "Reserved instance planning",
    ],
  },
]

// Challenge-based solutions
const CHALLENGE_SOLUTIONS = [
  {
    title: "Cost Visibility",
    subtitle: "See exactly where every dollar goes",
    icon: Eye,
    color: "mint",
    features: [
      "Real-time cost dashboards",
      "Team/project cost breakdown",
      "GenAI usage tracking",
      "Multi-cloud unified view",
    ],
    benefit: "Instant visibility",
  },
  {
    title: "Budget Management",
    subtitle: "Stay on budget automatically",
    icon: Shield,
    color: "coral",
    features: [
      "Custom budget alerts",
      "Anomaly detection",
      "Automated spending controls",
      "Forecast accuracy tracking",
    ],
    benefit: "Automated alerts",
  },
  {
    title: "Cost Optimization",
    subtitle: "Reduce waste, maximize efficiency",
    icon: LineChart,
    color: "blue",
    features: [
      "AI-powered recommendations",
      "Idle resource cleanup",
      "Reserved instance planning",
      "Commitment optimization",
    ],
    benefit: "AI recommendations",
  },
  {
    title: "GenAI Cost Control",
    subtitle: "Optimize LLM and AI workloads",
    icon: Cpu,
    color: "purple",
    features: [
      "Token usage tracking",
      "Model cost comparison",
      "Prompt optimization insights",
      "OpenAI/Anthropic/AWS integration",
    ],
    benefit: "Token optimization",
  },
]

// Use cases
const USE_CASES = [
  {
    title: "GenAI Cost Optimization",
    subtitle: "AI-First Teams",
    description: "Track token usage and optimize LLM costs across OpenAI, Anthropic, and more",
    color: "coral",
  },
  {
    title: "Unified Cost Visibility",
    subtitle: "Multi-Cloud Teams",
    description: "Get complete cost visibility across all cloud and SaaS providers",
    color: "mint",
  },
  {
    title: "Smart Resource Management",
    subtitle: "DevOps Teams",
    description: "Identify idle resources and get AI-powered optimization recommendations",
    color: "blue",
  },
]

export default function SolutionsPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Puzzle className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            Solutions
          </div>
          <h1 className="ca-page-hero-title">
            Built for How You{" "}
            <span className="font-semibold">Actually Work</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Whether you're a FinOps engineer optimizing costs, a CFO managing budgets, or a developer
            building GenAI features - we have the right solution for your workflow.
          </p>
          <div className="ca-page-hero-actions">
            <Link href="/signup" className="ca-btn-hero-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="ca-btn-hero-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Solutions by Role */}
      <section className="ca-solutions-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <UserCog className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            By Role
          </span>
          <h2 className="ca-section-title">Every Role, Perfectly Supported</h2>
          <p className="ca-section-subtitle">
            Custom workflows and insights designed for how each team actually works
          </p>
        </div>

        <div className="ca-solutions-role-grid">
          {ROLE_SOLUTIONS.map((solution) => {
            const Icon = solution.icon
            return (
              <div
                key={solution.title}
                id={solution.id}
                className={`ca-solution-role-card ca-solution-role-${solution.color}`}
              >
                <div className={`ca-solution-role-icon ca-solution-role-icon-${solution.color}`}>
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="ca-solution-role-title">{solution.title}</h3>
                <p className="ca-solution-role-desc">{solution.description}</p>
                <ul className="ca-solution-role-features">
                  {solution.features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Solutions by Challenge */}
      <section className="ca-challenges-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <AlertTriangle className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            By Challenge
          </span>
          <h2 className="ca-section-title">Solve Your Biggest Cost Challenges</h2>
          <p className="ca-section-subtitle">
            Purpose-built solutions for the most common cloud cost problems
          </p>
        </div>

        <div className="ca-challenges-grid">
          {CHALLENGE_SOLUTIONS.map((challenge) => {
            const Icon = challenge.icon
            return (
              <div
                key={challenge.title}
                className={`ca-challenge-card ca-challenge-${challenge.color}`}
              >
                <div className="ca-challenge-header">
                  <div className={`ca-challenge-icon ca-challenge-icon-${challenge.color}`}>
                    <Icon className="w-7 h-7" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="ca-challenge-title">{challenge.title}</h3>
                    <p className="ca-challenge-subtitle">{challenge.subtitle}</p>
                  </div>
                </div>
                <ul className="ca-challenge-features">
                  {challenge.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className={`ca-challenge-benefit ca-challenge-benefit-${challenge.color}`}>
                  <TrendingDown className="w-5 h-5" aria-hidden="true" />
                  <div>
                    <span className="ca-challenge-benefit-label">Key Benefit</span>
                    <span className="ca-challenge-benefit-value">{challenge.benefit}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Use Cases */}
      <section className="ca-usecases-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Briefcase className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            Use Cases
          </span>
          <h2 className="ca-section-title">{`How Teams Use ${site.name}`}</h2>
        </div>

        <div className="ca-usecases-grid">
          {USE_CASES.map((useCase) => (
            <div
              key={useCase.title}
              className={`ca-usecase-card ca-usecase-${useCase.color}`}
            >
              <div className={`ca-usecase-badge ca-usecase-badge-${useCase.color}`}>
                {useCase.subtitle}
              </div>
              <h3 className="ca-usecase-title">{useCase.title}</h3>
              <p className="ca-usecase-desc">{useCase.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Industry Solutions */}
      <section className="ca-industry-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Building2 className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            By Industry
          </span>
          <h2 className="ca-section-title">Trusted Across Industries</h2>
          <p className="ca-section-subtitle">
            Tailored solutions for the unique cost challenges of every industry
          </p>
        </div>

        <div className="ca-industry-grid">
          <div id="enterprise" className="ca-industry-card">
            <div className="ca-industry-icon">
              <Building2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-industry-title">Enterprise</h3>
            <p className="ca-industry-desc">
              Multi-cloud governance, chargeback automation, and executive reporting for large organizations.
            </p>
          </div>
          <div className="ca-industry-card">
            <div className="ca-industry-icon">
              <Zap className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-industry-title">SaaS & Tech</h3>
            <p className="ca-industry-desc">
              GenAI cost tracking, unit economics, and COGS optimization for software companies.
            </p>
          </div>
          <div id="partners" className="ca-industry-card">
            <div className="ca-industry-icon">
              <PieChart className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-industry-title">Partners & MSPs</h3>
            <p className="ca-industry-desc">
              Multi-tenant cost management and white-label reporting for managed service providers.
            </p>
          </div>
          <div id="startups" className="ca-industry-card">
            <div className="ca-industry-icon">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="ca-industry-title">Startups</h3>
            <p className="ca-industry-desc">
              Cost-efficient growth, runway optimization, and investor-ready reporting for growing teams.
            </p>
          </div>
        </div>
      </section>

      {/* Why CloudAct - Removed ca-section-gray, using white with brand gradient */}
      <section className="ca-why-section" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Award className="w-4 h-4" aria-hidden="true" style={{ color: '#ffffff' }} />
            Why CloudAct.ai
          </span>
          <h2 className="ca-section-title">The Platform Advantage</h2>
        </div>

        <div className="ca-why-grid">
          <div className="ca-why-card">
            <div className="ca-why-stat">5 min</div>
            <div className="ca-why-label">Setup Time</div>
            <p className="ca-why-desc">Connect your first integration in under 5 minutes with our guided setup.</p>
          </div>
          <div className="ca-why-card">
            <div className="ca-why-stat">50+</div>
            <div className="ca-why-label">Integrations</div>
            <p className="ca-why-desc">Connect all your cloud, GenAI, and SaaS tools in one unified platform.</p>
          </div>
          <div className="ca-why-card">
            <div className="ca-why-stat">Real-time</div>
            <div className="ca-why-label">Cost Tracking</div>
            <p className="ca-why-desc">See costs as they happen, not days or weeks later. Act fast on anomalies.</p>
          </div>
          <div className="ca-why-card">
            <div className="ca-why-stat">AI</div>
            <div className="ca-why-label">Recommendations</div>
            <p className="ca-why-desc">Machine learning identifies savings opportunities you might miss.</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Find Your Solution
          </div>
          <h2 className="ca-final-cta-title">Ready to Solve Your Cost Challenge?</h2>
          <p className="ca-final-cta-subtitle">
            Start your free 14-day trial. No credit card required. Setup in 5 minutes.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Talk to Sales
            </Link>
          </div>
          <p className="ca-final-cta-note">
            No credit card required • Cancel anytime • 30-day money-back guarantee
          </p>
        </div>
      </section>
    </div>
  )
}
