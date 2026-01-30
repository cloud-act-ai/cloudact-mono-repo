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
// GLOWING SECTION WRAPPER - Luminous Effect
// ============================================
function GlowingSection({ children, className = "", glowColor = "mint", intensity = "medium" }: {
  children: React.ReactNode
  className?: string
  glowColor?: "mint" | "coral" | "blue" | "neutral"
  intensity?: "subtle" | "medium" | "strong"
}) {
  const glowMap = {
    mint: "from-[#90FCA6]/5 via-white to-[#90FCA6]/3",
    coral: "from-[#FF6C5E]/5 via-white to-[#FF6C5E]/3",
    blue: "from-blue-400/5 via-white to-blue-400/3",
    neutral: "from-slate-100 via-white to-slate-50",
  }

  const intensityMap = {
    subtle: "opacity-40",
    medium: "opacity-60",
    strong: "opacity-80",
  }

  return (
    <section className={`relative overflow-hidden ${className}`}>
      {/* Luminous background glow */}
      <div className={`absolute inset-0 bg-gradient-to-b ${glowMap[glowColor]} ${intensityMap[intensity]}`} />
      {/* Central glow orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-white/80 rounded-[100%] blur-[100px]" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </section>
  )
}

// ============================================
// HERO SECTION - Premium with Luminous Effects
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Pure white luminous background */}
      <div className="absolute inset-0 bg-white" />

      {/* Subtle scientific grid - data visualization feel */}
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(to right, rgba(148, 163, 184, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px'
      }} />

      {/* Luminous center glow - scientific aesthetic */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px]">
        <div className="absolute inset-0 bg-gradient-radial from-white via-[#90FCA6]/8 to-transparent rounded-[100%] blur-[80px]" />
      </div>

      {/* Subtle mint glow */}
      <div className="absolute top-20 left-[10%] w-[300px] h-[300px] bg-[#90FCA6]/10 rounded-full blur-[80px]" />

      <div className="container relative z-10 px-4 mx-auto max-w-7xl py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* LEFT - Content */}
          <div className="space-y-6">
            {/* Powered by Google Badge - elevated */}
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

            {/* Headline - bolder, more contrast */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-slate-900 leading-[1.08] tracking-tight">
                Unified Cost Intelligence for
                <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-[#34d399] to-teal-500 drop-shadow-sm">
                  Cloud, GenAI & SaaS
                </span>
              </h1>
            </motion.div>

            {/* Value prop - cleaner */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-slate-600 leading-relaxed max-w-xl"
            >
              Track every dollar across AWS, GCP, Azure, OpenAI, Anthropic, and 50+ SaaS tools.
              Real-time anomaly detection. 100% cost allocation. Built for engineering teams.
            </motion.p>

            {/* CTA Row - mint & black buttons */}
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
                className="group inline-flex items-center h-12 px-7 text-sm font-semibold text-white bg-slate-900 rounded-full hover:bg-slate-800 transition-all"
              >
                <Play className="w-4 h-4 mr-2 fill-white" />
                Watch Demo
              </Link>
            </motion.div>

            {/* Trust row - elevated */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap items-center gap-5 pt-3"
            >
              {["No credit card", "5-min setup", "SOC 2 ready"].map((item, i) => (
                <span key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#90FCA6]/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </span>
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

            {/* Floating stat - glass effect */}
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

            {/* Live indicator - elevated */}
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
// LOGO CLOUD - Clean
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
// THREE PILLARS - Clean Cards
// ============================================
function PlatformPillars() {
  const pillars = [
    {
      title: "Cloud Infrastructure",
      providers: "AWS • GCP • Azure • OCI",
      description: "Multi-cloud visibility with automatic tagging and FOCUS 1.3 compliance.",
      stat: "100%",
      statLabel: "allocation",
      features: ["Real-time cost tracking", "Anomaly detection", "Reserved instance optimization"]
    },
    {
      title: "GenAI & LLM",
      providers: "OpenAI • Anthropic • Gemini • Bedrock",
      description: "Track every token and request across all your AI providers.",
      stat: "<5min",
      statLabel: "detection",
      features: ["Per-token cost attribution", "Model comparison", "Usage forecasting"]
    },
    {
      title: "SaaS Subscriptions",
      providers: "Slack • Canva • Notion • 50+ apps",
      description: "Discover shadow IT and eliminate unused licenses.",
      stat: "35%",
      statLabel: "avg savings",
      features: ["License utilization", "Renewal tracking", "Vendor consolidation"]
    },
  ]

  return (
    <GlowingSection className="py-16" glowColor="mint" intensity="subtle">
      <div className="container px-4 mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-xs font-semibold text-[#90FCA6] uppercase tracking-wider">Three Pillars</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mt-2">
              All your spend. One platform.
            </h2>
          </motion.div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative p-6 rounded-2xl bg-white border border-slate-200 hover:border-[#90FCA6]/50 hover:shadow-xl transition-all h-full"
            >
              {/* Stat badge */}
              <div className="absolute top-4 right-4 text-right">
                <span className="text-2xl font-bold text-[#90FCA6]">{pillar.stat}</span>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{pillar.statLabel}</span>
              </div>

              {/* Title */}
              <div className="mb-4 pr-20">
                <h3 className="text-lg font-bold text-slate-900">{pillar.title}</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">{pillar.providers}</p>
              </div>

              <p className="text-sm text-slate-600 mb-5">{pillar.description}</p>

              {/* Features list */}
              <ul className="space-y-2.5">
                {pillar.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-[#90FCA6] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Link */}
              <Link href="/features" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 group-hover:text-[#90FCA6] transition-colors">
                Learn more <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </GlowingSection>
  )
}

// ============================================
// KEY CAPABILITIES - Clean Horizontal List
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
              <CheckCircle2 className="w-5 h-5 text-[#90FCA6] flex-shrink-0 mt-0.5" />
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
// PRICING SECTION - Luminous Premium Cards
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
      cta: "Get Started",
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
      cta: "Get Started",
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
      cta: "Get Started",
      highlighted: false,
    },
  ]

  return (
    <GlowingSection className="py-16" glowColor="mint" intensity="subtle">
      <div className="container px-4 mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-xs font-semibold text-[#90FCA6] uppercase tracking-wider">Pricing</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mt-2">Simple, transparent pricing</h2>
            <p className="text-slate-500 mt-3 text-lg">14-day free trial. No credit card required.</p>
          </motion.div>
        </div>

        {/* Luminous Cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative"
            >
              {/* Glow effect for highlighted */}
              {plan.highlighted && (
                <div className="absolute -inset-1 bg-gradient-to-b from-[#90FCA6]/30 to-[#90FCA6]/10 rounded-3xl blur-xl" />
              )}

              <div className={`relative p-6 rounded-2xl transition-all duration-300 h-full flex flex-col ${
                plan.highlighted
                  ? "bg-white border-2 border-[#90FCA6] shadow-xl"
                  : "bg-white/90 backdrop-blur-sm border border-slate-200 hover:border-slate-300 hover:shadow-lg"
              }`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-[#90FCA6] text-slate-900 text-xs font-bold rounded-full shadow-lg shadow-[#90FCA6]/30">
                    Most Popular
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                  <span className="text-base text-slate-500">{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-slate-600">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${plan.highlighted ? "bg-[#90FCA6]/20" : "bg-slate-100"}`}>
                        <CheckCircle2 className={`w-3.5 h-3.5 ${plan.highlighted ? "text-[#90FCA6]" : "text-slate-400"}`} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={`w-full inline-flex items-center justify-center h-11 rounded-full text-sm font-semibold transition-all ${
                    plan.highlighted
                      ? "bg-[#90FCA6] text-slate-900 hover:bg-[#7ee994] shadow-lg shadow-[#90FCA6]/25"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Enterprise note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <p className="text-sm text-slate-500">
            Need more? <Link href="/contact" className="text-slate-900 font-semibold hover:underline">Contact us for Enterprise pricing</Link>
          </p>
        </motion.div>
      </div>
    </GlowingSection>
  )
}

// ============================================
// FINAL CTA - Clean with Mint & Black
// ============================================
function FinalCTA() {
  return (
    <section className="py-20 bg-slate-900 text-white relative overflow-hidden">
      {/* Subtle mint glow */}
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
                className="inline-flex items-center justify-center h-12 px-8 text-sm font-semibold text-white border-2 border-white/30 rounded-full hover:bg-white/10 transition-all"
              >
                Schedule Demo
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
              {["No credit card", "5-min setup", "Cancel anytime"].map((item, i) => (
                <span key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#90FCA6]" />
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
// MAIN PAGE - Premium Luminous Layout
// ============================================
export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white font-sans antialiased">
      <main className="flex-grow">
        {/* Hero - Main value prop */}
        <HeroSection />

        {/* Integrations - Social proof */}
        <LogoCloud />

        {/* Three Pillars - Luminous premium cards */}
        <PlatformPillars />

        {/* Key Capabilities - Highlight bar */}
        <KeyCapabilities />

        {/* Product Screenshots - With glow wrapper */}
        <GlowingSection className="py-16" glowColor="neutral" intensity="subtle">
          <ProductScreenshots />
        </GlowingSection>

        {/* How It Works */}
        <GlowingSection className="py-16" glowColor="mint" intensity="subtle">
          <HowItWorks />
        </GlowingSection>

        {/* Features Deep Dive */}
        <GlowingSection className="py-16" glowColor="neutral" intensity="subtle">
          <div className="container px-4 mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <span className="text-xs font-semibold text-[#90FCA6] uppercase tracking-wider">Features</span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mt-2">
                Go deeper than the bill
              </h2>
            </motion.div>
            <FeatureTabs />
          </div>
        </GlowingSection>

        {/* Integrations Wall */}
        <IntegrationsWall />

        {/* Pricing - Luminous premium cards */}
        <PricingSection />

        {/* Testimonials - Luminous */}
        <GlowingSection className="py-16" glowColor="mint" intensity="subtle">
          <div className="container px-4 mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-6 h-0.5 bg-[#90FCA6] rounded-full" />
                <span className="text-xs font-semibold text-[#90FCA6] uppercase tracking-wider">Testimonials</span>
                <div className="w-6 h-0.5 bg-[#90FCA6] rounded-full" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                Trusted by engineering teams
              </h2>
            </motion.div>
            <Testimonials />
          </div>
        </GlowingSection>

        {/* Final CTA - Premium with glow */}
        <FinalCTA />
      </main>
    </div>
  )
}
