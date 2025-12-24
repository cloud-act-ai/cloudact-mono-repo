"use client"

import { useState } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { Check, X, ArrowRight, Zap, Shield, Clock, Users, Sparkles } from "lucide-react"

// Metadata must be exported separately in a server component
// For now, using client component for interactivity

const PRICING_DATA = {
  starter: {
    name: "Starter",
    price: 0,
    description: "Perfect for small teams getting started",
    features: [
      { name: "Up to 3 cloud integrations", included: true },
      { name: "Basic cost analytics", included: true },
      { name: "7-day data retention", included: true },
      { name: "Email support", included: true },
      { name: "Monthly reports", included: true },
      { name: "Single organization", included: true },
      { name: "Real-time alerts", included: false },
      { name: "Advanced forecasting", included: false },
      { name: "API access", included: false },
      { name: "Custom integrations", included: false },
    ],
    cta: "Get Started Free",
    highlight: false,
  },
  pro: {
    name: "Pro",
    price: 249,
    description: "Advanced features for growing businesses",
    features: [
      { name: "Unlimited cloud integrations", included: true },
      { name: "Advanced cost analytics", included: true },
      { name: "90-day data retention", included: true },
      { name: "Priority email & chat support", included: true },
      { name: "Weekly reports + custom schedules", included: true },
      { name: "Up to 5 organizations", included: true },
      { name: "Real-time alerts", included: true },
      { name: "Advanced forecasting", included: true },
      { name: "API access", included: true },
      { name: "Custom integrations", included: false },
    ],
    cta: "Start 14-Day Trial",
    highlight: true,
  },
  enterprise: {
    name: "Enterprise",
    price: null,
    description: "Custom solutions for large organizations",
    features: [
      { name: "Unlimited cloud integrations", included: true },
      { name: "Enterprise analytics suite", included: true },
      { name: "Unlimited data retention", included: true },
      { name: "24/7 dedicated support", included: true },
      { name: "Custom reporting", included: true },
      { name: "Unlimited organizations", included: true },
      { name: "Real-time alerts", included: true },
      { name: "Advanced forecasting", included: true },
      { name: "Full API access", included: true },
      { name: "Custom integrations", included: true },
    ],
    cta: "Contact Sales",
    highlight: false,
  },
}

