"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, Mail, MessageSquare, Phone, Loader2, CheckCircle2 } from "lucide-react"

// Note: metadata export won't work with "use client" - SEO handled by parent layout

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))

    setIsSubmitting(false)
    setIsSuccess(true)
  }

  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="cloudact-badge">
              <span className="flex h-2 w-2 rounded-full bg-cloudact-teal animate-pulse" />
              We're Here to Help
            </div>
            <h1 className="cloudact-heading-xl">
              Get in Touch
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              Have questions? Our team is here to help you optimize your costs.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="pb-16 sm:pb-20 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-10 sm:gap-12 lg:grid-cols-2">
              {/* Contact Info */}
              <div className="space-y-8 sm:space-y-10">
                <div>
                  <h2 className="cloudact-heading-lg mb-2 sm:mb-3">Let's Talk</h2>
                  <p className="cloudact-body">
                    Whether you're looking to optimize costs, need technical support, or want to discuss enterprise
                    solutions, we're here to help.
                  </p>
                </div>

                <div className="space-y-5 sm:space-y-6">
                  <div className="flex items-start gap-3 sm:gap-4 group">
                    <div className="cloudact-icon-box flex-shrink-0">
                      <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h3 className="cloudact-heading-md text-sm sm:text-base mb-1">Email Us</h3>
                      <p className="cloudact-body-sm mb-1">For general inquiries and support</p>
                      <a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@cloudact.ai"}`} className="cloudact-link text-xs sm:text-sm">
                        {process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@cloudact.ai"}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 sm:gap-4 group">
                    <div className="cloudact-icon-box-coral flex-shrink-0">
                      <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h3 className="cloudact-heading-md text-sm sm:text-base mb-1">Live Chat</h3>
                      <p className="cloudact-body-sm mb-1">For real-time assistance</p>
                      <span className="text-xs sm:text-sm font-medium text-gray-900">Available Mon-Fri, 9am-6pm PT</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 sm:gap-4 group">
                    <div className="cloudact-icon-box flex-shrink-0">
                      <Phone className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h3 className="cloudact-heading-md text-sm sm:text-base mb-1">Call Us</h3>
                      <p className="cloudact-body-sm mb-1">For urgent matters</p>
                      <a href="tel:+15551234567" className="cloudact-link text-xs sm:text-sm">+1 (555) 123-4567</a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="cloudact-card p-6 sm:p-7 lg:p-8">
                {isSuccess ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                    <div className="h-16 w-16 rounded-full bg-cloudact-teal-light flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-cloudact-teal" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="cloudact-heading-md">Message Sent!</h3>
                      <p className="cloudact-body-sm max-w-xs mx-auto">
                        Thanks for reaching out. We'll get back to you within 24 hours.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsSuccess(false)}
                      className="cloudact-link text-sm"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="first-name" className="cloudact-body-sm font-medium">
                          First Name
                        </label>
                        <input
                          id="first-name"
                          type="text"
                          required
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none"
                          placeholder="John"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="last-name" className="cloudact-body-sm font-medium">
                          Last Name
                        </label>
                        <input
                          id="last-name"
                          type="text"
                          required
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none"
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="email" className="cloudact-body-sm font-medium">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none"
                        placeholder="john@company.com"
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="company" className="cloudact-body-sm font-medium">
                          Company
                        </label>
                        <input
                          id="company"
                          type="text"
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none"
                          placeholder="Your Company"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="category" className="cloudact-body-sm font-medium">
                          Category
                        </label>
                        <select
                          id="category"
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none appearance-none"
                          defaultValue=""
                        >
                          <option value="" disabled>Select a topic</option>
                          <option value="sales">Sales Inquiry</option>
                          <option value="support">Technical Support</option>
                          <option value="partnership">Partnership</option>
                          <option value="general">General Question</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="message" className="cloudact-body-sm font-medium">
                        Message
                      </label>
                      <textarea
                        id="message"
                        rows={5}
                        required
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all focus:border-cloudact-teal focus:ring-2 focus:ring-cloudact-teal/20 focus:outline-none resize-none"
                        placeholder="Tell us about your needs..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cloudact-btn-primary w-full group"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          Send Message
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
