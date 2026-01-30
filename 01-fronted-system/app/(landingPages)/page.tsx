"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  ArrowRight,
  CheckCircle2,
  TrendingDown,
  Play,
} from "lucide-react"

import "./premium.css"

import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { HowItWorks } from "@/components/landing/how-it-works"
import { ProductScreenshots } from "@/components/landing/product-screenshots"
import { FeatureTabs } from "@/components/landing/feature-tabs"
import { IntegrationsWall } from "@/components/landing/integrations-wall"
import { Testimonials } from "@/components/landing/testimonials"

// ============================================
// HERO SECTION - Investor-Focused Premium
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)`,
        backgroundSize: '24px 24px'
      }} />

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#90FCA6]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#FF6C5E]/8 rounded-full blur-[100px]" />

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
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-xs font-medium text-slate-600">Powered by Google Cloud & Data AI</span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.05] tracking-tight">
                Unified Cost Intelligence for
                <span className="block mt-1 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-[#90FCA6] to-teal-500">
                  Cloud, GenAI & SaaS
                </span>
              </h1>
            </motion.div>

            {/* Value prop */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-slate-600 leading-relaxed max-w-xl"
            >
              Track every dollar across AWS, GCP, Azure, OpenAI, Anthropic, and 50+ SaaS tools.
              Real-time anomaly detection. 100% cost allocation. Built for engineering teams.
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
                className="group inline-flex items-center h-12 px-6 text-sm font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-lg shadow-[#90FCA6]/25"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="group inline-flex items-center h-12 px-6 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-full hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <Play className="w-4 h-4 mr-2 fill-slate-500" />
                Watch Demo
              </Link>
            </motion.div>

            {/* Trust row - compact */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              {["No credit card", "5-min setup", "SOC 2 ready"].map((item, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>

          {/* RIGHT - Dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10">
              <HeroDashboard />
            </div>

            {/* Floating stat */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.4 }}
              className="absolute -bottom-4 -left-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-lg"
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
              transition={{ delay: 0.8, duration: 0.3 }}
              className="absolute -top-3 -right-3 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-md"
            >
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-slate-600">Live</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// MARKET OPPORTUNITY - Investor-Focused
// ============================================
function MarketOpportunity() {
  const stats = [
    { value: "$200B+", label: "Cloud spend by 2025", sublabel: "Growing 20% YoY" },
    { value: "$50B+", label: "GenAI market by 2027", sublabel: "Fastest growing segment" },
    { value: "35%", label: "Average waste", sublabel: "In cloud infrastructure" },
  ]

  return (
    <section className="py-16 bg-slate-900 text-white relative overflow-hidden">
      {/* Subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900" />

      <div className="container px-4 mx-auto max-w-6xl relative z-10">
        <div className="grid md:grid-cols-4 gap-8 items-center">
          {/* Label */}
          <div className="md:col-span-1">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Market Opportunity</span>
            <p className="text-sm text-slate-400 mt-1">The problem we solve</p>
          </div>

          {/* Stats */}
          <div className="md:col-span-3 grid grid-cols-3 gap-6">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center md:text-left"
              >
                <div className="text-3xl md:text-4xl font-bold text-white">{stat.value}</div>
                <div className="text-sm font-medium text-slate-300 mt-1">{stat.label}</div>
                <div className="text-xs text-slate-500">{stat.sublabel}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// LOGO CLOUD - Compact
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
    <section className="py-10 bg-white border-b border-slate-100">
      <div className="container px-4 mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Integrations</span>
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
// THREE PILLARS - Compact Cards
// ============================================
function PlatformPillars() {
  const pillars = [
    {
      title: "Cloud Infrastructure",
      providers: "AWS • GCP • Azure • OCI",
      description: "Multi-cloud visibility with automatic tagging and FOCUS 1.3 compliance.",
      stat: "100%",
      statLabel: "allocation",
      color: "emerald",
      features: ["Real-time cost tracking", "Anomaly detection", "Reserved instance optimization"]
    },
    {
      title: "GenAI & LLM",
      providers: "OpenAI • Anthropic • Gemini • Bedrock",
      description: "Track every token and request across all your AI providers.",
      stat: "<5min",
      statLabel: "detection",
      color: "coral",
      features: ["Per-token cost attribution", "Model comparison", "Usage forecasting"]
    },
    {
      title: "SaaS Subscriptions",
      providers: "Slack • Canva • Notion • 50+ apps",
      description: "Discover shadow IT and eliminate unused licenses.",
      stat: "35%",
      statLabel: "avg savings",
      color: "blue",
      features: ["License utilization", "Renewal tracking", "Vendor consolidation"]
    },
  ]

  const colorMap = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-600", stat: "text-emerald-700" },
    coral: { bg: "bg-orange-50", border: "border-orange-200 hover:border-orange-400", text: "text-[#FF6C5E]", stat: "text-[#FF6C5E]" },
    blue: { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-600", stat: "text-blue-700" },
  }

  return (
    <section className="py-16 bg-white">
      <div className="container px-4 mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-xs font-semibold text-[#FF6C5E] uppercase tracking-wider">Three Pillars</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mt-2">
              All your spend. One platform.
            </h2>
          </motion.div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {pillars.map((pillar, i) => {
            const colors = colorMap[pillar.color as keyof typeof colorMap]
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative p-6 rounded-2xl border ${colors.border} bg-white transition-all hover:shadow-lg group`}
              >
                {/* Stat badge */}
                <div className="absolute top-4 right-4">
                  <span className={`text-2xl font-bold ${colors.stat}`}>{pillar.stat}</span>
                  <span className="text-xs text-slate-400 ml-1">{pillar.statLabel}</span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-1 pr-20">{pillar.title}</h3>
                <p className="text-xs text-slate-400 font-medium mb-3">{pillar.providers}</p>
                <p className="text-sm text-slate-600 mb-4">{pillar.description}</p>

                {/* Features list */}
                <ul className="space-y-2">
                  {pillar.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-slate-500">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${colors.text}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Link */}
                <Link href="/features" className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  Learn more <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================
// KEY CAPABILITIES - Horizontal List
// ============================================
function KeyCapabilities() {
  const capabilities = [
    { title: "AI Anomaly Detection", desc: "Catch spikes in <5 min", color: "emerald" },
    { title: "100% Cost Allocation", desc: "Auto-tag all resources", color: "emerald" },
    { title: "Enterprise Security", desc: "SSO, RBAC, SOC 2", color: "slate" },
    { title: "Unit Economics", desc: "Cost per customer", color: "slate" },
  ]

  return (
    <section className="py-12 bg-slate-50 border-y border-slate-100">
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
              <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${cap.color === "emerald" ? "text-emerald-500" : "text-slate-400"}`} />
              <div>
                <div className="text-sm font-semibold text-slate-900">{cap.title}</div>
                <div className="text-xs text-slate-500">{cap.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// PRICING SECTION - Actual Plans
// ============================================
function PricingSection() {
  const plans = [
    {
      name: "Starter",
      price: "$19",
      period: "/mo",
      description: "For small teams getting started",
      features: [
        "2 team members",
        "3 provider integrations",
        "6 daily pipeline runs",
        "30-day data retention",
        "Email alerts",
      ],
      cta: "Start Free Trial",
      highlighted: false,
    },
    {
      name: "Professional",
      price: "$69",
      period: "/mo",
      description: "For growing engineering teams",
      features: [
        "6 team members",
        "6 provider integrations",
        "25 daily pipeline runs",
        "90-day data retention",
        "Slack & PagerDuty alerts",
        "Custom dashboards",
      ],
      cta: "Start Free Trial",
      highlighted: true,
    },
    {
      name: "Scale",
      price: "$199",
      period: "/mo",
      description: "For organizations at scale",
      features: [
        "11 team members",
        "10 provider integrations",
        "100 daily pipeline runs",
        "1-year data retention",
        "SSO & RBAC",
        "Priority support",
        "API access",
      ],
      cta: "Start Free Trial",
      highlighted: false,
    },
  ]

  return (
    <section className="py-16 bg-white">
      <div className="container px-4 mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Pricing</span>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mt-2">Simple, transparent pricing</h2>
          <p className="text-slate-500 mt-2">14-day free trial. No credit card required.</p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative p-6 rounded-2xl border transition-all ${
                plan.highlighted
                  ? "border-emerald-400 bg-emerald-50/30 shadow-lg"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                <span className="text-sm text-slate-500">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-emerald-500" : "text-slate-400"}`} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`w-full inline-flex items-center justify-center h-10 rounded-lg text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Enterprise note */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Need more? <Link href="/contact" className="text-emerald-600 font-semibold hover:underline">Contact us for Enterprise pricing</Link>
          </p>
        </div>
      </div>
    </section>
  )
}

// ============================================
// FINAL CTA - Compact, Investor-Focused
// ============================================
function FinalCTA() {
  return (
    <section className="py-16 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="container px-4 mx-auto max-w-4xl">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Start saving on cloud costs today
            </h2>

            <p className="text-lg text-slate-300 max-w-xl mx-auto mb-8">
              Join engineering teams saving 35% on average. 14-day free trial.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center h-12 px-8 text-sm font-semibold text-slate-900 bg-[#90FCA6] rounded-lg hover:bg-[#7ee994] transition-all"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center h-12 px-8 text-sm font-semibold text-white border border-slate-600 rounded-lg hover:bg-slate-700 transition-all"
              >
                Schedule Demo
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
              {["No credit card", "5-min setup", "Cancel anytime"].map((item, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
// MAIN PAGE - Investor-Focused Layout
// ============================================
export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white font-sans">
      <main className="flex-grow">
        {/* Hero - Main value prop */}
        <HeroSection />

        {/* Market Opportunity - Investor focus */}
        <MarketOpportunity />

        {/* Integrations - Social proof */}
        <LogoCloud />

        {/* Three Pillars - Core offering */}
        <PlatformPillars />

        {/* Key Capabilities - Quick wins */}
        <KeyCapabilities />

        {/* Product Screenshots */}
        <ProductScreenshots />

        {/* How It Works */}
        <HowItWorks />

        {/* Features Deep Dive - Compact */}
        <section className="py-14 bg-slate-50">
          <div className="container px-4 mx-auto max-w-6xl">
            <div className="text-center mb-10">
              <span className="text-xs font-semibold text-[#FF6C5E] uppercase tracking-wider">Features</span>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mt-2">
                Go deeper than the bill
              </h2>
            </div>
            <FeatureTabs />
          </div>
        </section>

        {/* Integrations Wall */}
        <IntegrationsWall />

        {/* Pricing - Actual plans */}
        <PricingSection />

        {/* Testimonials - Compact */}
        <section className="py-14 bg-slate-50">
          <div className="container px-4 mx-auto max-w-6xl">
            <div className="text-center mb-10">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Testimonials</span>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-2">
                Trusted by engineering teams
              </h2>
            </div>
            <Testimonials />
          </div>
        </section>

        {/* Final CTA */}
        <FinalCTA />
      </main>
    </div>
  )
}
