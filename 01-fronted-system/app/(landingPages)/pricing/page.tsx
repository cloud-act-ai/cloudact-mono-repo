"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Check, ArrowRight, Loader2, Clock, Shield, DollarSign, HelpCircle, Rocket } from "lucide-react"
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
      {/* Hero Section - MINT gradient (like home page hero) */}
      <section className="ca-page-hero relative overflow-hidden">
        {/* MINT radial gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.15), transparent 70%)'
          }}
        />
        <div className="ca-page-hero-content relative z-10">
          {/* Eyebrow badge - dark slate style (like Most Popular) */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <DollarSign className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Pricing</span>
            <span
              className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full"
              style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
            >
              Save 20%
            </span>
          </div>
          <h1 className="ca-page-hero-title">
            Simple, <span className="font-semibold">Transparent</span> Pricing
          </h1>
          <p className="ca-page-hero-subtitle">
            <span className="font-semibold">Start optimizing your cloud costs today.</span>{" "}
            14-day free trial on all plans. No credit card required.
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
              <span
                className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full uppercase"
                style={{ backgroundColor: 'rgba(144, 252, 166, 0.3)', color: '#0f5132' }}
              >
                Save 20%
              </span>
            </button>
          </div>
          {billingPeriod === "annual" && getAnnualSavings() && (
            <p className="ca-billing-note">
              Pay annually and save ${getAnnualSavings()}/year on Pro plan
            </p>
          )}
        </div>
      </section>

      {/* Pricing Cards - CORAL gradient (alternating from hero MINT) */}
      <section className="ca-pricing-section relative overflow-hidden">
        {/* CORAL radial gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 108, 94, 0.08), transparent 70%)'
          }}
        />
        <div className="ca-pricing-container relative z-10">
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
                const isHighlighted = plan.name.toLowerCase().includes("pro")

                return (
                  <div
                    key={plan.id}
                    className={`ca-pricing-card-premium ${isHighlighted ? "ca-pricing-card-featured" : ""}`}
                  >
                    {isHighlighted && (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap"
                        style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
                      >
                        Most Popular
                      </div>
                    )}

                    <div className="ca-pricing-header">
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

      {/* FAQ Section - MINT gradient (alternating: Hero=MINT, Pricing=CORAL, FAQ=MINT) */}
      <section className="ca-faq-section relative overflow-hidden">
        {/* MINT radial gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.12), transparent 70%)'
          }}
        />
        <div className="ca-section-header-centered relative z-10">
          {/* Eyebrow badge - dark slate style (like Most Popular) */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <HelpCircle className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>FAQ</span>
          </div>
          <h2 className="ca-section-title">
            Frequently Asked <span className="font-semibold">Questions</span>
          </h2>
          <p className="ca-section-subtitle">
            <span className="font-semibold">Everything you need to know</span>{" "}
            about our pricing and plans
          </p>
        </div>

        <div className="ca-faq-container relative z-10" role="region" aria-label="Frequently Asked Questions">
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

        <div className="ca-faq-cta relative z-10">
          <p>Still have questions?</p>
          <Link href="/contact" className="ca-btn-hero-secondary">
            Contact Our Team
          </Link>
        </div>
      </section>

      {/* Final CTA - DARK section (like home page) */}
      <section className="ca-final-cta-section relative overflow-hidden">
        <div className="ca-final-cta-container relative z-10">
          {/* Eyebrow badge - mint style on dark bg for contrast */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5"
            style={{ backgroundColor: '#90FCA6' }}
          >
            <Rocket className="w-4 h-4" style={{ color: '#0f172a' }} aria-hidden="true" />
            <span className="text-xs font-semibold" style={{ color: '#0f172a' }}>Start Optimizing Today</span>
          </div>
          <h2 className="ca-final-cta-title">
            Ready to <span className="font-semibold">Optimize</span> Your Cloud Costs?
          </h2>
          <p className="ca-final-cta-subtitle">
            Join teams{" "}
            <span className="font-semibold">already saving with CloudAct.ai</span>.
            Get started in minutes with our 14-day free trial.
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
