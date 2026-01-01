"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Check, ArrowRight, Zap, Shield, Users, Loader2, Clock, DollarSign, HelpCircle, Rocket } from "lucide-react"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"
import "../premium.css"

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
]

// Plan icons based on plan name
const getPlanIcon = (planName: string) => {
  const name = planName.toLowerCase()
  if (name.includes("starter") || name.includes("free")) return Zap
  if (name.includes("pro") || name.includes("professional")) return Shield
  if (name.includes("enterprise") || name.includes("business") || name.includes("scale")) return Users
  return Zap
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
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <DollarSign className="w-4 h-4" aria-hidden="true" />
            Pricing
          </div>
          <h1 className="ca-page-hero-title">
            Simple, <span className="ca-hero-highlight-mint">Transparent</span> Pricing
          </h1>
          <p className="ca-page-hero-subtitle">
            Start optimizing your cloud costs today. 14-day free trial on all plans. No credit card required.
          </p>

          {/* Billing Toggle */}
          <div className="ca-billing-toggle" role="tablist" aria-label="Billing period">
            <button
              type="button"
              role="tab"
              aria-selected={billingPeriod === "monthly"}
              onClick={() => setBillingPeriod("monthly")}
              className={`ca-billing-btn ${billingPeriod === "monthly" ? "ca-billing-btn-active" : ""}`}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billingPeriod === "annual"}
              onClick={() => setBillingPeriod("annual")}
              className={`ca-billing-btn ${billingPeriod === "annual" ? "ca-billing-btn-active" : ""}`}
            >
              Annual
              <span className="ca-billing-badge">Save 20%</span>
            </button>
          </div>
          {billingPeriod === "annual" && getAnnualSavings() && (
            <p className="ca-billing-note">
              Pay annually and save ${getAnnualSavings()}/year on Pro plan
            </p>
          )}
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="ca-pricing-section">
        <div className="ca-pricing-container">
          {isLoading ? (
            <div className="ca-pricing-loading" role="status" aria-label="Loading pricing plans" aria-busy="true">
              <Loader2 className="w-8 h-8 animate-spin ca-icon-mint" aria-hidden="true" />
              <span>Loading plans...</span>
            </div>
          ) : error ? (
            <div className="ca-pricing-error">
              <p>{error}</p>
              <Link href="/contact" className="ca-btn-hero-secondary">
                Contact Sales
              </Link>
            </div>
          ) : displayPlans.length === 0 ? (
            <div className="ca-pricing-empty">
              <p>No pricing plans available. Please contact us for custom pricing.</p>
              <Link href="/contact" className="ca-btn-hero-primary">
                Contact Sales
              </Link>
            </div>
          ) : (
            <div className="ca-pricing-grid-premium">
              {displayPlans.map((plan) => {
                const Icon = getPlanIcon(plan.name)
                const isHighlighted = plan.name.toLowerCase().includes("pro")

                return (
                  <div
                    key={plan.id}
                    className={`ca-pricing-card-premium ${isHighlighted ? "ca-pricing-card-featured" : ""}`}
                  >
                    {isHighlighted && (
                      <div className="ca-pricing-badge-premium">Most Popular</div>
                    )}

                    <div className="ca-pricing-header">
                      <div className="ca-pricing-icon-premium">
                        <Icon className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <h3 className="ca-pricing-name-premium">{plan.name}</h3>
                      <p className="ca-pricing-desc-premium">{plan.description}</p>
                    </div>

                    <div className="ca-pricing-price-premium">
                      <span className="ca-pricing-amount-premium">
                        {plan.price === 0 ? "Free" : `$${plan.price}`}
                      </span>
                      {plan.price > 0 && (
                        <span className="ca-pricing-period-premium">
                          /{plan.interval === "year" ? "year" : "mo"}
                        </span>
                      )}
                    </div>
                    {plan.interval === "year" && plan.price > 0 && (
                      <p className="ca-pricing-annual-note">
                        ${Math.floor(plan.price / 12)}/mo billed annually
                      </p>
                    )}

                    <ul className="ca-pricing-features-premium">
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check className="w-4 h-4" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      <li>
                        <Check className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {plan.limits.teamMembers === -1 ? "Unlimited" : `Up to ${plan.limits.teamMembers}`} team members
                        </span>
                      </li>
                      <li>
                        <Check className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {plan.limits.providers === -1 ? "Unlimited" : `Up to ${plan.limits.providers}`} integrations
                        </span>
                      </li>
                    </ul>

                    <Link
                      href={plan.price === 0 ? "/signup?plan=starter" : `/signup?plan=${plan.id}`}
                      className={`ca-pricing-cta-btn ${isHighlighted ? "ca-btn-hero-primary" : "ca-btn-hero-secondary"}`}
                    >
                      {plan.price === 0 ? "Get Started Free" : plan.trialDays > 0 ? `Start ${plan.trialDays}-Day Trial` : "Subscribe Now"}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </div>
                )
              })}

              {/* Enterprise Card */}
              <div className="ca-pricing-card-premium">
                <div className="ca-pricing-header">
                  <div className="ca-pricing-icon-premium ca-pricing-icon-enterprise">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="ca-pricing-name-premium">Enterprise</h3>
                  <p className="ca-pricing-desc-premium">Custom solutions for large organizations</p>
                </div>

                <div className="ca-pricing-price-premium">
                  <span className="ca-pricing-amount-premium ca-pricing-amount-custom">Custom</span>
                </div>
                <p className="ca-pricing-annual-note">Tailored to your specific needs</p>

                <ul className="ca-pricing-features-premium">
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>Unlimited cloud integrations</span></li>
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>Enterprise analytics suite</span></li>
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>Unlimited data retention</span></li>
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>24/7 dedicated support</span></li>
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>Custom integrations</span></li>
                  <li><Check className="w-4 h-4" aria-hidden="true" /><span>SLA guarantees</span></li>
                </ul>

                <Link href="/contact" className="ca-pricing-cta-btn ca-btn-hero-secondary">
                  Contact Sales
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}

          {/* Trust Badges */}
          <div className="ca-pricing-trust">
            <div className="ca-pricing-trust-item">
              <Shield className="w-5 h-5" aria-hidden="true" />
              <span>256-bit SSL encryption</span>
            </div>
            <div className="ca-pricing-trust-item">
              <Clock className="w-5 h-5" aria-hidden="true" />
              <span>30-day money-back guarantee</span>
            </div>
            <div className="ca-pricing-trust-item">
              <Check className="w-5 h-5" aria-hidden="true" />
              <span>GDPR & SOC 2 compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="ca-faq-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            FAQ
          </span>
          <h2 className="ca-section-title">Frequently Asked Questions</h2>
          <p className="ca-section-subtitle">
            Everything you need to know about our pricing and plans
          </p>
        </div>

        <div className="ca-faq-container" role="region" aria-label="Frequently Asked Questions">
          {FAQS.map((faq, index) => (
            <div
              key={faq.question}
              className={`ca-faq-item ${openFaqIndex === index ? "ca-faq-item-open" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggleFaq(index)}
                className="ca-faq-question"
                aria-expanded={openFaqIndex === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{faq.question}</span>
                <span className="ca-faq-icon" aria-hidden="true">
                  {openFaqIndex === index ? "−" : "+"}
                </span>
              </button>
              {openFaqIndex === index && (
                <div id={`faq-answer-${index}`} className="ca-faq-answer" role="region">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="ca-faq-cta">
          <p>Still have questions?</p>
          <Link href="/contact" className="ca-btn-hero-secondary">
            Contact Our Team
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Rocket className="w-4 h-4" aria-hidden="true" />
            Start Optimizing Today
          </div>
          <h2 className="ca-final-cta-title">Ready to Optimize Your Cloud Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Join teams already saving with CloudAct.ai. Get started in minutes with our 14-day free trial.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="ca-btn-cta-secondary">
              Schedule a Demo
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
