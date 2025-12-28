"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Check, X, ArrowRight, Zap, Shield, Clock, Users, Sparkles, Loader2 } from "lucide-react"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"

// FAQs - static content
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

// Plan icons based on plan name
const getPlanIcon = (planName: string) => {
  const name = planName.toLowerCase()
  if (name.includes("starter") || name.includes("free")) return Zap
  if (name.includes("pro") || name.includes("professional")) return Shield
  if (name.includes("enterprise") || name.includes("business")) return Users
  return Zap
}

// Plan accent color based on plan name
const getPlanAccent = (planName: string) => {
  const name = planName.toLowerCase()
  if (name.includes("pro") || name.includes("professional")) return "coral"
  return "teal"
}

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  const [plans, setPlans] = useState<DynamicPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPlans() {
      setIsLoading(true)
      const result = await getStripePlans()
      if (result.data) {
        setPlans(result.data)
      } else {
        setError(result.error || "Failed to load pricing plans")
      }
      setIsLoading(false)
    }
    loadPlans()
  }, [])

  // Filter plans by billing period
  const filteredPlans = plans.filter(plan =>
    billingPeriod === "monthly" ? plan.interval === "month" : plan.interval === "year"
  )

  // If no plans for selected period, show all
  const displayPlans = filteredPlans.length > 0 ? filteredPlans : plans

  const formatPrice = (price: number, interval: string) => {
    if (price === 0) return "Free"
    return `$${price}/${interval === "year" ? "year" : "mo"}`
  }

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  // Calculate savings for annual billing
  const getAnnualSavings = () => {
    const monthlyPro = plans.find(p => p.interval === "month" && p.price > 0)
    if (!monthlyPro) return null
    return Math.floor(monthlyPro.price * 12 * 0.2)
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
          {billingPeriod === "annual" && getAnnualSavings() && (
            <p className="text-sm text-gray-500">
              Pay annually and save ${getAnnualSavings()}/year on Pro plan
            </p>
          )}
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--ca-teal)]" />
              <span className="ml-3 text-gray-600">Loading plans...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600 mb-4">{error}</p>
              <Link href="/contact" className="ca-btn ca-btn-secondary">
                Contact Sales
              </Link>
            </div>
          ) : displayPlans.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-600 mb-4">No pricing plans available. Please contact us for custom pricing.</p>
              <Link href="/contact" className="ca-btn ca-btn-primary">
                Contact Sales
              </Link>
            </div>
          ) : (
            <div className="ca-pricing-grid">
              {displayPlans.map((plan, index) => {
                const Icon = getPlanIcon(plan.name)
                const accent = getPlanAccent(plan.name)
                const isHighlighted = plan.name.toLowerCase().includes("pro")

                return (
                  <div
                    key={plan.id}
                    className={`ca-pricing-card ${isHighlighted ? "ca-pricing-card-featured" : ""}`}
                  >
                    {isHighlighted && (
                      <div className="ca-pricing-badge">Most Popular</div>
                    )}

                    <div className="mb-8">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-12 h-12 rounded-xl ${accent === "coral" ? "bg-[var(--ca-coral-50)]" : "bg-[var(--ca-teal-50)]"} flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 ${accent === "coral" ? "ca-text-coral" : "ca-text-teal"}`} />
                        </div>
                        <h3 className="ca-pricing-name">{plan.name}</h3>
                      </div>
                      <p className="ca-pricing-desc">{plan.description}</p>
                    </div>

                    <div className="ca-pricing-price">
                      <div className="flex items-baseline gap-2">
                        <span className="ca-pricing-amount">
                          {plan.price === 0 ? "Free" : `$${plan.price}`}
                        </span>
                        {plan.price > 0 && (
                          <span className="ca-pricing-period">
                            /{plan.interval === "year" ? "year" : "mo"}
                          </span>
                        )}
                      </div>
                      {plan.interval === "year" && plan.price > 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          ${Math.floor(plan.price / 12)}/mo billed annually
                        </p>
                      )}
                    </div>

                    <ul className="ca-pricing-features">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="ca-pricing-feature">
                          <Check className="ca-text-teal" />
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                      {/* Show limits */}
                      <li className="ca-pricing-feature">
                        <Check className="ca-text-teal" />
                        <span className="text-gray-700">
                          {plan.limits.teamMembers === -1 ? "Unlimited" : `Up to ${plan.limits.teamMembers}`} team members
                        </span>
                      </li>
                      <li className="ca-pricing-feature">
                        <Check className="ca-text-teal" />
                        <span className="text-gray-700">
                          {plan.limits.providers === -1 ? "Unlimited" : `Up to ${plan.limits.providers}`} integrations
                        </span>
                      </li>
                      <li className="ca-pricing-feature">
                        <Check className="ca-text-teal" />
                        <span className="text-gray-700">
                          {plan.limits.pipelinesPerDay === -1 ? "Unlimited" : `${plan.limits.pipelinesPerDay}`} pipeline runs/day
                        </span>
                      </li>
                    </ul>

                    <Link
                      href={plan.price === 0 ? "/signup?plan=starter" : `/signup?plan=${plan.id}`}
                      className={`w-full ca-btn ${isHighlighted ? "ca-btn-primary" : "ca-btn-secondary"}`}
                    >
                      {plan.price === 0 ? "Get Started Free" : plan.trialDays > 0 ? `Start ${plan.trialDays}-Day Trial` : "Subscribe Now"}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )
              })}

              {/* Always show Enterprise card */}
              <div className="ca-pricing-card">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-[var(--ca-teal-50)] flex items-center justify-center">
                      <Users className="w-6 h-6 ca-text-teal" />
                    </div>
                    <h3 className="ca-pricing-name">Enterprise</h3>
                  </div>
                  <p className="ca-pricing-desc">Custom solutions for large organizations</p>
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
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">Unlimited cloud integrations</span></li>
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">Enterprise analytics suite</span></li>
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">Unlimited data retention</span></li>
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">24/7 dedicated support</span></li>
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">Custom integrations</span></li>
                  <li className="ca-pricing-feature"><Check className="ca-text-teal" /><span className="text-gray-700">SLA guarantees</span></li>
                </ul>

                <Link href="/contact" className="w-full ca-btn ca-btn-secondary">
                  Contact Sales
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

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
              Ready to Optimize Your Cloud Costs?
            </h2>

            <p className="ca-cta-subtitle">
              Join teams already saving with CloudAct.ai.
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
