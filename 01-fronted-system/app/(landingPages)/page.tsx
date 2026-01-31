"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, TrendingDown, Zap, Layers, BarChart3, Shield, Sparkles, Users, DollarSign } from "lucide-react"

import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { HowItWorks } from "@/components/landing/how-it-works"
import { ProductScreenshots } from "@/components/landing/product-screenshots"
import { FeatureTabs } from "@/components/landing/feature-tabs"
import { IntegrationsWall } from "@/components/landing/integrations-wall"
import { Testimonials } from "@/components/landing/testimonials"

// ============================================
// HERO SECTION - Enterprise H2O.ai Inspired
// ============================================
function HeroSection() {
  return (
    <section className="relative pt-8 pb-12 lg:pt-12 lg:pb-16 overflow-hidden bg-white">
      {/* Premium mint radial glow - centered at top (like pricing page) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.15), transparent 70%)'
        }}
      />

      <div className="container relative z-10 px-4 mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* LEFT - Content */}
          <div className="space-y-5">
            {/* Powered by Google Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex"
            >
              <div className="flex items-center gap-2.5 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-shadow cursor-default">
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem] font-bold text-slate-900 leading-[1.1] tracking-tight">
                Built for GenAI<br className="hidden sm:block" />
                & Modern Cloud
              </h1>
            </motion.div>

            {/* Value prop with secondary color accent */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-base lg:text-lg text-slate-600 leading-relaxed max-w-lg"
            >
              <strong className="text-slate-900">Track every LLM token and cloud resource.</strong>{" "}
              Real-time GenAI cost analytics, intelligent anomaly detection, and unified cloud visibility.
            </motion.p>

            {/* CTA Row - Shining Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 pt-1"
            >
              {/* Primary Button - Mint */}
              <Link
                href="/signup"
                className="group relative inline-flex items-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
                style={{ backgroundColor: '#90FCA6' }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center text-sm font-semibold" style={{ color: '#0f172a' }}>
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>

              {/* Secondary Button - White with border */}
              <Link
                href="/demo"
                className="group relative inline-flex items-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
              >
                <span className="relative text-sm font-semibold" style={{ color: '#0f172a' }}>Request Demo</span>
              </Link>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="flex flex-wrap items-center gap-4 pt-2 text-sm text-slate-500"
            >
              <span>No credit card required</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>5-minute setup</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>SOC 2 compliant</span>
            </motion.div>
          </div>

          {/* RIGHT - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative"
          >
            {/* Subtle glow behind */}
            <div className="absolute -inset-3 bg-gradient-to-br from-[#90FCA6]/20 via-transparent to-[#90FCA6]/10 rounded-2xl blur-xl" />

            {/* Dashboard card */}
            <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
              <HeroDashboard />
            </div>

            {/* Floating stat badge */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 0.3 }}
              className="absolute -bottom-3 -left-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#90FCA6] to-emerald-500 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">-$12,450</div>
                  <div className="text-xs text-slate-500">saved this month</div>
                </div>
              </div>
            </motion.div>

            {/* Live indicator */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.25 }}
              className="absolute -top-2 -right-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-md"
            >
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-slate-700">Live</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}


// ============================================
// THREE PILLARS - Enterprise Cards
// ============================================
function ThreePillars() {
  const pillars = [
    {
      title: "GenAI & LLM Costs",
      providers: "OpenAI  •  Anthropic  •  Gemini  •  Bedrock",
      description: "Track every token and API call across all your AI providers with per-project attribution.",
      features: ["Per-token cost attribution", "Model cost comparison", "Usage forecasting"],
    },
    {
      title: "Cloud Infrastructure",
      providers: "AWS  •  GCP  •  Azure  •  OCI",
      description: "Unified multi-cloud cost visibility with automatic tagging, anomaly detection, and FOCUS 1.3 compliance.",
      features: ["Real-time cost tracking", "Reserved instance optimization", "Resource rightsizing"],
    },
    {
      title: "SaaS Subscriptions",
      providers: "Slack  •  Canva  •  Notion  •  50+ apps",
      description: "Discover shadow IT, eliminate unused licenses, and optimize your SaaS portfolio.",
      features: ["License utilization tracking", "Renewal alerts", "Vendor consolidation"],
    },
  ]

  return (
    <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
      {/* MINT radial gradient - alternating (Hero=MINT, Integrations=CORAL, ThreePillars=MINT) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.10), transparent 70%)'
        }}
      />
      <div className="container relative z-10 mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          {/* Eyebrow badge - dark slate style (like Most Popular) */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <Layers className="w-4 h-4" style={{ color: '#ffffff' }} />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Unified Platform</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            All your spend. One platform.
          </h2>
          <p className="text-lg text-slate-600">
            CloudAct unifies cost data from every corner of your infrastructure into a single source of truth.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group relative bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 cursor-pointer"
            >
              {/* Hover shine effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white via-[#90FCA6]/5 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="relative">
                <h3 className="text-lg font-bold text-slate-900 mb-1">{pillar.title}</h3>
                <p className="text-xs text-slate-400 font-medium mb-3">{pillar.providers}</p>
                <p className="text-slate-600 text-sm mb-5 leading-relaxed">{pillar.description}</p>
                <ul className="space-y-2">
                  {pillar.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
                    Learn more
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// KEY CAPABILITIES
// ============================================
function KeyCapabilities() {
  const capabilities = [
    { title: "AI Anomaly Detection", desc: "Catch spikes in <5 min" },
    { title: "100% Cost Allocation", desc: "Auto-tag all resources" },
    { title: "Enterprise Security", desc: "SSO, RBAC, SOC 2" },
    { title: "Unit Economics", desc: "Cost per customer" },
  ]

  return (
    <section className="py-8 bg-white border-y border-slate-100">
      <div className="container px-4 mx-auto max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="text-center md:text-left"
            >
              <div className="text-sm font-semibold text-slate-900">{cap.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{cap.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// FEATURES GRID - Clean Enterprise
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
    <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
      {/* CORAL radial gradient - alternating (HowItWorks=MINT, FeaturesGrid=CORAL) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.08), transparent 70%)'
        }}
      />
      <div className="container relative z-10 mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          {/* Eyebrow badge - dark slate style (like Most Popular) */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Capabilities</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Everything you need to control costs
          </h2>
          <p className="text-lg text-slate-600">
            <strong className="text-slate-900">Purpose-built</strong> for engineering and finance teams who need visibility, not just reports.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <h3 className="text-base font-semibold text-slate-900 mb-2">{feature.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// PRICING - Enterprise with Shining Buttons (MINT gradient)
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
    <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
      {/* CORAL radial gradient - alternating (FeatureTabs=MINT, Pricing=CORAL, Testimonials=MINT) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.08), transparent 70%)'
        }}
      />
      <div className="container relative z-10 mx-auto px-4 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-xl mx-auto mb-12"
        >
          {/* Eyebrow badge - dark slate style (like Most Popular) */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <DollarSign className="w-4 h-4" style={{ color: '#ffffff' }} />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Pricing</span>
            {/* Save 20% badge - mint accent */}
            <span
              className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full"
              style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
            >
              Save 20%
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-slate-600">
            14-day free trial. No credit card required. <strong className="text-slate-900">Pay annually and save 20%.</strong>
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="relative"
            >
              {plan.highlighted && (
                <div className="absolute -inset-[1px] bg-[#90FCA6] rounded-2xl" />
              )}
              <div className={`relative h-full flex flex-col p-6 rounded-2xl bg-white ${
                !plan.highlighted && "border border-slate-200"
              }`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-900 mb-0.5">{plan.name}</h3>
                  <p className="text-slate-500 text-sm">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>

                <ul className="space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-slate-600 text-sm">
                      <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <Link
                  href="/signup"
                  className={`group relative w-full inline-flex items-center justify-center h-11 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
                    plan.highlighted ? "hover:shadow-lg hover:shadow-[#90FCA6]/30" : "hover:shadow-md"
                  }`}
                  style={plan.highlighted
                    ? { backgroundColor: '#90FCA6' }
                    : { backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }
                  }
                >
                  {plan.highlighted && (
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  )}
                  <span
                    className="relative text-sm font-semibold"
                    style={{ color: '#0f172a' }}
                  >
                    Get Started
                  </span>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <p className="text-slate-600 text-sm">
            Need more? <Link href="/contact" className="font-semibold text-slate-900 hover:underline">Contact us for Enterprise pricing</Link>
          </p>
        </motion.div>
      </div>
    </section>
  )
}

// ============================================
// FINAL CTA - Dark with Luminous Glow
// ============================================
function FinalCTA() {
  return (
    <section className="py-16 lg:py-20 bg-slate-900 text-white relative overflow-hidden">
      {/* Luminous glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-[#90FCA6]/8 rounded-full blur-[80px]" />

      <div className="container px-4 mx-auto max-w-3xl relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {/* Eyebrow badge - mint style on dark bg for contrast */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5"
              style={{ backgroundColor: '#90FCA6' }}
            >
              <Zap className="w-4 h-4" style={{ color: '#0f172a' }} />
              <span className="text-xs font-semibold" style={{ color: '#0f172a' }}>Get Started</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Start saving on cloud costs today
            </h2>
            <p className="text-base text-slate-400 max-w-md mx-auto mb-8">
              Join engineering teams <strong className="text-white">saving 35% on average</strong>. 14-day free trial.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              {/* Primary CTA - Mint */}
              <Link
                href="/signup"
                className="group relative inline-flex items-center justify-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
                style={{ backgroundColor: '#90FCA6' }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center text-sm font-semibold" style={{ color: '#0f172a' }}>
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>

              {/* Secondary CTA - White button */}
              <Link
                href="/demo"
                className="group relative inline-flex items-center justify-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: '#ffffff' }}
              >
                <span className="relative text-sm font-semibold" style={{ color: '#0f172a' }}>Schedule Demo</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
              <span>No credit card</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>5-min setup</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>Cancel anytime</span>
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
      <IntegrationsWall />
      <ThreePillars />
      <KeyCapabilities />

      {/* Product Screenshots Section - CORAL gradient */}
      <section className="relative py-12 lg:py-16 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.08), transparent 70%)'
          }}
        />
        <div className="container relative z-10 px-4 mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            {/* Eyebrow badge - dark slate style (like Most Popular) */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
              style={{ backgroundColor: '#0f172a' }}
            >
              <BarChart3 className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Product Tour</span>
            </div>
          </motion.div>
          <ProductScreenshots />
        </div>
      </section>

      {/* How It Works Section - MINT gradient */}
      <section className="relative py-12 lg:py-16 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.12), transparent 70%)'
          }}
        />
        <div className="container relative z-10 px-4 mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            {/* Eyebrow badge - dark slate style (like Most Popular) */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
              style={{ backgroundColor: '#0f172a' }}
            >
              <Zap className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Quick Setup</span>
            </div>
          </motion.div>
          <HowItWorks />
        </div>
      </section>

      <FeaturesGrid />

      {/* Feature Tabs Section - MINT gradient (alternating: FeaturesGrid=CORAL, FeatureTabs=MINT) */}
      <section className="relative py-12 lg:py-16 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.10), transparent 70%)'
          }}
        />
        <div className="container relative z-10 px-4 mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            {/* Eyebrow badge - dark slate style (like Most Popular) */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
              style={{ backgroundColor: '#0f172a' }}
            >
              <Shield className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Deep Analytics</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              Go deeper than the bill
            </h2>
          </motion.div>
          <FeatureTabs />
        </div>
      </section>

      <PricingSection />

      {/* Testimonials Section - MINT gradient */}
      <section className="relative py-12 lg:py-16 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.10), transparent 70%)'
          }}
        />
        <div className="container relative z-10 px-4 mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            {/* Eyebrow badge - dark slate style (like Most Popular) */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
              style={{ backgroundColor: '#0f172a' }}
            >
              <Users className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Testimonials</span>
            </div>
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
