"use client"

import { useState, useRef, type FormEvent } from "react"
import Link from "next/link"
import {
  Newspaper,
  ArrowRight,
  Download,
  Mail,
  Image as ImageIcon,
  FileText,
  Quote,
  Calendar,
  Send,
  CheckCircle2,
} from "lucide-react"
import "../premium.css"

// Press inquiry types for the form
const PRESS_INQUIRY_TYPES = [
  { value: "media", label: "Media Inquiry" },
  { value: "interview", label: "Interview Request" },
  { value: "brand-assets", label: "Brand Assets Request" },
  { value: "press-release", label: "Press Release Information" },
  { value: "other", label: "Other Press Inquiry" },
]

interface PressFormData {
  name: string
  email: string
  organization: string
  inquiryType: string
  message: string
}

interface ValidationErrors {
  [key: string]: string
}

const PRESS_RELEASES = [
  {
    date: "December 2024",
    title: "CloudAct.ai Launches AI-Powered Cost Anomaly Detection",
    description: "New feature helps enterprises catch cloud cost overruns before they impact budgets.",
  },
  {
    date: "October 2024",
    title: "CloudAct.ai Announces GenAI Cost Tracking for OpenAI and Anthropic",
    description: "First FinOps platform to offer unified tracking for LLM API spending.",
  },
  {
    date: "August 2024",
    title: "CloudAct.ai Raises Series A to Expand FinOps Platform",
    description: "Funding will accelerate product development and go-to-market expansion.",
  },
]

const MEDIA_RESOURCES = [
  {
    icon: ImageIcon,
    title: "Brand Assets",
    description: "Logos, icons, and brand guidelines",
    action: "Request Kit",
    inquiryType: "brand-assets",
  },
  {
    icon: FileText,
    title: "Fact Sheet",
    description: "Company overview and key facts",
    action: "Request PDF",
    inquiryType: "press-release",
  },
  {
    icon: Quote,
    title: "Executive Bios",
    description: "Leadership team biographies",
    action: "View Bios",
    href: "/about#team",
  },
]

const COMPANY_FACTS = [
  { label: "Founded", value: "2023" },
  { label: "Headquarters", value: "Sunnyvale, CA" },
  { label: "Team Size", value: "20+ employees" },
  { label: "Global Presence", value: "8 countries" },
  { label: "Customers", value: "340+ teams" },
  { label: "Integrations", value: "50+ platforms" },
]

