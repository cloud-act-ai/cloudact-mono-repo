import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Play,
  Sparkles,
  Shield,
  Cpu,
  Cloud,
  CreditCard,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Book a Demo | CloudAct.ai",
  description: "Schedule a personalized demo of CloudAct.ai. See how our platform helps you track, analyze, and optimize GenAI, cloud, and SaaS costs.",
  openGraph: {
    title: "Book a Demo | CloudAct.ai",
    description: "See CloudAct.ai in action. Schedule your personalized demo today.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const DEMO_BENEFITS = [
  {
    icon: Cpu,
    title: "GenAI Cost Tracking",
    description: "See how we track OpenAI, Anthropic, and other LLM costs in real-time",
  },
  {
    icon: Cloud,
    title: "Multi-Cloud Analytics",
    description: "Unified view of AWS, Azure, and GCP spending",
  },
  {
    icon: CreditCard,
    title: "SaaS Management",
    description: "Track and optimize all your SaaS subscriptions",
  },
]

const WHAT_TO_EXPECT = [
  "Personalized walkthrough of the CloudAct.ai platform",
  "Custom demo based on your specific use cases",
  "Q&A session with our product experts",
  "Discussion of pricing and implementation",
  "No commitment required",
]

export default function DemoPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Play className="w-4 h-4" />
            Request Demo
          </div>
          <h1 className="ca-page-hero-title">
            See CloudAct.ai{" "}
            <span className="ca-hero-highlight-mint">In Action</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Get a personalized demo of how CloudAct.ai can help you track, analyze,
            and optimize your GenAI, cloud, and SaaS spending.
          </p>
          <div className="ca-demo-stats">
            <div className="ca-demo-stat">
              <Clock className="w-5 h-5" />
              <span>30 min session</span>
            </div>
            <div className="ca-demo-stat">
              <Users className="w-5 h-5" />
              <span>1-on-1 with expert</span>
            </div>
            <div className="ca-demo-stat">
              <Calendar className="w-5 h-5" />
              <span>Flexible scheduling</span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Form Section */}
      <section className="ca-demo-section">
        <div className="ca-demo-grid">
          {/* Left - Benefits */}
          <div className="ca-demo-benefits">
            <h2 className="ca-demo-benefits-title">What You'll See</h2>
            <div className="ca-demo-benefits-list">
              {DEMO_BENEFITS.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <div key={benefit.title} className="ca-demo-benefit-card">
                    <div className="ca-demo-benefit-icon">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="ca-demo-benefit-content">
                      <h3 className="ca-demo-benefit-title">{benefit.title}</h3>
                      <p className="ca-demo-benefit-desc">{benefit.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ca-demo-expect">
              <h3 className="ca-demo-expect-title">What to Expect</h3>
              <ul className="ca-demo-expect-list">
                {WHAT_TO_EXPECT.map((item, i) => (
                  <li key={i}>
                    <CheckCircle2 className="w-5 h-5 ca-icon-mint" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right - Form Placeholder */}
          <div className="ca-demo-form-container">
            <div className="ca-demo-form-card">
              <div className="ca-demo-form-header">
                <Play className="w-8 h-8 ca-icon-mint" />
                <h3 className="ca-demo-form-title">Schedule Your Demo</h3>
                <p className="ca-demo-form-desc">
                  Fill out the form below and we'll reach out to schedule your personalized demo.
                </p>
              </div>

              <form className="ca-demo-form">
                <div className="ca-form-row">
                  <div className="ca-form-group">
                    <label htmlFor="demo-firstName" className="ca-form-label">
                      First Name <span className="ca-form-required">*</span>
                    </label>
                    <input
                      id="demo-firstName"
                      type="text"
                      className="ca-form-input"
                      placeholder="John"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="ca-form-group">
                    <label htmlFor="demo-lastName" className="ca-form-label">
                      Last Name <span className="ca-form-required">*</span>
                    </label>
                    <input
                      id="demo-lastName"
                      type="text"
                      className="ca-form-input"
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className="ca-form-group">
                  <label htmlFor="demo-email" className="ca-form-label">
                    Work Email <span className="ca-form-required">*</span>
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    className="ca-form-input"
                    placeholder="john@company.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="ca-form-group">
                  <label htmlFor="demo-company" className="ca-form-label">
                    Company <span className="ca-form-required">*</span>
                  </label>
                  <input
                    id="demo-company"
                    type="text"
                    className="ca-form-input"
                    placeholder="Acme Inc."
                    autoComplete="organization"
                    required
                  />
                </div>

                <div className="ca-form-group">
                  <label htmlFor="demo-size" className="ca-form-label">
                    Company Size
                  </label>
                  <select id="demo-size" className="ca-form-select">
                    <option value="">Select size</option>
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="501+">501+ employees</option>
                  </select>
                </div>

                <div className="ca-form-group">
                  <label htmlFor="demo-interest" className="ca-form-label">
                    Primary Interest
                  </label>
                  <select id="demo-interest" className="ca-form-select">
                    <option value="">Select your main focus</option>
                    <option value="genai">GenAI Cost Management</option>
                    <option value="cloud">Cloud Infrastructure Costs</option>
                    <option value="saas">SaaS Subscription Tracking</option>
                    <option value="all">All of the Above</option>
                  </select>
                </div>

                <button type="submit" className="ca-btn-hero-primary ca-form-submit-btn">
                  Request Demo
                  <ArrowRight className="w-5 h-5" />
                </button>

                <p className="ca-form-disclaimer">
                  By submitting, you agree to our{" "}
                  <Link href="/privacy">Privacy Policy</Link> and{" "}
                  <Link href="/terms">Terms of Service</Link>.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="ca-demo-trust-section">
        <div className="ca-demo-trust-badges">
          <div className="ca-demo-trust-badge">
            <Shield className="w-5 h-5" />
            <span>SOC 2 Type II Certified</span>
          </div>
          <div className="ca-demo-trust-badge">
            <CheckCircle2 className="w-5 h-5" />
            <span>GDPR Compliant</span>
          </div>
          <div className="ca-demo-trust-badge">
            <Users className="w-5 h-5" />
            <span>500+ Teams Trust Us</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Sparkles className="w-4 h-4" />
            Prefer to try it yourself?
          </div>
          <h2 className="ca-final-cta-title">Start Your Free Trial</h2>
          <p className="ca-final-cta-subtitle">
            No demo needed? Jump right in with our 14-day free trial. No credit card required.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/pricing" className="ca-btn-cta-secondary">
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
