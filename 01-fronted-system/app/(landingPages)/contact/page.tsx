"use client"

import { useState, useEffect, type FormEvent } from "react"
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle2,
  Clock,
  MessageSquare,
  Users,
  ArrowRight,
  Building2
} from "lucide-react"

interface FormData {
  firstName: string
  lastName: string
  email: string
  company: string
  phone: string
  inquiryType: string
  message: string
}

interface ValidationErrors {
  [key: string]: string
}

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
    inquiryType: "",
    message: ""
  })

  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Auto-clear success message after 10 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => setIsSuccess(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [isSuccess])

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required"
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required"
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
      // More robust email validation: requires proper domain with TLD
      newErrors.email = "Please enter a valid email"
    }

    if (!formData.inquiryType) {
      newErrors.inquiryType = "Please select an inquiry type"
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required"
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setErrors({})

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))

    setIsSubmitting(false)
    setIsSuccess(true)

    // Reset form
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      phone: "",
      inquiryType: "",
      message: ""
    })
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 md:pt-32 md:pb-20 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--ca-teal-glow)] rounded-full blur-[120px] opacity-40" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-[var(--ca-coral-glow)] rounded-full blur-[100px] opacity-30" />
        </div>

        <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ca-teal-50)] rounded-full mb-6">
              <div className="w-2 h-2 bg-[var(--ca-teal)] rounded-full animate-pulse" />
              <span className="ca-label text-[var(--ca-teal)]">We're Here to Help</span>
            </div>

            {/* Heading */}
            <h1 className="ca-display-lg mb-6">
              Let's Start a <span className="ca-gradient-text">Conversation</span>
            </h1>

            <p className="ca-body text-lg mb-8">
              Have questions about CloudAct? Our team is ready to help you optimize your cloud costs and maximize efficiency.
            </p>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--ca-teal)]" />
                <span className="text-[var(--ca-gray-600)]">&lt;2hr response time</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[var(--ca-teal)]" />
                <span className="text-[var(--ca-gray-600)]">24/7 support</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--ca-teal)]" />
                <span className="text-[var(--ca-gray-600)]">98% satisfaction</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form + Info Section */}
      <section className="pb-20 md:pb-32">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
            {/* Left Column - Contact Info Cards */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="ca-display-md mb-4">Get in Touch</h2>
                <p className="ca-body">
                  Choose your preferred way to reach us. We're available across multiple channels to support your needs.
                </p>
              </div>

              {/* Contact Methods */}
              <div className="space-y-4">
                {/* Email Card */}
                <div className="ca-card group hover:border-[var(--ca-teal)] transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--ca-teal-50)] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Mail className="w-6 h-6 text-[var(--ca-teal)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="ca-heading text-base mb-1">Email Us</h3>
                      <p className="ca-body-sm mb-2">For general inquiries</p>
                      <a
                        href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@cloudact.ai"}`}
                        className="text-[var(--ca-teal)] font-medium text-sm hover:underline inline-flex items-center gap-1 group/link"
                      >
                        {process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@cloudact.ai"}
                        <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Phone Card */}
                <div className="ca-card group hover:border-[var(--ca-teal)] transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--ca-coral-50)] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Phone className="w-6 h-6 text-[var(--ca-coral)]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="ca-heading text-base mb-1">Call Us</h3>
                      <p className="ca-body-sm mb-2">Mon-Fri, 9am-6pm PT</p>
                      <a
                        href="tel:+18509887471"
                        className="text-[var(--ca-teal)] font-medium text-sm hover:underline inline-flex items-center gap-1 group/link"
                      >
                        (850) 988-7471
                        <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                      </a>
                      <p className="ca-body-sm text-[var(--ca-gray-500)] mt-1">Fax: (408) 825-6915</p>
                    </div>
                  </div>
                </div>

                {/* Live Chat Card */}
                <div className="ca-card group hover:border-[var(--ca-teal)] transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--ca-green-light)] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <MessageSquare className="w-6 h-6 text-[var(--ca-green)]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="ca-heading text-base mb-1">Live Chat</h3>
                      <p className="ca-body-sm mb-2">Real-time assistance</p>
                      <button className="text-[var(--ca-teal)] font-medium text-sm hover:underline inline-flex items-center gap-1 group/link">
                        Start chatting
                        <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Office Location */}
              <div className="ca-card bg-gradient-to-br from-[var(--ca-teal)] to-[var(--ca-teal-dark)] text-white border-none">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Headquarters</h3>
                    <p className="text-white/90 text-sm leading-relaxed">
                      CloudAct Inc.<br />
                      100 S Murphy Ave, STE 200 PMB4013<br />
                      Sunnyvale, CA 94086<br />
                      United States
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Contact Form */}
            <div className="lg:col-span-3">
              <div className="ca-card p-8 md:p-10 border-2">
                {isSuccess ? (
                  <div className="py-12 text-center">
                    <div className="w-20 h-20 bg-[var(--ca-green-light)] rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10 text-[var(--ca-green)]" />
                    </div>
                    <h3 className="ca-display-md mb-4">Message Sent Successfully!</h3>
                    <p className="ca-body mb-8 max-w-md mx-auto">
                      Thank you for reaching out. Our team will get back to you within 24 hours.
                    </p>
                    <button
                      onClick={() => setIsSuccess(false)}
                      className="ca-btn ca-btn-primary"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <h3 className="ca-display-md mb-2">Send us a Message</h3>
                      <p className="ca-body-sm">Fill out the form below and we'll get back to you as soon as possible.</p>
                    </div>

                    {/* Name Fields */}
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="firstName" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          First Name <span className="text-[var(--ca-coral)]">*</span>
                        </label>
                        <input
                          id="firstName"
                          type="text"
                          value={formData.firstName}
                          onChange={(e) => handleChange("firstName", e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl border-2 bg-white transition-all duration-200 focus:outline-none ${
                            errors.firstName
                              ? "border-[var(--ca-coral)] focus:border-[var(--ca-coral)] focus:ring-4 focus:ring-[var(--ca-coral-glow)]"
                              : "border-[var(--ca-gray-200)] focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)]"
                          }`}
                          placeholder="John"
                        />
                        {errors.firstName && (
                          <p className="mt-1.5 text-sm text-[var(--ca-coral)] flex items-center gap-1">
                            <span className="w-1 h-1 bg-[var(--ca-coral)] rounded-full" />
                            {errors.firstName}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="lastName" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          Last Name <span className="text-[var(--ca-coral)]">*</span>
                        </label>
                        <input
                          id="lastName"
                          type="text"
                          value={formData.lastName}
                          onChange={(e) => handleChange("lastName", e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl border-2 bg-white transition-all duration-200 focus:outline-none ${
                            errors.lastName
                              ? "border-[var(--ca-coral)] focus:border-[var(--ca-coral)] focus:ring-4 focus:ring-[var(--ca-coral-glow)]"
                              : "border-[var(--ca-gray-200)] focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)]"
                          }`}
                          placeholder="Doe"
                        />
                        {errors.lastName && (
                          <p className="mt-1.5 text-sm text-[var(--ca-coral)] flex items-center gap-1">
                            <span className="w-1 h-1 bg-[var(--ca-coral)] rounded-full" />
                            {errors.lastName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Email & Company */}
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="email" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          Email Address <span className="text-[var(--ca-coral)]">*</span>
                        </label>
                        <input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange("email", e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl border-2 bg-white transition-all duration-200 focus:outline-none ${
                            errors.email
                              ? "border-[var(--ca-coral)] focus:border-[var(--ca-coral)] focus:ring-4 focus:ring-[var(--ca-coral-glow)]"
                              : "border-[var(--ca-gray-200)] focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)]"
                          }`}
                          placeholder="john@company.com"
                        />
                        {errors.email && (
                          <p className="mt-1.5 text-sm text-[var(--ca-coral)] flex items-center gap-1">
                            <span className="w-1 h-1 bg-[var(--ca-coral)] rounded-full" />
                            {errors.email}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="company" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          Company
                        </label>
                        <input
                          id="company"
                          type="text"
                          value={formData.company}
                          onChange={(e) => handleChange("company", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-[var(--ca-gray-200)] bg-white focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)] focus:outline-none transition-all duration-200"
                          placeholder="Acme Inc."
                        />
                      </div>
                    </div>

                    {/* Phone & Inquiry Type */}
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="phone" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          Phone Number
                        </label>
                        <input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => handleChange("phone", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-[var(--ca-gray-200)] bg-white focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)] focus:outline-none transition-all duration-200"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>

                      <div>
                        <label htmlFor="inquiryType" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                          Inquiry Type <span className="text-[var(--ca-coral)]">*</span>
                        </label>
                        <select
                          id="inquiryType"
                          value={formData.inquiryType}
                          onChange={(e) => handleChange("inquiryType", e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl border-2 bg-white transition-all duration-200 focus:outline-none ${
                            errors.inquiryType
                              ? "border-[var(--ca-coral)] focus:border-[var(--ca-coral)] focus:ring-4 focus:ring-[var(--ca-coral-glow)]"
                              : "border-[var(--ca-gray-200)] focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)]"
                          }`}
                        >
                          <option value="">Select a category</option>
                          <option value="sales">Sales Inquiry</option>
                          <option value="support">Technical Support</option>
                          <option value="partnership">Partnership Opportunity</option>
                          <option value="billing">Billing Question</option>
                          <option value="general">General Question</option>
                          <option value="demo">Request a Demo</option>
                        </select>
                        {errors.inquiryType && (
                          <p className="mt-1.5 text-sm text-[var(--ca-coral)] flex items-center gap-1">
                            <span className="w-1 h-1 bg-[var(--ca-coral)] rounded-full" />
                            {errors.inquiryType}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <label htmlFor="message" className="block ca-subheading text-sm mb-2 text-[var(--ca-gray-700)]">
                        Message <span className="text-[var(--ca-coral)]">*</span>
                      </label>
                      <textarea
                        id="message"
                        rows={6}
                        value={formData.message}
                        onChange={(e) => handleChange("message", e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border-2 bg-white transition-all duration-200 focus:outline-none resize-none ${
                          errors.message
                            ? "border-[var(--ca-coral)] focus:border-[var(--ca-coral)] focus:ring-4 focus:ring-[var(--ca-coral-glow)]"
                            : "border-[var(--ca-gray-200)] focus:border-[var(--ca-teal)] focus:ring-4 focus:ring-[var(--ca-teal-glow)]"
                        }`}
                        placeholder="Tell us how we can help you..."
                      />
                      {errors.message && (
                        <p className="mt-1.5 text-sm text-[var(--ca-coral)] flex items-center gap-1">
                          <span className="w-1 h-1 bg-[var(--ca-coral)] rounded-full" />
                          {errors.message}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--ca-gray-500)]">
                        {formData.message.length} / 1000 characters
                      </p>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="ca-btn ca-btn-primary ca-btn-lg w-full sm:w-auto group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            Send Message
                            <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                      <p className="mt-4 text-xs text-[var(--ca-gray-500)]">
                        By submitting this form, you agree to our Privacy Policy and Terms of Service.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Office Location */}
      <section className="py-20 bg-[var(--ca-gray-50)]">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className="ca-label text-[var(--ca-teal)]">Visit Us</span>
              <h2 className="ca-display-md mt-4 mb-4">Our Headquarters</h2>
            </div>

            <div className="ca-card p-8 md:p-10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                {/* Map/Visual */}
                <div className="aspect-square md:aspect-video bg-gradient-to-br from-[var(--ca-teal)] to-[var(--ca-teal-dark)] rounded-2xl flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'linear-gradient(var(--ca-gray-200) 1px, transparent 1px), linear-gradient(90deg, var(--ca-gray-200) 1px, transparent 1px)',
                      backgroundSize: '20px 20px'
                    }} />
                  </div>
                  <div className="text-center relative z-10">
                    <Building2 className="w-16 h-16 text-white mx-auto mb-3" />
                    <p className="text-white font-semibold text-lg">CloudAct Inc.</p>
                    <p className="text-white/80 text-sm">Silicon Valley, CA</p>
                  </div>
                </div>

                {/* Address Details */}
                <div className="space-y-6">
                  <div>
                    <h3 className="ca-heading text-xl mb-4">CloudAct Inc.</h3>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-[var(--ca-teal)] mt-1 flex-shrink-0" />
                      <div className="ca-body-sm">
                        <p>100 S Murphy Ave</p>
                        <p>STE 200 PMB4013</p>
                        <p>Sunnyvale, CA 94086</p>
                        <p>United States</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-[var(--ca-teal)] mt-1 flex-shrink-0" />
                    <div className="ca-body-sm">
                      <p>Phone: <a href="tel:+18509887471" className="text-[var(--ca-teal)] hover:underline">(850) 988-7471</a></p>
                      <p>Fax: (408) 825-6915</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-[var(--ca-teal)] mt-1 flex-shrink-0" />
                    <div className="ca-body-sm">
                      <p>General: <a href="mailto:hello@cloudact.ai" className="text-[var(--ca-teal)] hover:underline">hello@cloudact.ai</a></p>
                      <p>Support: <a href="mailto:support@cloudact.ai" className="text-[var(--ca-teal)] hover:underline">support@cloudact.ai</a></p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--ca-gray-200)]">
                    <p className="ca-body-sm text-[var(--ca-gray-500)]">
                      <Clock className="w-4 h-4 inline mr-2" />
                      Business Hours: Mon-Fri, 9am-6pm PT
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ / Quick Links Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-12">
            <span className="ca-label text-[var(--ca-teal)]">Quick Answers</span>
            <h2 className="ca-display-md mt-4 mb-4">Frequently Asked Questions</h2>
            <p className="ca-body max-w-2xl mx-auto">
              Find quick answers to common questions. Can't find what you're looking for? Contact us directly.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* FAQ Item 1 */}
            <div className="ca-card">
              <h3 className="ca-heading mb-3">How quickly can I get started?</h3>
              <p className="ca-body-sm mb-4">
                You can get started in minutes! Sign up, connect your cloud accounts, and start seeing insights immediately. Our onboarding process is designed to be quick and seamless.
              </p>
              <a href="/signup" className="text-[var(--ca-teal)] font-medium text-sm inline-flex items-center gap-1 group/link">
                Start free trial
                <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </a>
            </div>

            {/* FAQ Item 2 */}
            <div className="ca-card">
              <h3 className="ca-heading mb-3">What cloud providers do you support?</h3>
              <p className="ca-body-sm mb-4">
                We support all major cloud providers including AWS, Google Cloud, Azure, and more. Our platform seamlessly integrates with your existing infrastructure.
              </p>
              <a href="/features" className="text-[var(--ca-teal)] font-medium text-sm inline-flex items-center gap-1 group/link">
                View integrations
                <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </a>
            </div>

            {/* FAQ Item 3 */}
            <div className="ca-card">
              <h3 className="ca-heading mb-3">Is my data secure?</h3>
              <p className="ca-body-sm mb-4">
                Absolutely. We use enterprise-grade encryption, SOC 2 compliance, and follow industry best practices. Your data security is our top priority.
              </p>
              <a href="/security" className="text-[var(--ca-teal)] font-medium text-sm inline-flex items-center gap-1 group/link">
                Learn about security
                <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </a>
            </div>

            {/* FAQ Item 4 */}
            <div className="ca-card">
              <h3 className="ca-heading mb-3">Can I schedule a demo?</h3>
              <p className="ca-body-sm mb-4">
                Yes! We'd love to show you how CloudAct can help optimize your cloud costs. Schedule a personalized demo with our team.
              </p>
              <button className="text-[var(--ca-teal)] font-medium text-sm inline-flex items-center gap-1 group/link">
                Book a demo
                <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Help Center CTA */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-4 bg-[var(--ca-teal-50)] rounded-2xl">
              <MessageSquare className="w-6 h-6 text-[var(--ca-teal)]" />
              <span className="text-[var(--ca-gray-700)]">
                Still have questions?{" "}
                <a href="/help" className="text-[var(--ca-teal)] font-semibold hover:underline">
                  Visit our Help Center
                </a>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