export default function PressPage() {
  const formRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState<PressFormData>({
    name: "",
    email: "",
    organization: "",
    inquiryType: "",
    message: "",
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Scroll to form and pre-select inquiry type
  const handleCardClick = (inquiryType: string) => {
    setFormData(prev => ({ ...prev, inquiryType }))
    setIsSuccess(false)
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}
    if (!formData.name.trim()) newErrors.name = "Name is required"
    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email"
    }
    if (!formData.inquiryType) newErrors.inquiryType = "Please select an inquiry type"
    if (!formData.message.trim()) newErrors.message = "Message is required"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.name.split(" ")[0],
          lastName: formData.name.split(" ").slice(1).join(" ") || "",
          email: formData.email,
          company: formData.organization,
          inquiryType: "press",
          message: `[${formData.inquiryType}] ${formData.message}`,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setErrors({ form: data.error || "Something went wrong. Please try again." })
        return
      }

      setIsSuccess(true)
      setFormData({ name: "", email: "", organization: "", inquiryType: "", message: "" })
    } catch {
      setErrors({ form: "Network error. Please check your connection and try again." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: keyof PressFormData, value: string) => {
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
          <div className="ca-section-eyebrow">
            <Newspaper className="w-4 h-4" aria-hidden="true" />
            Press & Media
          </div>
          <h1 className="ca-page-hero-title">
            <span className="ca-hero-highlight-mint">CloudAct</span> in the News
          </h1>
          <p className="ca-page-hero-subtitle">
            Press releases, media resources, and contact information for journalists and analysts.
          </p>
          <div className="ca-hero-cta-group">
            <button
              type="button"
              onClick={() => handleCardClick("media")}
              className="ca-btn-hero-primary"
            >
              Contact Press Team
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleCardClick("brand-assets")}
              className="ca-btn-hero-secondary"
            >
              <Download className="w-5 h-5" aria-hidden="true" />
              Download Brand Kit
            </button>
          </div>
        </div>
      </section>

      {/* Press Releases Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <FileText className="w-4 h-4" aria-hidden="true" />
              Press Releases
            </span>
            <h2 className="ca-section-title">Latest announcements</h2>
          </div>

          <div className="ca-press-releases-list">
            {PRESS_RELEASES.map((release) => (
              <div key={release.title} className="ca-press-release-card">
                <div className="ca-press-release-date">
                  <Calendar className="w-4 h-4" aria-hidden="true" />
                  {release.date}
                </div>
                <h3 className="ca-press-release-title">{release.title}</h3>
                <p className="ca-press-release-desc">{release.description}</p>
                <button
                  type="button"
                  onClick={() => handleCardClick("press-release")}
                  className="ca-press-release-link"
                >
                  Read Full Release
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Media Resources Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Download className="w-4 h-4" aria-hidden="true" />
              Media Resources
            </span>
            <h2 className="ca-section-title">Press kit and assets</h2>
          </div>

          <div className="ca-press-resources-grid">
            {MEDIA_RESOURCES.map((resource) => {
              const Icon = resource.icon
              return (
                <div key={resource.title} className="ca-press-resource-card">
                  <div className="ca-press-resource-icon">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <h3 className="ca-press-resource-title">{resource.title}</h3>
                  <p className="ca-press-resource-desc">{resource.description}</p>
                  {resource.inquiryType ? (
                    <button
                      type="button"
                      onClick={() => handleCardClick(resource.inquiryType!)}
                      className="ca-press-resource-link"
                    >
                      {resource.action}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <Link href={resource.href!} className="ca-press-resource-link">
                      {resource.action}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Company Facts Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <h2 className="ca-section-title">Company at a Glance</h2>
          </div>

          <div className="ca-press-facts-grid">
            {COMPANY_FACTS.map((fact) => (
              <div key={fact.label} className="ca-press-fact">
                <span className="ca-press-fact-label">{fact.label}</span>
                <span className="ca-press-fact-value">{fact.value}</span>
              </div>
            ))}
          </div>

          <div className="ca-press-boilerplate">
            <h3>About CloudAct.ai</h3>
            <p>
              CloudAct.ai is the unified platform for cloud, GenAI, and SaaS cost management.
              Our AI-powered solution helps engineering and finance teams gain visibility into
              their spending, optimize costs, and make data-driven decisions. Founded in 2023,
              CloudAct.ai is trusted by over 340 teams worldwide and has helped customers save
              over $2.4 million in cloud costs. The company is headquartered in Sunnyvale,
              California with a remote-first team across 8 countries.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="ca-contact-form-section" id="press-contact-form">
        <div className="ca-contact-form-container" ref={formRef}>
          <div className="ca-contact-form-header">
            <h2 className="ca-contact-form-title">Media Contact</h2>
            <p className="ca-contact-form-subtitle">
              For press inquiries, interview requests, or media resources, please fill out the form below.
              We typically respond within 24 hours.
            </p>
          </div>

          {isSuccess ? (
            <div className="ca-contact-form-success">
              <CheckCircle2 className="w-12 h-12" aria-hidden="true" />
              <h3>Thank you for reaching out!</h3>
              <p>We've received your press inquiry and will get back to you within 24 hours.</p>
              <button
                type="button"
                onClick={() => setIsSuccess(false)}
                className="ca-contact-form-reset-btn"
              >
                Send Another Inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="ca-contact-form">
              {errors.form && (
                <div className="ca-contact-form-error-banner" role="alert">
                  {errors.form}
                </div>
              )}
              <div className="ca-contact-form-row">
                <div className="ca-contact-form-field">
                  <label htmlFor="press-name">Your Name *</label>
                  <input
                    id="press-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Jane Smith"
                    className={errors.name ? "error" : ""}
                  />
                  {errors.name && <span className="ca-contact-form-error">{errors.name}</span>}
                </div>
                <div className="ca-contact-form-field">
                  <label htmlFor="press-email">Email Address *</label>
                  <input
                    id="press-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="jane@publication.com"
                    className={errors.email ? "error" : ""}
                  />
                  {errors.email && <span className="ca-contact-form-error">{errors.email}</span>}
                </div>
              </div>

              <div className="ca-contact-form-row">
                <div className="ca-contact-form-field">
                  <label htmlFor="press-org">Organization / Publication</label>
                  <input
                    id="press-org"
                    type="text"
                    value={formData.organization}
                    onChange={(e) => handleChange("organization", e.target.value)}
                    placeholder="TechCrunch, Forbes, etc."
                  />
                </div>
                <div className="ca-contact-form-field">
                  <label htmlFor="press-type">Inquiry Type *</label>
                  <select
                    id="press-type"
                    value={formData.inquiryType}
                    onChange={(e) => handleChange("inquiryType", e.target.value)}
                    className={errors.inquiryType ? "error" : ""}
                  >
                    <option value="">Select inquiry type</option>
                    {PRESS_INQUIRY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {errors.inquiryType && <span className="ca-contact-form-error">{errors.inquiryType}</span>}
                </div>
              </div>

              <div className="ca-contact-form-field">
                <label htmlFor="press-message">Message *</label>
                <textarea
                  id="press-message"
                  value={formData.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Please describe your inquiry, deadline, and any specific information you need..."
                  rows={5}
                  className={errors.message ? "error" : ""}
                />
                {errors.message && <span className="ca-contact-form-error">{errors.message}</span>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="ca-contact-form-submit"
              >
                {isSubmitting ? (
                  <>
                    <span className="ca-contact-form-spinner" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" aria-hidden="true" />
                    Submit Inquiry
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Want to Learn More?</h2>
          <p className="ca-final-cta-subtitle">
            Explore our platform or get in touch with our team.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/demo" className="ca-btn-cta-primary">
              Request Demo
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/about" className="ca-btn-cta-secondary">
              About Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
