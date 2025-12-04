import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2, Code, Rocket, TrendingUp } from "lucide-react"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Solutions - For Startups, Enterprises & Developers | CloudAct.ai",
  description: "Tailored cost optimization solutions for startups, enterprises, developers, and FinOps teams. Scale efficiently with CloudAct.ai.",
  openGraph: {
    title: "Solutions - For Startups, Enterprises & Developers | CloudAct.ai",
    description: "Tailored cost optimization solutions for startups, enterprises, developers, and FinOps teams.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solutions - For Startups, Enterprises & Developers | CloudAct.ai",
    description: "Tailored cost optimization solutions for every organization.",
  },
}

export default function SolutionsPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="cloudact-badge">
              <span className="flex h-2 w-2 rounded-full bg-cloudact-teal animate-pulse" />
              Tailored Solutions
            </div>
            <h1 className="cloudact-heading-xl">
              Solutions for Every Organization
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              From startups to enterprises, CloudAct adapts to your unique cost optimization needs
            </p>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="pb-24 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-6xl space-y-16">
            {/* For Startups */}
            <div className="cloudact-card group grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
              <div className="space-y-6">
                <div className="cloudact-badge-coral inline-flex">
                  <Rocket className="h-4 w-4" />
                  For Startups
                </div>
                <h2 className="cloudact-heading-lg">Scale Efficiently from Day One</h2>
                <p className="cloudact-body">
                  Control GenAI and cloud costs before they spiral. CloudAct helps startups build sustainable cost
                  practices from the beginning.
                </p>
                <ul className="space-y-3 cloudact-body-sm">
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Free {DEFAULT_TRIAL_DAYS}-day trial with no credit card
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    5-minute setup, zero infrastructure
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Pay-as-you-grow pricing
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Real-time cost visibility
                  </li>
                </ul>
                <Link href="/signup" className="cloudact-link inline-flex items-center text-lg">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="relative aspect-square rounded-2xl bg-cloudact-coral-light flex items-center justify-center overflow-hidden" aria-hidden="true">
                <Rocket className="h-40 w-40 text-cloudact-coral/30 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
              </div>
            </div>

            {/* For Enterprises */}
            <div className="cloudact-card group grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
              <div className="relative aspect-square rounded-2xl bg-cloudact-teal-light flex items-center justify-center md:order-first overflow-hidden" aria-hidden="true">
                <Building2 className="h-40 w-40 text-cloudact-teal/30 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
              </div>
              <div className="space-y-6">
                <div className="cloudact-badge inline-flex">
                  <Building2 className="h-4 w-4" />
                  For Enterprises
                </div>
                <h2 className="cloudact-heading-lg">Enterprise-Grade Cost Management</h2>
                <p className="cloudact-body">
                  Advanced security, compliance, and custom integrations for large organizations managing millions in
                  cloud spend.
                </p>
                <ul className="space-y-3 cloudact-body-sm">
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    SSO & SAML authentication
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    SOC 2 Type II certified
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Dedicated support team
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Custom SLAs & contracts
                  </li>
                </ul>
                <Link href="/contact" className="cloudact-link inline-flex items-center text-lg">
                  Contact Sales
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* For Developers */}
            <div className="cloudact-card group grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
              <div className="space-y-6">
                <div className="cloudact-badge inline-flex">
                  <Code className="h-4 w-4" />
                  For Developers
                </div>
                <h2 className="cloudact-heading-lg">API-First, Developer-Friendly</h2>
                <p className="cloudact-body">
                  Built by developers, for developers. Full API access, comprehensive docs, and developer-friendly
                  integrations.
                </p>
                <ul className="space-y-3 cloudact-body-sm">
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    RESTful API with SDKs
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Webhooks & real-time events
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Infrastructure as Code support
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-teal" />
                    Detailed API documentation
                  </li>
                </ul>
                <Link href="/signup" className="cloudact-link inline-flex items-center text-lg">
                  View API Docs
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="relative aspect-square rounded-2xl bg-cloudact-teal-light flex items-center justify-center overflow-hidden" aria-hidden="true">
                <Code className="h-40 w-40 text-cloudact-teal/30 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
              </div>
            </div>

            {/* For FinOps Teams */}
            <div className="cloudact-card group grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
              <div className="relative aspect-square rounded-2xl bg-cloudact-coral-light flex items-center justify-center md:order-first overflow-hidden" aria-hidden="true">
                <TrendingUp className="h-40 w-40 text-cloudact-coral/30 group-hover:scale-110 transition-transform duration-500" aria-hidden="true" />
              </div>
              <div className="space-y-6">
                <div className="cloudact-badge-coral inline-flex">
                  <TrendingUp className="h-4 w-4" />
                  For FinOps Teams
                </div>
                <h2 className="cloudact-heading-lg">Financial Control & Reporting</h2>
                <p className="cloudact-body">
                  Comprehensive financial tools for cost allocation, chargeback, and executive reporting.
                </p>
                <ul className="space-y-3 cloudact-body-sm">
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-coral" />
                    Automated invoice reconciliation
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-coral" />
                    Custom cost allocation rules
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-coral" />
                    Multi-currency support
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-cloudact-coral" />
                    Executive dashboards
                  </li>
                </ul>
                <Link href="/signup" className="cloudact-link inline-flex items-center text-lg">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
