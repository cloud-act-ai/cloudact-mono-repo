"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Brain,
  CreditCard,
  TrendingDown,
  Zap,
  BarChart3,
  Shield,
  Layers,
  Play,
  Users,
  Building2,
  Sparkles,
  ArrowUpRight,
} from "lucide-react"

import "./premium.css"

import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { ScrollReveal } from "@/components/landing/scroll-reveal"
import { HowItWorks } from "@/components/landing/how-it-works"
import { ProductScreenshots } from "@/components/landing/product-screenshots"
import { FeatureTabs } from "@/components/landing/feature-tabs"
import { IntegrationsWall } from "@/components/landing/integrations-wall"
import { Testimonials } from "@/components/landing/testimonials"

// ============================================
// HERO SECTION - Premium Editorial Style
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-white">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(144,252,166,0.15),transparent)]" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_60%_60%_at_100%_100%,rgba(255,108,94,0.08),transparent)]" />
      </div>

      {/* Geometric accent shapes */}
      <div className="absolute top-20 left-10 w-72 h-72 border border-[#90FCA6]/20 rounded-full" />
      <div className="absolute bottom-20 right-10 w-96 h-96 border border-slate-200/50 rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-4 h-4 bg-[#90FCA6] rounded-full animate-pulse" />
      <div className="absolute bottom-1/3 left-1/4 w-3 h-3 bg-[#FF6C5E] rounded-full animate-pulse delay-500" />

      <div className="container relative z-10 px-4 mx-auto max-w-7xl py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* LEFT - Content */}
          <div className="space-y-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex"
            >
              <div className="flex items-center gap-3 px-4 py-2 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#90FCA6] rounded-full animate-pulse" />
                  <span className="text-xs font-semibold text-slate-600">Powered by</span>
                </div>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-xs font-medium text-slate-500">Google Cloud</span>
              </div>
            </motion.div>

            {/* Headline - Editorial style */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-slate-900 leading-[0.95] tracking-tight">
                Stop
                <br />
                <span className="relative inline-block">
                  overpaying
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-[#90FCA6]" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                  </svg>
                </span>
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-slate-400">
                  for cloud.
                </span>
              </h1>
            </motion.div>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-xl text-slate-600 leading-relaxed max-w-lg"
            >
              The unified FinOps platform for{" "}
              <span className="font-semibold text-slate-900">Cloud</span>,{" "}
              <span className="font-semibold text-slate-900">GenAI</span>, and{" "}
              <span className="font-semibold text-slate-900">SaaS</span>.
              Real-time visibility. 100% allocation.
            </motion.p>

            {/* CTA Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Link
                href="/signup"
                className="group inline-flex items-center h-14 px-8 text-base font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-xl shadow-[#90FCA6]/30"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="group inline-flex items-center h-14 px-8 text-base font-semibold text-[#FF6C5E] bg-white border-2 border-[#FF6C5E]/30 rounded-full hover:border-[#FF6C5E] hover:bg-[#FF6C5E]/5 transition-all"
              >
                <Play className="w-5 h-5 mr-2 fill-[#FF6C5E]" />
                Watch Demo
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-8 pt-4"
            >
              {["No credit card", "5-min setup", "Cancel anytime"].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-[#90FCA6]" />
                  {item}
                </div>
              ))}
            </motion.div>
          </div>

          {/* RIGHT - Dashboard */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: -10 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Glow */}
            <div className="absolute -inset-8 bg-gradient-to-r from-[#90FCA6]/20 via-transparent to-[#FF6C5E]/10 rounded-3xl blur-3xl" />

            {/* Dashboard */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-2xl shadow-slate-300/40">
              <HeroDashboard />
            </div>

            {/* Floating stat card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute -bottom-6 -left-6 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-xl"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#90FCA6] to-emerald-400 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">-$12,450</div>
                  <div className="text-sm text-slate-500">saved this month</div>
                </div>
              </div>
            </motion.div>

            {/* Live badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, duration: 0.3 }}
              className="absolute -top-4 -right-4 bg-white border border-slate-200 rounded-full px-4 py-2 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#90FCA6] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#90FCA6]" />
                </span>
                <span className="text-sm font-semibold text-slate-700">Live Data</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// LOGO CLOUD - Minimal
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
    <section className="py-16 bg-slate-50/50 border-y border-slate-100">
      <div className="container px-4 mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Trusted integrations</span>
          {providers.map((p, i) => (
            <Image
              key={i}
              src={p.src}
              alt={p.name}
              width={100}
              height={28}
              className="h-7 w-auto grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// STATEMENT SECTION - Full-width editorial
// ============================================
function StatementSection() {
  return (
    <section className="py-32 bg-white relative overflow-hidden">
      {/* Large decorative number */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20rem] font-black text-slate-50 select-none pointer-events-none">
        01
      </div>

      <div className="container px-4 mx-auto max-w-5xl relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#90FCA6]/10 border border-[#90FCA6]/30 rounded-full text-sm font-semibold text-emerald-700 mb-8">
              <Sparkles className="w-4 h-4" />
              Built for the modern cloud
            </span>

            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1] mb-8">
              Enterprise-grade cost intelligence<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#90FCA6] to-emerald-500">
                with real-time analytics
              </span>
            </h2>

            <p className="text-xl md:text-2xl text-slate-500 leading-relaxed max-w-3xl mx-auto">
              Intelligent anomaly detection. Beautiful visualizations.
              One platform for all your cloud, AI, and SaaS costs.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// THREE PILLARS - Bento Grid Style
// ============================================
function PlatformPillars() {
  const pillars = [
    {
      icon: Cloud,
      title: "Cloud Costs",
      subtitle: "AWS • GCP • Azure • OCI",
      description: "Unified multi-cloud visibility with automatic tagging and 100% cost allocation.",
      color: "mint",
      stats: { value: "100%", label: "Allocation" }
    },
    {
      icon: Brain,
      title: "GenAI Costs",
      subtitle: "OpenAI • Anthropic • Gemini",
      description: "Track every token. Understand cost per request. Optimize model usage.",
      color: "coral",
      stats: { value: "<5min", label: "Detection" }
    },
    {
      icon: CreditCard,
      title: "SaaS Costs",
      subtitle: "50+ SaaS Apps",
      description: "Discover shadow IT. Track unused licenses. Manage renewals automatically.",
      color: "mint",
      stats: { value: "35%", label: "Savings" }
    },
  ]

  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      <div className="container px-4 mx-auto max-w-7xl relative z-10">
        {/* Header - CENTERED */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block text-sm font-bold text-[#FF6C5E] uppercase tracking-widest mb-4">
              One Platform
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
              All your costs. One view.
            </h2>
          </motion.div>
        </div>

        {/* Bento Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group"
            >
              <div className={`relative h-full p-8 bg-white rounded-3xl border-2 transition-all duration-500 hover:shadow-2xl ${
                pillar.color === "mint"
                  ? "border-[#90FCA6]/30 hover:border-[#90FCA6]"
                  : "border-[#FF6C5E]/30 hover:border-[#FF6C5E]"
              }`}>
                {/* Stat badge */}
                <div className={`absolute top-6 right-6 px-3 py-1 rounded-full text-xs font-bold ${
                  pillar.color === "mint"
                    ? "bg-[#90FCA6]/20 text-emerald-700"
                    : "bg-[#FF6C5E]/15 text-[#FF6C5E]"
                }`}>
                  {pillar.stats.value} {pillar.stats.label}
                </div>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 ${
                  pillar.color === "mint"
                    ? "bg-gradient-to-br from-[#90FCA6]/20 to-[#90FCA6]/5 text-emerald-600"
                    : "bg-gradient-to-br from-[#FF6C5E]/20 to-[#FF6C5E]/5 text-[#FF6C5E]"
                }`}>
                  <pillar.icon className="w-8 h-8" />
                </div>

                <h3 className="text-2xl font-bold text-slate-900 mb-2">{pillar.title}</h3>
                <p className="text-sm text-slate-400 font-medium mb-4">{pillar.subtitle}</p>
                <p className="text-slate-600 leading-relaxed">{pillar.description}</p>

                {/* Hover arrow */}
                <div className="mt-6 flex items-center gap-2 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className={pillar.color === "mint" ? "text-emerald-600" : "text-[#FF6C5E]"}>Learn more</span>
                  <ArrowUpRight className={`w-4 h-4 ${pillar.color === "mint" ? "text-emerald-600" : "text-[#FF6C5E]"}`} />
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
// WHY CLOUDACT - Asymmetric Layout
// ============================================
function WhyCloudAct() {
  const features = [
    {
      icon: Zap,
      title: "AI Anomaly Detection",
      description: "Catch cost spikes in under 5 minutes. Slack, PagerDuty, or email alerts.",
      color: "coral"
    },
    {
      icon: BarChart3,
      title: "100% Cost Allocation",
      description: "No more untagged resources. Automatic allocation to teams and products.",
      color: "mint"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SSO, RBAC, audit logs, and SOC 2 compliance from day one.",
      color: "coral"
    },
    {
      icon: Layers,
      title: "Unit Economics",
      description: "True cost per customer, per transaction. Data-driven pricing.",
      color: "mint"
    },
  ]

  return (
    <section className="py-24 bg-white relative">
      <div className="container px-4 mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block text-sm font-bold text-emerald-600 uppercase tracking-widest mb-4">
              Why CloudAct
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Built different.
            </h2>
            <p className="text-xl text-slate-500 leading-relaxed">
              Not another dashboard. A complete FinOps platform designed for engineering teams who demand precision and speed.
            </p>
          </motion.div>

          {/* Right - Feature grid */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl border-2 bg-white hover:shadow-xl transition-all ${
                  f.color === "mint" ? "border-[#90FCA6]/20 hover:border-[#90FCA6]/50" : "border-[#FF6C5E]/20 hover:border-[#FF6C5E]/50"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  f.color === "mint" ? "bg-[#90FCA6]/15 text-emerald-600" : "bg-[#FF6C5E]/15 text-[#FF6C5E]"
                }`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// CUSTOMER SEGMENTS - Cards
// ============================================
function CustomerSegments() {
  const segments = [
    {
      icon: Users,
      title: "Individuals",
      price: "Free",
      description: "Track personal cloud projects and side hustles.",
      features: ["1 cloud account", "Basic dashboards", "Email alerts"],
      cta: "Get Started",
      popular: false,
      color: "slate"
    },
    {
      icon: Sparkles,
      title: "Startups",
      price: "$69/mo",
      description: "For fast-moving teams shipping AI products.",
      features: ["10 accounts", "GenAI tracking", "Slack alerts", "Team access"],
      cta: "Start Free Trial",
      popular: true,
      color: "mint"
    },
    {
      icon: Building2,
      title: "Enterprise",
      price: "Custom",
      description: "Full FinOps platform for complex environments.",
      features: ["Unlimited", "SSO & RBAC", "Custom SLAs", "Dedicated CSM"],
      cta: "Contact Sales",
      popular: false,
      color: "slate"
    },
  ]

  return (
    <section className="py-24 bg-slate-50">
      <div className="container px-4 mx-auto max-w-6xl">
        {/* Header - CENTERED */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block text-sm font-bold text-[#FF6C5E] uppercase tracking-widest mb-4">
              Pricing
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
              From side projects to enterprise
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
              CloudAct scales with your needs. Start free, upgrade when ready.
            </p>
          </motion.div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {segments.map((seg, i) => (
            <motion.div
              key={seg.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative p-8 rounded-3xl border-2 transition-all hover:shadow-xl ${
                seg.popular
                  ? "bg-white border-[#90FCA6] shadow-lg"
                  : "bg-white border-slate-200"
              }`}
            >
              {seg.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-[#90FCA6] to-emerald-400 text-white text-xs font-bold rounded-full shadow-lg">
                  Most Popular
                </div>
              )}

              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                seg.popular ? "bg-[#90FCA6]/20 text-emerald-600" : "bg-slate-100 text-slate-600"
              }`}>
                <seg.icon className="w-7 h-7" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-2">{seg.title}</h3>
              <div className="text-3xl font-bold text-slate-900 mb-4">{seg.price}</div>
              <p className="text-slate-500 mb-6">{seg.description}</p>

              <ul className="space-y-3 mb-8">
                {seg.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-600">
                    <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${seg.popular ? "text-[#90FCA6]" : "text-slate-300"}`} />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={seg.title === "Enterprise" ? "/contact" : "/signup"}
                className={`w-full inline-flex items-center justify-center h-12 rounded-full text-sm font-semibold transition-all ${
                  seg.popular
                    ? "bg-[#90FCA6] text-slate-900 hover:bg-[#7ee994] shadow-lg shadow-[#90FCA6]/30"
                    : "bg-white text-[#FF6C5E] border-2 border-[#FF6C5E]/30 hover:border-[#FF6C5E] hover:bg-[#FF6C5E]/5"
                }`}
              >
                {seg.cta}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// FINAL CTA
// ============================================
function FinalCTA() {
  return (
    <section className="py-32 bg-white relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-[#90FCA6]/10 via-transparent to-[#FF6C5E]/10 rounded-full blur-[100px]" />
      </div>

      <div className="container px-4 mx-auto max-w-4xl relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight mb-6">
              Ready to cut your
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#90FCA6] to-emerald-500">
                cloud costs?
              </span>
            </h2>

            <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10">
              Join 500+ engineering teams saving 35% on average. Start your free trial today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center h-14 px-10 text-base font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-xl shadow-[#90FCA6]/30"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center h-14 px-10 text-base font-semibold text-[#FF6C5E] bg-white border-2 border-[#FF6C5E]/30 rounded-full hover:border-[#FF6C5E] hover:bg-[#FF6C5E]/5 transition-all"
              >
                Schedule Demo
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-500">
              {["No credit card required", "5-minute setup", "Cancel anytime"].map((item, i) => (
                <span key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#90FCA6]" />
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
    <div className="flex flex-col min-h-screen bg-white font-sans">
      <main className="flex-grow">
        <HeroSection />
        <LogoCloud />
        <StatementSection />
        <PlatformPillars />
        <WhyCloudAct />
        <CustomerSegments />
        <ProductScreenshots />
        <HowItWorks />

        {/* Features Deep Dive */}
        <section className="py-24 bg-slate-50">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <span className="inline-block text-sm font-bold text-[#FF6C5E] uppercase tracking-widest mb-4">
                Deep Dive
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
                Go deeper than the bill
              </h2>
              <p className="text-xl text-slate-500">
                Granular visibility into the resources that matter most.
              </p>
            </div>
            <FeatureTabs />
          </div>
        </section>

        <IntegrationsWall />

        {/* Testimonials */}
        <section className="py-24 bg-white">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <span className="inline-block text-sm font-bold text-emerald-600 uppercase tracking-widest mb-4">
                Customer Stories
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
                Loved by engineering leaders
              </h2>
            </div>
            <Testimonials />
          </div>
        </section>

        <FinalCTA />
      </main>
    </div>
  )
}
