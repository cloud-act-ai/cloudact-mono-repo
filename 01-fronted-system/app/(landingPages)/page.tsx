"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowRight, TrendingDown } from "lucide-react"

import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { HowItWorks } from "@/components/landing/how-it-works"
import { ProductScreenshots } from "@/components/landing/product-screenshots"
import { FeatureTabs } from "@/components/landing/feature-tabs"
import { IntegrationsWall } from "@/components/landing/integrations-wall"
import { Testimonials } from "@/components/landing/testimonials"

// ============================================
// HERO SECTION - Enterprise with Dashboard Preview
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Pure white luminous background */}
      <div className="absolute inset-0 bg-white" />

      {/* Subtle scientific grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(to right, rgba(148, 163, 184, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px'
      }} />

      {/* Luminous center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px]">
        <div className="absolute inset-0 bg-gradient-radial from-white via-[#90FCA6]/8 to-transparent rounded-[100%] blur-[80px]" />
      </div>

      {/* Subtle mint glow */}
      <div className="absolute top-20 left-[10%] w-[300px] h-[300px] bg-[#90FCA6]/10 rounded-full blur-[80px]" />

      <div className="container relative z-10 px-4 mx-auto max-w-7xl py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* LEFT - Content */}
          <div className="space-y-6">
            {/* Powered by Google Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-full shadow-lg shadow-slate-900/5">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-xs font-semibold text-slate-700">Powered by Google Cloud & Data AI</span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-slate-900 leading-[1.08] tracking-tight">
                Built for the Modern Cloud
              </h1>
            </motion.div>

            {/* Value prop */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-slate-600 leading-relaxed max-w-xl"
            >
              Enterprise-grade cost intelligence with real-time analytics, intelligent anomaly detection, and beautiful visualizations. Track every dollar across AWS, GCP, Azure, OpenAI, Anthropic, and 50+ SaaS tools.
            </motion.p>

            {/* CTA Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-3 pt-2"
            >
              <Link
                href="/signup"
                className="group inline-flex items-center h-12 px-7 text-sm font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-lg shadow-[#90FCA6]/25"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="group inline-flex items-center h-12 px-7 text-sm font-semibold rounded-full hover:bg-slate-800 transition-all"
                style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
              >
                <span style={{ color: '#ffffff' }}>Watch Demo</span>
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap items-center gap-5 pt-3"
            >
              {["No credit card", "5-min setup", "SOC 2 ready"].map((item, i) => (
                <span key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>

          {/* RIGHT - Dashboard with glow effect */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            {/* Glow behind dashboard */}
            <div className="absolute -inset-4 bg-[#90FCA6]/15 rounded-2xl blur-2xl" />

            <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-2xl shadow-slate-900/15 bg-white">
              <HeroDashboard />
            </div>

            {/* Floating stat */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.4 }}
              className="absolute -bottom-4 -left-4 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl px-5 py-4 shadow-xl shadow-slate-900/10"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#90FCA6] to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <TrendingDown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">-$12,450</div>
                  <div className="text-xs text-slate-500 font-medium">saved this month</div>
                </div>
              </div>
            </motion.div>

            {/* Live indicator */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.3 }}
              className="absolute -top-3 -right-3 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-full px-4 py-2 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-slate-700">Live Data</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// LOGO CLOUD
