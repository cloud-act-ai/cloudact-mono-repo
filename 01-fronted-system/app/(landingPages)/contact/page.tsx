"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import {
  Mail,
  Phone,
  MapPin,
  ArrowRight,
  Users,
  Headphones,
  Handshake,
  Calendar,
  HelpCircle,
  Send,
  CheckCircle2,
} from "lucide-react"
import "../premium.css"

interface FormData {
  firstName: string
  lastName: string
  email: string
  company: string
  inquiryType: string
  message: string
}

interface ValidationErrors {
  [key: string]: string
}

// C3.ai Style Contact Cards
const CONTACT_CARDS = [
  {
    title: "Sales",
    description: "Get pricing information, request a quote, or speak with our sales team about your needs.",
    email: "sales@cloudact.ai",
    icon: Users,
    cta: "Contact Sales",
    href: "mailto:sales@cloudact.ai",
  },
  {
    title: "Schedule a Demo",
    description: "See CloudAct.ai in action. Book a personalized demo with our product specialists.",
    icon: Calendar,
    cta: "Book Demo",
    href: "/demo",
  },
  {
    title: "Technical Support",
    description: "Need help with your account or have technical questions? Our support team is here.",
    email: "support@cloudact.ai",
    icon: Headphones,
    cta: "Get Support",
    href: "mailto:support@cloudact.ai",
  },
  {
    title: "Partnerships",
    description: "Interested in partnering with CloudAct.ai? Let's explore opportunities together.",
    email: "partners@cloudact.ai",
    icon: Handshake,
    cta: "Partner With Us",
    href: "mailto:partners@cloudact.ai",
  },
]

// Additional contact options
const OTHER_CONTACTS = [
  {
    title: "Investor Relations",
    email: "investors@cloudact.ai",
    description: "For investor and shareholder inquiries",
  },
  {
    title: "Press & Media",
    email: "press@cloudact.ai",
    description: "For media inquiries and press resources",
  },
  {
    title: "Careers",
    email: "careers@cloudact.ai",
    description: "Join our team and help shape the future of FinOps",
  },
]

