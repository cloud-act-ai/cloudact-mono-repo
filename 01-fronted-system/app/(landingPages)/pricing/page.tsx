import type { Metadata } from "next"
import Link from "next/link"
import { Check, Shield, Lock, CreditCard } from "lucide-react"
import { getStripePlans } from "@/actions/stripe"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export const metadata: Metadata = {
  title: "Pricing - Simple, Transparent Plans | CloudAct.ai",
  description: "Start with a 14-day free trial. No credit card required. Choose from Starter, Pro, or Enterprise plans to optimize your GenAI and cloud costs.",
  openGraph: {
    title: "Pricing - Simple, Transparent Plans | CloudAct.ai",
    description: "Start with a 14-day free trial. No credit card required. Simple, transparent pricing for GenAI and cloud cost optimization.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing - Simple, Transparent Plans | CloudAct.ai",
    description: "Start with a 14-day free trial. No credit card required.",
  },
}

export default async function PricingPage() {
  // Fetch plans dynamically from Stripe
  const { data: plans, error } = await getStripePlans()

  // If fetching fails, show error state
  if (error || !plans || plans.length === 0) {
    return (
      <div className="py-32 bg-white">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <h1 className="cloudact-heading-xl">Simple, Transparent Pricing</h1>
            <p className="text-xl text-red-600">
              {error || "Unable to load pricing plans. Please try again later."}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Get trial days from first plan (Stripe is source of truth)
  const trialDays = plans[0]?.trialDays

  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <h1 className="cloudact-heading-xl">
              Simple, Transparent Pricing
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              Start with a 14-day free trial. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 bg-white">
        <div className="container px-4 md:px-12">
          {error && (
            <div className="mx-auto max-w-md mb-8 p-4 bg-red-50 text-red-600 rounded-lg text-center">
              Failed to load pricing plans. Please try again later.
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative cloudact-pricing-card flex flex-col ${plan.name === "Pro" ? "cloudact-pricing-card-featured" : ""
                  }`}
              >
                {plan.name === "Pro" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#FF6E50] to-[#FF8A70] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline">
                    <span className="cloudact-pricing-value">
                      ${plan.price}
                    </span>
                    <span className="text-sm font-medium text-gray-600 ml-1">
                      /{plan.interval}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {plan.description || "Perfect for growing teams"}
                  </p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {(plan.features || ["Unlimited Projects", "Analytics Dashboard", "Priority Support"]).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-[#007A78] shrink-0 mt-0.5" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/signup?plan=${plan.priceId}`}
                  className={`w-full justify-center ${plan.name === "Pro"
                      ? "cloudact-btn-primary"
                      : "cloudact-btn-secondary"
                    }`}
                >
                  Start {trialDays}-Day Free Trial
                </Link>
              </div>
            ))}
          </div>

          {/* Trust Badges */}
          <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 text-sm font-medium text-gray-600 border-t border-gray-200 pt-12">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#007A78]" />
              <span>Secure payments via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#007A78]" />
              <span>256-bit SSL encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#007A78]" />
              <span>GDPR compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Section */}
      <section className="py-20 bg-gray-50 border-y border-gray-200">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 text-center md:text-left">
              <h2 className="cloudact-heading-lg">Need a custom plan?</h2>
              <p className="cloudact-body">
                For large organizations with specific compliance and support needs.
              </p>
            </div>
            <Link
              href="/contact"
              className="cloudact-btn-secondary"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-3xl space-y-8">
            <div className="text-center space-y-2">
              <h2 className="cloudact-heading-lg">Frequently Asked Questions</h2>
              <p className="cloudact-body">
                Everything you need to know about our pricing and billing.
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" className="border-gray-200">
                <AccordionTrigger className="text-base text-gray-900 hover:text-[#007A78]">Is there a free trial?</AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes, all plans come with a {trialDays}-day free trial. You won't be charged until the trial ends.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="border-gray-200">
                <AccordionTrigger className="text-base text-gray-900 hover:text-[#007A78]">Can I change plans later?</AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Absolutely. You can upgrade or downgrade your plan at any time from your dashboard settings.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="border-gray-200">
                <AccordionTrigger className="text-base text-gray-900 hover:text-[#007A78]">What payment methods do you accept?</AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  We accept all major credit cards (Visa, Mastercard, Amex) via Stripe secure checkout.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="border-gray-200">
                <AccordionTrigger className="text-base text-gray-900 hover:text-[#007A78]">Do you offer enterprise discounts?</AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  Yes, for annual contracts and large volume commitments. Please contact our sales team for details.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
    </>
  )
}