// ============================================
function LogoCloud() {
  const providers = [
    { name: "AWS", src: "/logos/providers/aws.svg" },
    { name: "Google Cloud", src: "/logos/providers/gcp.svg" },
    { name: "Azure", src: "/logos/providers/azure.svg" },
    { name: "OpenAI", src: "/logos/providers/openai.svg" },
    { name: "Anthropic", src: "/logos/providers/anthropic.svg" },
    { name: "Gemini", src: "/logos/providers/gemini.svg" },
  ]

  return (
    <section className="py-8 bg-white">
      <div className="container px-4 mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Integrations</span>
          {providers.map((p, i) => (
            <Image
              key={i}
              src={p.src}
              alt={p.name}
              width={80}
              height={24}
              className="h-6 w-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// THREE PILLARS - No Icons
// ============================================
function ThreePillars() {
  const pillars = [
    {
      title: "Cloud Infrastructure",
      providers: "AWS  •  GCP  •  Azure  •  OCI",
      description: "Unified multi-cloud cost visibility with automatic tagging, anomaly detection, and FOCUS 1.3 compliance.",
      features: ["Real-time cost tracking", "Reserved instance optimization", "Resource rightsizing"],
    },
    {
      title: "GenAI & LLM Costs",
      providers: "OpenAI  •  Anthropic  •  Gemini  •  Bedrock",
      description: "Track every token and API call across all your AI providers with per-project attribution.",
      features: ["Per-token cost attribution", "Model cost comparison", "Usage forecasting"],
    },
    {
      title: "SaaS Subscriptions",
      providers: "Slack  •  Canva  •  Notion  •  50+ apps",
      description: "Discover shadow IT, eliminate unused licenses, and optimize your SaaS portfolio.",
      features: ["License utilization tracking", "Renewal alerts", "Vendor consolidation"],
    },
  ]

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
            All your spend. One platform.
          </h2>
          <p className="text-xl text-slate-600">
            CloudAct unifies cost data from every corner of your infrastructure into a single source of truth.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {pillars.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 hover:shadow-xl hover:border-slate-300 transition-all duration-300"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-2">{pillar.title}</h3>
              <p className="text-sm text-slate-400 font-medium mb-4">{pillar.providers}</p>
              <p className="text-slate-600 mb-6 leading-relaxed">{pillar.description}</p>
              <ul className="space-y-3">
                {pillar.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors"
              >
                Learn more
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// KEY CAPABILITIES - No Icons
// ============================================
function KeyCapabilities() {
  const capabilities = [
    { title: "AI Anomaly Detection", desc: "Catch spikes in <5 min" },
    { title: "100% Cost Allocation", desc: "Auto-tag all resources" },
    { title: "Enterprise Security", desc: "SSO, RBAC, SOC 2" },
    { title: "Unit Economics", desc: "Cost per customer" },
  ]

  return (
    <section className="py-10 bg-white border-y border-slate-100">
      <div className="container px-4 mx-auto max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2" />
              <div>
                <div className="text-sm font-semibold text-slate-900">{cap.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{cap.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// FEATURES GRID - No Icons
// ============================================
function FeaturesGrid() {
  const features = [
    {
      title: "AI-Powered Anomaly Detection",
      description: "Catch unexpected spikes before they become budget busters. Alert within 5 minutes.",
    },
    {
      title: "100% Cost Allocation",
      description: "Automatic tagging and allocation. Know exactly which team, project, or customer drives costs.",
    },
    {
      title: "Enterprise Security",
      description: "SOC 2 Type II, SSO, RBAC, and audit logs. Built for enterprises from day one.",
    },
    {
      title: "Optimization Recommendations",
      description: "Get actionable recommendations to reduce waste. Reserved instances, rightsizing, and more.",
    },
    {
      title: "Real-Time Dashboards",
      description: "No more waiting for monthly bills. See your spend as it happens with live data sync.",
    },
    {
      title: "Team Collaboration",
      description: "Share dashboards, set budgets, and assign alerts. Built for cross-functional teams.",
    },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
            Everything you need to control costs
          </h2>
          <p className="text-xl text-slate-600">
            Purpose-built for engineering and finance teams who need visibility, not just reports.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group"
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// PRICING - Enterprise Ready
// ============================================
function PricingSection() {
  const plans = [
    {
      name: "Starter",
      price: "$19",
      description: "For small teams getting started",
      features: [
        "2 team members",
        "3 provider integrations",
        "6 daily pipeline runs",
        "30-day data retention",
        "Email alerts",
      ],
      highlighted: false,
    },
    {
      name: "Professional",
      price: "$69",
      description: "For growing engineering teams",
      features: [
        "6 team members",
        "6 provider integrations",
        "25 daily pipeline runs",
        "90-day data retention",
        "Slack & PagerDuty alerts",
        "Custom dashboards",
      ],
      highlighted: true,
    },
    {
      name: "Scale",
      price: "$199",
      description: "For organizations at scale",
      features: [
        "11 team members",
        "10 provider integrations",
        "100 daily pipeline runs",
        "1-year data retention",
        "SSO & RBAC",
        "Priority support",
      ],
      highlighted: false,
    },
  ]

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-xl text-slate-600">
            14-day free trial. No credit card required.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative"
            >
              {plan.highlighted && (
                <div className="absolute -inset-[2px] bg-[#90FCA6] rounded-3xl" />
              )}
              <div className={`relative h-full flex flex-col p-8 rounded-3xl bg-white ${
                !plan.highlighted && "border border-slate-200"
              }`}>
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-900 text-white text-sm font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                  <p className="text-slate-500 text-sm">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-5xl font-bold text-slate-900">{plan.price}</span>
                  <span className="text-slate-500">/mo</span>
                </div>

                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Buttons - Mint for highlighted, Black for others */}
                <Link
                  href="/signup"
                  className={`w-full inline-flex items-center justify-center h-12 rounded-full text-base font-semibold transition-all ${
                    plan.highlighted
                      ? "bg-[#90FCA6] hover:bg-[#7ee994] shadow-lg shadow-[#90FCA6]/25"
                      : "hover:bg-slate-800"
                  }`}
                  style={{
                    backgroundColor: plan.highlighted ? '#90FCA6' : '#0f172a',
                    color: plan.highlighted ? '#0f172a' : '#ffffff'
                  }}
                >
                  <span style={{ color: plan.highlighted ? '#0f172a' : '#ffffff' }}>Get Started</span>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <p className="text-slate-600">
            Need more? <Link href="/contact" className="font-semibold text-slate-900 hover:underline">Contact us for Enterprise pricing</Link>
          </p>
        </motion.div>
      </div>
    </section>
  )
}

// ============================================
// FINAL CTA
// ============================================
function FinalCTA() {
  return (
    <section className="py-20 bg-slate-900 text-white relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#90FCA6]/10 rounded-full blur-[100px]" />

      <div className="container px-4 mx-auto max-w-4xl relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-5">
              Start saving on cloud costs today
            </h2>
            <p className="text-lg text-slate-300 max-w-xl mx-auto mb-10">
              Join engineering teams saving 35% on average. 14-day free trial.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center h-12 px-8 text-sm font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-lg shadow-[#90FCA6]/25"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center h-12 px-8 text-sm font-semibold border-2 border-white/30 rounded-full hover:bg-white/10 transition-all"
                style={{ color: '#ffffff' }}
              >
                <span style={{ color: '#ffffff' }}>Schedule Demo</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
              {["No credit card", "5-min setup", "Cancel anytime"].map((item, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  {item}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// MAIN PAGE
// ============================================
export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <HeroSection />
      <LogoCloud />
      <ThreePillars />
      <KeyCapabilities />

      <section className="py-16 bg-slate-50">
        <ProductScreenshots />
      </section>

      <section className="py-16 bg-white">
        <HowItWorks />
      </section>

      <FeaturesGrid />

      <section className="py-16 bg-slate-50">
        <div className="container px-4 mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              Go deeper than the bill
            </h2>
          </motion.div>
          <FeatureTabs />
        </div>
      </section>

      <IntegrationsWall />
      <PricingSection />

      <section className="py-16 bg-white">
        <div className="container px-4 mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              Trusted by engineering teams
            </h2>
          </motion.div>
          <Testimonials />
        </div>
      </section>

      <FinalCTA />
    </div>
  )
}
