"use client"

import { useState, type FormEvent } from "react"
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
  Send,
} from "lucide-react"
import "../premium.css"

interface FormData {
  firstName: string
  lastName: string
  email: string
  company: string
  companySize: string
  interest: string
}

interface ValidationErrors {
  [key: string]: string
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

const COMPANY_SIZES = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
]

const INTERESTS = [
  { value: "genai", label: "GenAI Cost Management" },
  { value: "cloud", label: "Cloud Infrastructure Costs" },
  { value: "saas", label: "SaaS Subscription Tracking" },
  { value: "all", label: "All of the Above" },
]

export default function DemoPage() {
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    companySize: "",
    interest: "",
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required"
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required"
    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
      newErrors.email = "Please enter a valid work email"
    }
    if (!formData.company.trim()) newErrors.company = "Company is required"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          company: formData.company,
          companySize: formData.companySize,
          interests: formData.interest ? [formData.interest] : [],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.errors) {
          setErrors(data.errors)
        } else {
          setErrors({ form: data.error || "Something went wrong. Please try again." })
        }
        return
      }

      setIsSuccess(true)
      setFormData({ firstName: "", lastName: "", email: "", company: "", companySize: "", interest: "" })
    } catch {
      setErrors({ form: "Network error. Please check your connection and try again." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => { const newErrors = { ...prev }; delete newErrors[field]; return newErrors })
    }
  }

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Play className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Request Demo
          </div>
          <h1 className="ca-page-hero-title">
            See CloudAct.ai{" "}
            <span className="font-semibold">In Action</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Get a personalized demo of how CloudAct.ai can help you track, analyze,
            and optimize your GenAI, cloud, and SaaS spending.
          </p>
          <div className="ca-demo-stats">
            <div className="ca-demo-stat">
              <Clock className="w-5 h-5" aria-hidden="true" />
              <span>30 min session</span>
            </div>
            <div className="ca-demo-stat">
              <Users className="w-5 h-5" aria-hidden="true" />
              <span>1-on-1 with expert</span>
            </div>
            <div className="ca-demo-stat">
              <Calendar className="w-5 h-5" aria-hidden="true" />
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
            <h2 className="ca-demo-benefits-title">What You&apos;ll See</h2>
            <div className="ca-demo-benefits-list">
              {DEMO_BENEFITS.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <div key={benefit.title} className="ca-demo-benefit-card">
                    <div className="ca-demo-benefit-icon">
                      <Icon className="w-6 h-6" aria-hidden="true" />
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
                {WHAT_TO_EXPECT.map((item) => (
                  <li key={item}>
                    <CheckCircle2 className="w-5 h-5 ca-icon-mint" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right - Form */}
          <div className="ca-demo-form-container">
            <div className="ca-demo-form-card">
              {isSuccess ? (
                <div className="ca-demo-form-success">
                  <CheckCircle2 className="w-16 h-16 ca-icon-mint" aria-hidden="true" />
                  <h3>Demo Request Received!</h3>
                  <p>
                    Thank you for your interest in CloudAct.ai. We&apos;ll contact you within 24 hours
                    to schedule your personalized demo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSuccess(false)}
                    className="ca-btn-hero-secondary"
                    style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
                  >
                    Submit Another Request
                  </button>
                </div>
              ) : (
                <>
                  <div className="ca-demo-form-header">
                    <Play className="w-8 h-8 ca-icon-mint" aria-hidden="true" />
                    <h3 className="ca-demo-form-title">Schedule Your Demo</h3>
                    <p className="ca-demo-form-desc">
                      Fill out the form below and we&apos;ll reach out to schedule your personalized demo.
                    </p>
                  </div>

                  {errors.form && (
                    <div className="ca-form-error-banner">{errors.form}</div>
                  )}

                  <form onSubmit={handleSubmit} className="ca-demo-form">
                    <div className="ca-form-row">
                      <div className="ca-form-group">
                        <label htmlFor="demo-firstName" className="ca-form-label">
                          First Name <span className="ca-form-required">*</span>
                        </label>
                        <input
                          id="demo-firstName"
                          type="text"
                          className={`ca-form-input ${errors.firstName ? "error" : ""}`}
                          placeholder="John"
                          autoComplete="given-name"
                          value={formData.firstName}
                          onChange={(e) => handleChange("firstName", e.target.value)}
                        />
                        {errors.firstName && <span className="ca-form-error">{errors.firstName}</span>}
                      </div>
                      <div className="ca-form-group">
                        <label htmlFor="demo-lastName" className="ca-form-label">
                          Last Name <span className="ca-form-required">*</span>
                        </label>
                        <input
                          id="demo-lastName"
                          type="text"
                          className={`ca-form-input ${errors.lastName ? "error" : ""}`}
                          placeholder="Doe"
                          autoComplete="family-name"
                          value={formData.lastName}
                          onChange={(e) => handleChange("lastName", e.target.value)}
                        />
                        {errors.lastName && <span className="ca-form-error">{errors.lastName}</span>}
                      </div>
                    </div>

                    <div className="ca-form-group">
                      <label htmlFor="demo-email" className="ca-form-label">
                        Work Email <span className="ca-form-required">*</span>
                      </label>
                      <input
                        id="demo-email"
                        type="email"
                        className={`ca-form-input ${errors.email ? "error" : ""}`}
                        placeholder="john@company.com"
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                      />
                      {errors.email && <span className="ca-form-error">{errors.email}</span>}
                    </div>

                    <div className="ca-form-group">
                      <label htmlFor="demo-company" className="ca-form-label">
                        Company <span className="ca-form-required">*</span>
                      </label>
                      <input
                        id="demo-company"
                        type="text"
                        className={`ca-form-input ${errors.company ? "error" : ""}`}
                        placeholder="Acme Inc."
                        autoComplete="organization"
                        value={formData.company}
                        onChange={(e) => handleChange("company", e.target.value)}
                      />
                      {errors.company && <span className="ca-form-error">{errors.company}</span>}
                    </div>

                    <div className="ca-form-group">
                      <label htmlFor="demo-size" className="ca-form-label">
                        Company Size
                      </label>
                      <select
                        id="demo-size"
                        className="ca-form-select"
                        value={formData.companySize}
                        onChange={(e) => handleChange("companySize", e.target.value)}
                      >
                        <option value="">Select size</option>
                        {COMPANY_SIZES.map((size) => (
                          <option key={size.value} value={size.value}>{size.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="ca-form-group">
                      <label htmlFor="demo-interest" className="ca-form-label">
                        Primary Interest
                      </label>
                      <select
                        id="demo-interest"
                        className="ca-form-select"
                        value={formData.interest}
                        onChange={(e) => handleChange("interest", e.target.value)}
                      >
                        <option value="">Select your main focus</option>
                        {INTERESTS.map((interest) => (
                          <option key={interest.value} value={interest.value}>{interest.label}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="ca-btn-hero-primary ca-form-submit-btn"
                      style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="ca-form-spinner" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" aria-hidden="true" />
                          Request Demo
                        </>
                      )}
                    </button>

                    <p className="ca-form-disclaimer">
                      By submitting, you agree to our{" "}
                      <Link href="/privacy">Privacy Policy</Link> and{" "}
                      <Link href="/terms">Terms of Service</Link>.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="ca-demo-trust-section">
        <div className="ca-demo-trust-badges">
          <div className="ca-demo-trust-badge">
            <Shield className="w-5 h-5" aria-hidden="true" />
            <span>SOC 2 Type II Certified</span>
          </div>
          <div className="ca-demo-trust-badge">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            <span>GDPR Compliant</span>
          </div>
          <div className="ca-demo-trust-badge">
            <Users className="w-5 h-5" aria-hidden="true" />
            <span>500+ Teams Trust Us</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Prefer to try it yourself?
          </div>
          <h2 className="ca-final-cta-title">Start Your Free Trial</h2>
          <p className="ca-final-cta-subtitle">
            No demo needed? Jump right in with our 14-day free trial. No credit card required.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