const FAQS = [
  {
    question: "Is there a free trial?",
    answer:
      "Yes! All plans come with a 14-day free trial. No credit card required. You can explore all features and cancel anytime before the trial ends.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Absolutely. You can upgrade or downgrade your plan at any time from your dashboard settings. Changes take effect immediately, and we'll prorate your billing accordingly.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express, Discover) via Stripe secure checkout. Enterprise customers can also arrange for invoicing.",
  },
  {
    question: "How does billing work?",
    answer:
      "You can choose between monthly or annual billing. Annual billing saves you 20% compared to monthly. All plans are billed in advance, and you can cancel anytime.",
  },
  {
    question: "What happens after my trial ends?",
    answer:
      "After your 14-day trial, you'll be automatically subscribed to your selected plan. You'll receive reminder emails before the trial ends. Cancel anytime during the trial at no charge.",
  },
  {
    question: "Do you offer enterprise discounts?",
    answer:
      "Yes! For annual contracts, volume commitments, and multi-year agreements, we offer custom pricing. Contact our sales team to discuss your specific needs.",
  },
  {
    question: "Can I get a refund?",
    answer:
      "We offer a 30-day money-back guarantee on all paid plans. If you're not satisfied for any reason, contact support within 30 days for a full refund.",
  },
  {
    question: "What cloud providers do you support?",
    answer:
      "We support all major cloud providers including AWS, Google Cloud, Azure, as well as GenAI platforms like OpenAI, Anthropic, Cohere, and more. Custom integrations available for Enterprise customers.",
  },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const getPrice = (basePrice: number | null) => {
    if (basePrice === null) return null
    if (billingPeriod === "annual") {
      return Math.floor(basePrice * 12 * 0.8) // 20% discount
    }
    return basePrice
  }

  const getPriceDisplay = (basePrice: number | null) => {
    const price = getPrice(basePrice)
    if (price === null) return "Custom"
    if (price === 0) return "Free"
    if (billingPeriod === "annual") {
      return `$${price}/year`
    }
    return `$${price}/mo`
  }

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  return (
    <div className="ca-landing">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 overflow-hidden bg-white">
        <div className="absolute inset-0 z-0">
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
          <div className="ca-hero-grid" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-md mb-6">
            <Sparkles className="w-4 h-4 ca-text-teal" />
            <span className="ca-label ca-text-teal">Simple, Transparent Pricing</span>
          </div>

          <h1 className="ca-display-xl mb-6">
            Choose the <span className="ca-gradient-text">Perfect Plan</span> for Your Team
          </h1>

          <p className="ca-body text-xl max-w-2xl mx-auto mb-12">
            Start optimizing your cloud costs today. 14-day free trial on all plans. No credit card required.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1 bg-gray-100 rounded-full mb-4">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-3 rounded-full font-semibold text-sm transition-all ${
                billingPeriod === "monthly"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-gray-500"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-6 py-3 rounded-full font-semibold text-sm transition-all ${
                billingPeriod === "annual"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-gray-500"
              }`}
            >
              Annual
              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                Save 20%
              </span>
            </button>
          </div>
          {billingPeriod === "annual" && (
            <p className="text-sm text-gray-500">
              Pay annually and save ${Math.floor(249 * 12 * 0.2)}/year on Pro plan
            </p>
          )}
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="ca-pricing-grid">
            {/* Starter Plan */}
            <div className={`ca-pricing-card ${PRICING_DATA.starter.highlight ? "ca-pricing-card-featured" : ""}`}>
              {PRICING_DATA.starter.highlight && (
                <div className="ca-pricing-badge">Most Popular</div>
              )}

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-[var(--ca-teal-50)] flex items-center justify-center">
                    <Zap className="w-6 h-6 ca-text-teal" />
                  </div>
                  <h3 className="ca-pricing-name">{PRICING_DATA.starter.name}</h3>
                </div>
                <p className="ca-pricing-desc">{PRICING_DATA.starter.description}</p>
              </div>

              <div className="ca-pricing-price">
                <div className="flex items-baseline gap-2">
                  <span className="ca-pricing-amount">{getPriceDisplay(PRICING_DATA.starter.price).replace(/\/.*/, '')}</span>
                  {PRICING_DATA.starter.price !== null && PRICING_DATA.starter.price > 0 && (
                    <span className="ca-pricing-period">
                      /{billingPeriod === "monthly" ? "mo" : "year"}
                    </span>
                  )}
                </div>
                {billingPeriod === "annual" && PRICING_DATA.starter.price !== null && PRICING_DATA.starter.price > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ${Math.floor(PRICING_DATA.starter.price * 12 * 0.8 / 12)}/mo billed annually
                  </p>
                )}
              </div>

              <ul className="ca-pricing-features">
                {PRICING_DATA.starter.features.map((feature, i) => (
                  <li key={i} className="ca-pricing-feature">
                    {feature.included ? (
                      <Check className="ca-text-teal" />
                    ) : (
                      <X className="text-gray-300" />
                    )}
                    <span className={feature.included ? "text-gray-700" : "text-gray-400"}>
                      {feature.name}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/signup?plan=starter`}
                className={`w-full ca-btn ${
                  PRICING_DATA.starter.highlight ? "ca-btn-primary" : "ca-btn-secondary"
                }`}
              >
                {PRICING_DATA.starter.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Pro Plan */}
            <div className={`ca-pricing-card ${PRICING_DATA.pro.highlight ? "ca-pricing-card-featured" : ""}`}>
              {PRICING_DATA.pro.highlight && (
                <div className="ca-pricing-badge">Most Popular</div>
              )}

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-[var(--ca-coral-50)] flex items-center justify-center">
                    <Shield className="w-6 h-6 ca-text-coral" />
                  </div>
                  <h3 className="ca-pricing-name">{PRICING_DATA.pro.name}</h3>
                </div>
                <p className="ca-pricing-desc">{PRICING_DATA.pro.description}</p>
              </div>

              <div className="ca-pricing-price">
                <div className="flex items-baseline gap-2">
                  <span className="ca-pricing-amount">
                    ${getPrice(PRICING_DATA.pro.price)}
                  </span>
                  <span className="ca-pricing-period">
                    /{billingPeriod === "monthly" ? "mo" : "year"}
                  </span>
                </div>
                {billingPeriod === "annual" && (
                  <p className="text-sm text-gray-500 mt-2">
                    ${Math.floor(getPrice(PRICING_DATA.pro.price)! / 12)}/mo billed annually
                  </p>
                )}
              </div>

              <ul className="ca-pricing-features">
                {PRICING_DATA.pro.features.map((feature, i) => (
                  <li key={i} className="ca-pricing-feature">
                    {feature.included ? (
                      <Check className="ca-text-teal" />
                    ) : (
                      <X className="text-gray-300" />
                    )}
                    <span className={feature.included ? "text-gray-700" : "text-gray-400"}>
                      {feature.name}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/signup?plan=pro`}
                className={`w-full ca-btn ${
                  PRICING_DATA.pro.highlight ? "ca-btn-primary" : "ca-btn-secondary"
                }`}
              >
                {PRICING_DATA.pro.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Enterprise Plan */}
            <div className={`ca-pricing-card ${PRICING_DATA.enterprise.highlight ? "ca-pricing-card-featured" : ""}`}>
              {PRICING_DATA.enterprise.highlight && (
                <div className="ca-pricing-badge">Most Popular</div>
              )}

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-[var(--ca-teal-50)] flex items-center justify-center">
                    <Users className="w-6 h-6 ca-text-teal" />
                  </div>
                  <h3 className="ca-pricing-name">{PRICING_DATA.enterprise.name}</h3>
                </div>
                <p className="ca-pricing-desc">{PRICING_DATA.enterprise.description}</p>
              </div>

              <div className="ca-pricing-price">
                <div className="flex items-baseline gap-2">
                  <span className="ca-pricing-amount text-4xl">Custom</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Tailored to your specific needs
                </p>
              </div>

              <ul className="ca-pricing-features">
                {PRICING_DATA.enterprise.features.map((feature, i) => (
                  <li key={i} className="ca-pricing-feature">
                    {feature.included ? (
                      <Check className="ca-text-teal" />
                    ) : (
                      <X className="text-gray-300" />
                    )}
                    <span className={feature.included ? "text-gray-700" : "text-gray-400"}>
                      {feature.name}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/contact"
                className="w-full ca-btn ca-btn-secondary"
              >
                {PRICING_DATA.enterprise.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-16 flex flex-col md:flex-row items-center justify-center gap-8 text-sm font-medium text-gray-600 border-t border-gray-200 pt-12">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 ca-text-teal flex-shrink-0" />
              <span>256-bit SSL encryption</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 ca-text-teal flex-shrink-0" />
              <span>30-day money-back guarantee</span>
            </div>
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 ca-text-teal flex-shrink-0" />
              <span>GDPR & SOC 2 compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="ca-display-md mb-4">Compare All Features</h2>
            <p className="ca-body">
              See exactly what's included in each plan
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      Features
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Starter
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 bg-[var(--ca-teal-50)]">
                      Pro
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Enterprise
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Cloud Integrations</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">Up to 3</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900 bg-[var(--ca-teal-50)]">Unlimited</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Data Retention</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">7 days</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900 bg-[var(--ca-teal-50)]">90 days</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Organizations</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">1</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900 bg-[var(--ca-teal-50)]">Up to 5</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Cost Analytics</td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center bg-[var(--ca-teal-50)]">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Real-time Alerts</td>
                    <td className="px-6 py-4 text-center">
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center bg-[var(--ca-teal-50)]">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Advanced Forecasting</td>
                    <td className="px-6 py-4 text-center">
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center bg-[var(--ca-teal-50)]">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">API Access</td>
                    <td className="px-6 py-4 text-center">
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center bg-[var(--ca-teal-50)]">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Custom Integrations</td>
                    <td className="px-6 py-4 text-center">
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center bg-[var(--ca-teal-50)]">
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="w-5 h-5 ca-text-teal mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Support</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">Email</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900 bg-[var(--ca-teal-50)]">Priority</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">24/7 Dedicated</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="ca-display-md mb-4">Frequently Asked Questions</h2>
            <p className="ca-body">
              Everything you need to know about our pricing and plans
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-xl overflow-hidden transition-all duration-300 hover:border-[var(--ca-teal)]"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4">
                    {faq.question}
                  </span>
                  <span className="ca-text-teal text-2xl flex-shrink-0">
                    {openFaqIndex === index ? "−" : "+"}
                  </span>
                </button>
                {openFaqIndex === index && (
                  <div className="px-6 pb-5 pt-2 bg-gray-50 border-t border-gray-100">
                    <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-600 mb-4">Still have questions?</p>
            <Link href="/contact" className="ca-btn ca-btn-secondary">
              Contact Our Team
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="ca-cta">
        <div className="ca-cta-box">
          <div className="ca-cta-content">
            <div className="ca-cta-badge">
              <Sparkles className="w-4 h-4" />
              <span>Start Optimizing Today</span>
            </div>

            <h2 className="ca-cta-title">
              Ready to Cut Your Cloud Costs by 30%?
            </h2>

            <p className="ca-cta-subtitle">
              Join hundreds of teams already saving thousands every month with CloudAct.ai.
              Get started in minutes with our 14-day free trial.
            </p>

            <div className="ca-cta-buttons">
              <Link href="/signup" className="ca-cta-btn-white">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/contact" className="ca-cta-btn-outline">
                Schedule a Demo
              </Link>
            </div>

            <p className="text-sm opacity-80 mt-8">
              No credit card required • Cancel anytime • 30-day money-back guarantee
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