// Inquiry types for form dropdown
const INQUIRY_TYPES = [
  { value: "general", label: "General Inquiry" },
  { value: "sales", label: "Sales & Pricing" },
  { value: "demo", label: "Request a Demo" },
  { value: "bug", label: "Bug Report" },
  { value: "support", label: "Technical Support" },
  { value: "partnership", label: "Partnership Opportunity" },
  { value: "investment", label: "Investment Inquiry" },
  { value: "feature", label: "Feature Request" },
  { value: "press", label: "Press & Media" },
  { value: "careers", label: "Careers" },
  { value: "other", label: "Other" },
]

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    inquiryType: "",
    message: ""
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
        body: JSON.stringify(formData),
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
      setFormData({ firstName: "", lastName: "", email: "", company: "", inquiryType: "", message: "" })
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
      {/* Hero Section - C3.ai Style */}
      <section className="ca-contact-hero-c3">
        <div className="ca-contact-hero-content-c3">
          <h1 className="ca-contact-hero-title-c3">Contact Us</h1>
          <p className="ca-contact-hero-subtitle-c3">
            Get in touch with the right team. We're here to help you optimize your cloud costs.
          </p>
        </div>
      </section>

      {/* Contact Cards Grid - C3.ai Style */}
      <section className="ca-contact-cards-section">
        <div className="ca-contact-cards-grid">
          {CONTACT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.title} className="ca-contact-card-c3">
                <div className="ca-contact-card-header-c3">
                  <div className="ca-contact-card-icon-c3">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="ca-contact-card-title-c3">{card.title}</h3>
                </div>
                <p className="ca-contact-card-desc-c3">{card.description}</p>
                {card.email && (
                  <a href={`mailto:${card.email}`} className="ca-contact-card-email-c3">
                    {card.email}
                  </a>
                )}
                <Link href={card.href} className="ca-contact-card-cta-c3">
                  {card.cta}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      {/* Other Contacts Section */}
      <section className="ca-contact-other-section">
        <div className="ca-contact-other-container">
          <h2 className="ca-contact-other-title">Other Inquiries</h2>
          <div className="ca-contact-other-grid">
            {OTHER_CONTACTS.map((contact) => (
              <div key={contact.title} className="ca-contact-other-item">
                <div className="ca-contact-other-label">{contact.title}</div>
                <a href={`mailto:${contact.email}`} className="ca-contact-other-email">
                  {contact.email}
                </a>
                <div className="ca-contact-other-desc">{contact.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="ca-contact-form-section">
        <div className="ca-contact-form-container">
          <div className="ca-contact-form-header">
            <h2 className="ca-contact-form-title">Send Us a Message</h2>
            <p className="ca-contact-form-subtitle">
              Fill out the form below and we'll get back to you within 24 hours.
            </p>
          </div>

          {isSuccess ? (
            <div className="ca-contact-form-success">
              <CheckCircle2 className="w-12 h-12" aria-hidden="true" />
              <h3>Thank you for reaching out!</h3>
              <p>We've received your message and will get back to you within 24 hours.</p>
              <button
                type="button"
                onClick={() => setIsSuccess(false)}
                className="ca-contact-form-reset-btn"
              >
                Send Another Message
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
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    placeholder="John"
                    className={errors.firstName ? "error" : ""}
                  />
                  {errors.firstName && <span className="ca-contact-form-error">{errors.firstName}</span>}
                </div>
                <div className="ca-contact-form-field">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    placeholder="Doe"
                    className={errors.lastName ? "error" : ""}
                  />
                  {errors.lastName && <span className="ca-contact-form-error">{errors.lastName}</span>}
                </div>
              </div>

              <div className="ca-contact-form-row">
                <div className="ca-contact-form-field">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="john@company.com"
                    className={errors.email ? "error" : ""}
                  />
                  {errors.email && <span className="ca-contact-form-error">{errors.email}</span>}
                </div>
                <div className="ca-contact-form-field">
                  <label htmlFor="company">Company</label>
                  <input
                    id="company"
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleChange("company", e.target.value)}
                    placeholder="Acme Inc."
                  />
                </div>
              </div>

              <div className="ca-contact-form-field">
                <label htmlFor="inquiryType">What can we help you with? *</label>
                <select
                  id="inquiryType"
                  value={formData.inquiryType}
                  onChange={(e) => handleChange("inquiryType", e.target.value)}
                  className={errors.inquiryType ? "error" : ""}
                >
                  <option value="">Select an inquiry type</option>
                  {INQUIRY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {errors.inquiryType && <span className="ca-contact-form-error">{errors.inquiryType}</span>}
              </div>

              <div className="ca-contact-form-field">
                <label htmlFor="message">Message *</label>
                <textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Tell us how we can help..."
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
                    Send Message
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Office Location Section */}
      <section className="ca-contact-office-c3">
        <div className="ca-contact-office-container-c3">
          <div className="ca-contact-office-info-c3">
            <h2 className="ca-contact-office-title-c3">Headquarters</h2>
            <div className="ca-contact-office-details-c3">
              <div className="ca-contact-office-address-block">
                <MapPin className="w-5 h-5" aria-hidden="true" />
                <div>
                  <strong>CloudAct Inc.</strong><br />
                  100 S Murphy Ave, STE 200 PMB4013<br />
                  Sunnyvale, CA 94086<br />
                  United States
                </div>
              </div>
              <div className="ca-contact-office-phone-block">
                <Phone className="w-5 h-5" aria-hidden="true" />
                <div>
                  <a href="tel:+18509887471">(850) 988-7471</a>
                  <span className="ca-contact-office-hours">Mon-Fri, 9am-6pm PT</span>
                </div>
              </div>
              <div className="ca-contact-office-email-block">
                <Mail className="w-5 h-5" aria-hidden="true" />
                <div>
                  <a href="mailto:info@cloudact.ai">info@cloudact.ai</a>
                  <span className="ca-contact-office-hours">General inquiries</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Help Center CTA */}
      <section className="ca-contact-help-section">
        <div className="ca-contact-help-container">
          <HelpCircle className="w-8 h-8" aria-hidden="true" />
          <div className="ca-contact-help-content">
            <h3 className="ca-contact-help-title">Looking for self-service help?</h3>
            <p className="ca-contact-help-desc">
              Check out our documentation and help center for guides, tutorials, and FAQs.
            </p>
          </div>
          <Link href="/help" className="ca-contact-help-cta">
            Visit Help Center
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Ready to Get Started?</h2>
          <p className="ca-final-cta-subtitle">
            Join teams already saving with CloudAct.ai. Start your free trial today.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
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
