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
    <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-40 overflow-hidden bg-white">
      {/* Premium mesh gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle_at_center,_var(--cloudact-mint)_0%,_transparent_70%)] opacity-20 blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute top-[10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(circle_at_center,_var(--cloudact-blue)_0%,_transparent_70%)] opacity-10 blur-[80px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[60%] rounded-full bg-[radial-gradient(circle_at_center,_var(--cloudact-mint-light)_0%,_transparent_70%)] opacity-[0.15] blur-[120px]" />
      </div>

      <div className="container relative z-10 px-4 mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* LEFT - Content */}
          <div className="space-y-8 max-w-2xl">
            {/* Powered by Google Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex"
            >
              <div className="flex items-center gap-2.5 px-4 py-2 bg-white/50 backdrop-blur-md border border-slate-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-300 cursor-default hover:bg-white/80">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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
              <h1 className="text-5xl sm:text-6xl lg:text-[4rem] xl:text-[4.5rem] font-bold text-slate-900 leading-[1.05] tracking-tight">
                Built for <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#90FCA6] to-emerald-400">GenAI</span><br />
                & Modern Cloud
              </h1>
            </motion.div>

            {/* Value prop with secondary color accent */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-lg lg:text-xl text-slate-600 leading-relaxed max-w-lg"
            >
              <strong className="text-slate-900 font-semibold">Track every LLM token and cloud resource.</strong>{" "}
              Real-time GenAI cost analytics, intelligent anomaly detection, and unified cloud visibility.
            </motion.p>

            {/* CTA Row - Shining Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              {/* Primary Button - Mint */}
              <Link
                href="/signup"
                className="group relative inline-flex items-center h-12 px-8 rounded-full overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#90FCA6]/40 hover:-translate-y-1"
                style={{ backgroundColor: '#90FCA6' }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center text-base font-bold" style={{ color: '#0f172a' }}>
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>

              {/* Secondary Button - White with border */}
              <Link
                href="/demo"
                className="group relative inline-flex items-center h-12 px-8 rounded-full overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 bg-white border border-slate-200"
              >
                <span className="relative text-base font-semibold text-slate-700 group-hover:text-slate-900">Request Demo</span>
              </Link>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="flex flex-wrap items-center gap-6 pt-4 text-sm font-medium text-slate-500"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>5-minute setup</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>SOC 2 compliant</span>
              </div>
            </motion.div>
          </div>

          {/* RIGHT - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
            className="relative"
            style={{ perspective: '1000px' }}
          >
            {/* Ambient Glow */}
            <div className="absolute -inset-10 bg-gradient-to-tr from-[#90FCA6]/30 via-transparent to-[#007AFF]/20 rounded-full blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '6s' }} />

            {/* Dashboard card with glass effect container */}
            <div className="relative rounded-2xl p-2 bg-white/40 backdrop-blur-sm border border-white/60 shadow-2xl shadow-slate-900/10 transition-transform duration-700 ease-out" style={{ transform: 'rotateY(-5deg)', transformStyle: 'preserve-3d' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'rotateY(0deg)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'rotateY(-5deg)'}>
              <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-inner">
                <HeroDashboard />
              </div>

              {/* Floating stat badge 1 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute -bottom-6 -left-6 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-5 py-4 shadow-xl shadow-slate-900/5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#90FCA6] to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <TrendingDown className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-slate-900">-$12,450</div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Monthly Savings</div>
                  </div>
                </div>
              </motion.div>

              {/* Floating stat badge 2 - AI Token Tracking */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="absolute -top-6 -right-6 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-5 py-3 shadow-xl shadow-slate-900/5 hidden lg:block"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-blue-600">OAI</div>
                    <div className="w-8 h-8 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-purple-600">ANT</div>
                    <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-emerald-600">GEM</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">2.5M Tokens</div>
                    <div className="text-[10px] font-medium text-slate-500">Tracked Today</div>
                  </div>
                </div>
              </motion.div>

            </div>
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
      href: "/features#genai",
    },
    {
      title: "Cloud Infrastructure",
      providers: "AWS  •  GCP  •  Azure  •  OCI",
      description: "Unified multi-cloud cost visibility with automatic tagging, anomaly detection, and FOCUS 1.3 compliance.",
      features: ["Real-time cost tracking", "Reserved instance optimization", "Resource rightsizing"],
      href: "/features#cloud",
    },
    {
      title: "SaaS Subscriptions",
      providers: "Slack  •  Canva  •  GitHub Copilot  •  30+ apps",
      description: "Discover shadow IT, eliminate unused licenses, and optimize your SaaS portfolio.",
      features: ["License utilization tracking", "Renewal alerts", "Vendor consolidation"],
      href: "/features#saas",
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
              className="group relative bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300"
            >
              {/* Hover shine effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white via-[#90FCA6]/5 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="relative">
                <h3 className="text-lg font-bold text-slate-900 mb-1">{pillar.title}</h3>
                <p className="text-xs text-slate-400 font-medium mb-3">{pillar.providers}</p>
                <p className="text-slate-600 text-sm mb-5 leading-relaxed">{pillar.description}</p>
                <ul className="space-y-2">
                  {pillar.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <Link href={pillar.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
                    Learn more
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// KeyCapabilities removed - content duplicated FeaturesGrid

// ============================================
// FEATURES GRID - Bento Box Style
// ============================================
function FeaturesGrid() {
  const features = [
    {
      title: "AI-Powered Anomaly Detection",
      description: "Catch unexpected spikes before they become budget busters. Our AI learns your usage patterns and alerts you within 5 minutes of abnormalities.",
      icon: <Zap className="w-6 h-6 text-amber-500" />,
      className: "md:col-span-2",
      gradient: "from-amber-50 to-transparent"
    },
    {
      title: "100% Cost Allocation",
      description: "Automatic tagging and allocation. Know exactly which team drives costs.",
      icon: <Layers className="w-6 h-6 text-blue-500" />,
      className: "md:col-span-1",
      gradient: "from-blue-50 to-transparent"
    },
    {
      title: "Enterprise Security",
      description: "SOC 2 Type II, SSO, RBAC, and audit logs. Built for enterprises.",
      icon: <Shield className="w-6 h-6 text-emerald-500" />,
      className: "md:col-span-1",
      gradient: "from-emerald-50 to-transparent"
    },
    {
      title: "Optimization Recommendations",
      description: "Actionable advice to reduce waste. Reserved instances, rightsizing, and zombie resource detection.",
      icon: <Sparkles className="w-6 h-6 text-purple-500" />,
      className: "md:col-span-2",
      gradient: "from-purple-50 to-transparent"
    },
    {
      title: "Real-Time Dashboards",
      description: "See your spend as it happens. Live data sync.",
      icon: <BarChart3 className="w-6 h-6 text-indigo-500" />,
      className: "md:col-span-1",
      gradient: "from-indigo-50 to-transparent"
    },
    {
      title: "Unit Economics",
      description: "Calculate cost per customer, request, or token.",
      icon: <DollarSign className="w-6 h-6 text-pink-500" />,
      className: "md:col-span-1",
      gradient: "from-pink-50 to-transparent"
    },
    {
      title: "Team Collaboration",
      description: "Share dashboards, set budgets, and assign alerts to specific engineers or teams.",
      icon: <Users className="w-6 h-6 text-cyan-500" />,
      className: "md:col-span-1",
      gradient: "from-cyan-50 to-transparent"
    },
  ]

  return (
    <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
      {/* MINT radial gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-br from-[#90FCA6]/10 to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-[#90FCA6]/5 to-transparent rounded-full blur-3xl opacity-60" />
      </div>

      <div className="container relative z-10 mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          {/* Eyebrow badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-5 bg-white border border-slate-200"
          >
            <Sparkles className="w-4 h-4 text-slate-900" />
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Capabilities</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6 tracking-tight">
            Everything you need to<br className="hidden md:block" /> control cloud costs
          </h2>
          <p className="text-lg text-slate-600">
            <strong className="text-slate-900 font-semibold">Purpose-built</strong> for engineering and finance teams who need visibility, not just reports.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className={`relative group rounded-3xl p-8 bg-white border border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden ${feature.className}`}
            >
              {/* Hover styling */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />

              <div className="relative z-10">
                <div className="mb-6 inline-flex p-3 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 text-[15px] leading-relaxed">{feature.description}</p>
              </div>

              <div className="mt-8" />
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
        "Slack & webhook alerts",
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
      {/* MINT radial gradient (alternating with CORAL sections) */}
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
          {/* Eyebrow badge - dark slate style */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <DollarSign className="w-4 h-4" style={{ color: '#ffffff' }} />
            <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Pricing</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-slate-600">
            14-day free trial. No credit card required. <strong className="text-slate-900">Cancel anytime.</strong>
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
              <div className={`relative h-full flex flex-col p-6 rounded-2xl bg-white ${!plan.highlighted && "border border-slate-200"
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
                    <li key={feature} className="flex items-center gap-2.5 text-slate-600 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <Link
                  href="/signup"
                  className={`group relative w-full inline-flex items-center justify-center h-11 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${plan.highlighted ? "hover:shadow-lg hover:shadow-[#90FCA6]/30" : "hover:shadow-md"
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
    <section className="relative py-24 lg:py-32 bg-[#050505] text-white overflow-hidden">
      {/* Luminous glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#90FCA6]/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)] pointer-events-none" />

      <div className="container px-4 mx-auto max-w-4xl relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-8 text-white">
              Start saving on<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#90FCA6] to-emerald-400">cloud costs today</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Join engineering teams saving an average of <span className="text-white font-semibold">35% on cloud and AI costs</span> with real-time visibility and intelligent optimization.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              {/* Primary CTA - Mint Glow */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#90FCA6] to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-200" />
                <Link
                  href="/signup"
                  className="relative flex items-center justify-center h-14 px-8 rounded-full font-bold text-lg transition-transform duration-200 group-hover:-translate-y-0.5"
                  style={{ backgroundColor: '#90FCA6', color: '#050505' }}
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              {/* Secondary CTA - Dark */}
              <Link
                href="/demo"
                className="flex items-center justify-center h-14 px-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-lg backdrop-blur-sm border border-white/10 transition-all duration-200 hover:-translate-y-0.5"
              >
                Schedule Demo
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#90FCA6]" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#90FCA6]" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#90FCA6]" />
                <span>Cancel anytime</span>
              </div>
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

      {/* Product Screenshots - component is self-contained with its own section */}
      <ProductScreenshots />

      {/* How It Works - component is self-contained with its own header */}
      <HowItWorks />

      <FeaturesGrid />

      {/* Feature Tabs Section - CORAL gradient (alternating) */}
      <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 108, 94, 0.06), transparent 70%)'
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

      {/* Testimonials Section - CORAL gradient (alternating) */}
      <section className="relative py-16 lg:py-20 bg-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 108, 94, 0.06), transparent 70%)'
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
