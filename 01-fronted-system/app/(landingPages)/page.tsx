"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Shield,
  Cpu,
  Layers,
  LineChart,
  Bell,
  Sparkles,
  DollarSign,
  Users,
  CheckCircle2,
  Star,
  Quote,
  Cloud,
  CreditCard,
  PieChart,
  Target,
  Award,
  FileText,
  Plug,
  MessageSquare,
  X,
  Zap,
  Server,
} from "lucide-react"

import "./premium.css"
// import "@/components/landing/hero-architecture" 

import { HeroDashboard } from "@/components/landing/hero-dashboard"
import { ScrollReveal } from "@/components/landing/scroll-reveal"
import { BentoGrid, BentoGridItem } from "@/components/landing/bento-grid"
import { PremiumIcon } from "@/components/landing/premium-icon"
import { HowItWorks } from "@/components/landing/how-it-works"

// ============================================
// HOME PAGE ANNOUNCEMENT BANNER
// ============================================
function HomeAnnouncementBanner({
  isVisible,
  onClose
}: {
  isVisible: boolean
  onClose: () => void
}) {
  if (!isVisible) return null

  return (
    <div className="ca-home-announcement backdrop-blur-md bg-white/70 border-b border-white/20">
      <div className="ca-home-announcement-inner">
        <div className="ca-home-announcement-content">
          <span className="ca-home-announcement-badge bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">New</span>
          <span className="ca-home-announcement-text text-slate-800 font-medium tracking-tight">
            Introducing AI-Powered Cost Anomaly Detection — Catch overspend instantly
          </span>
          <Link href="/features#alerts" className="ca-home-announcement-link text-emerald-600 hover:text-emerald-700 font-semibold group">
            Learn more <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ca-home-announcement-close hover:bg-black/5 rounded-full p-1 transition-colors"
          aria-label="Close announcement"
        >
          <X className="w-4 h-4 text-slate-500" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// INDUSTRY BADGES
// ============================================
const INDUSTRY_BADGES = [
  { label: "500+", sublabel: "Engineering Teams", icon: Users },
  { label: "$100M+", sublabel: "Cloud Spend Managed", icon: DollarSign },
  { label: "50+", sublabel: "Enterprise Customers", icon: Shield },
  { label: "15+", sublabel: "Countries", icon: Cloud },
]

// ============================================
// HERO SECTION (Side-by-Side Refactor)
// ============================================
function HeroSection() {
  return (
    <section className="relative pt-32 lg:pt-48 pb-20 overflow-hidden bg-[#0B1221]">
       {/* Background Grid & Glows - Always visible on top of base bg */}
       <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
       
       <div className="container relative z-10 px-4 mx-auto max-w-7xl">
         <div className="grid lg:grid-cols-2 gap-12 items-center">
             
             {/* LEFT: Text Content */}
             <div className="text-left space-y-8 max-w-2xl">
                 <ScrollReveal>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-500/30 rounded-full shadow-sm transition hover:bg-emerald-900/40 cursor-pointer">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Live Demo Available</span>
                    </div>
                 </ScrollReveal>
                 
                 <ScrollReveal delay={0.1}>
                   <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
                     The <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Financial OS</span> for <br/> 
                     Cloud & GenAI Costs
                   </h1>
                 </ScrollReveal>
                 
                 <ScrollReveal delay={0.2}>
                   <p className="text-lg text-slate-400 leading-relaxed">
                     Stop guessing your cloud bill. CloudAct.ai gives you pixel-perfect cost allocation, 
                     real-time anomaly detection, and unit economics for every token and instance.
                   </p>
                 </ScrollReveal>
                 
                 <ScrollReveal delay={0.3} className="flex flex-col sm:flex-row gap-4 pt-4">
                   <Link href="/signup" className="flex items-center justify-center h-14 px-8 text-base font-bold text-emerald-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-all shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)]">
                     Start Free Trial
                     <ArrowRight className="w-5 h-5 ml-2" />
                   </Link>
                   <Link href="/demo" className="flex items-center justify-center h-14 px-8 text-base font-bold text-slate-900 bg-white border border-white rounded-lg hover:bg-slate-100 transition-all shadow-md">
                     Talk to Sales
                   </Link>
                 </ScrollReveal>

                 <ScrollReveal delay={0.4} className="pt-8 border-t border-slate-800/50">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-4">Trusted by 500+ Engineers</p>
                    <div className="flex gap-6 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                      <Image src="/logos/providers/gcp.svg" alt="GCP" width={32} height={32} className="h-8 w-auto invert" />
                      <Image src="/logos/providers/anthropic.svg" alt="Anthropic" width={32} height={32} className="h-8 w-auto invert" />
                      <Image src="/logos/providers/openai.svg" alt="OpenAI" width={32} height={32} className="h-8 w-auto invert" />
                    </div>
                 </ScrollReveal>
             </div>
             
             {/* RIGHT: High-Fidelity Dashboard */}
             <ScrollReveal delay={0.4} className="relative z-20 perspective-1000 lg:-mr-20">
                <HeroDashboard />
             </ScrollReveal>
         </div>
       </div>
    </section>
  )
}


// ============================================
// LOGO MARQUEE
// ============================================
function TrustedMarquee() {
  const logos = [
    "/logos/providers/aws.svg", "/logos/providers/gcp.svg", "/logos/providers/azure.svg",
    "/logos/providers/openai.svg", "/logos/providers/anthropic.svg", "/logos/providers/gemini.svg",
    "/logos/providers/slack.svg", "/logos/providers/github.svg", "/logos/providers/notion.svg"
  ]
  
  return (
    <div className="w-full bg-white border-b border-slate-100 py-12 overflow-hidden relative">
      <div className="container mx-auto px-4 mb-8 text-center">
         <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Trusted by 500+ Engineering Teams</p>
      </div>
      
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white z-10" />
      
      <div className="flex animate-marquee gap-16 items-center min-w-max">
        {[...logos, ...logos, ...logos].map((src, i) => (
          <div key={i} className="relative w-32 h-12 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
            <Image src={src} alt="Brand Logo" fill className="object-contain" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// THREE PILLAR FEATURES (Cloud, GenAI, SaaS)
// ============================================
function FeaturesBento() {
  return (
    <section className="py-24 bg-white relative overflow-hidden text-center">
      <div className="container px-4 mx-auto max-w-7xl relative z-10">
        <div className="max-w-3xl mx-auto mb-16 space-y-4">
           <span className="inline-block py-1 px-3 rounded-full bg-emerald-100/50 border border-emerald-500/20 text-emerald-700 font-bold tracking-wide uppercase text-xs">Full Stack Observability</span>
           <h2 className="text-4xl font-bold text-slate-900">Total Control. No Compromise.</h2>
           <p className="text-xl text-slate-600">CloudAct.ai unifies your three biggest spend categories into one financial OS.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Pillar 1: Cloud */}
          <div className="group relative p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 text-left">
             <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Cloud className="w-7 h-7 text-blue-600" />
             </div>
             <h3 className="text-2xl font-bold text-slate-900 mb-3">Cloud Costs</h3>
             <p className="text-slate-600 mb-6 leading-relaxed">
               Unified billing for <strong>GCP</strong>, AWS, and Azure. Detect anomalies in BigQuery or EC2 instantly.
             </p>
             <ul className="space-y-2">
                <li className="flex items-center text-sm text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" /> Multi-Cloud Allocation</li>
                <li className="flex items-center text-sm text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" /> K8s Right-Sizing</li>
             </ul>
          </div>

          {/* Pillar 2: GenAI */}
          <div className="group relative p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl hover:border-purple-500/50 transition-all duration-300 transform md:-translate-y-4 text-left">
             <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="w-14 h-14 bg-purple-900/50 rounded-xl flex items-center justify-center mb-6 relative z-10 group-hover:scale-110 transition-transform">
                <Sparkles className="w-7 h-7 text-purple-400" />
             </div>
             <h3 className="text-2xl font-bold text-white mb-3 relative z-10">GenAI Intelligence</h3>
             <p className="text-slate-400 mb-6 leading-relaxed relative z-10">
               Token-level cost tracking for <strong>Anthropic</strong>, OpenAI, and custom models. Know exactly which prompt costs what.
             </p>
             <ul className="space-y-2 relative z-10">
                <li className="flex items-center text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2" /> Model Unit Economics</li>
                <li className="flex items-center text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2" /> Token Usage Heatmaps</li>
             </ul>
          </div>

          {/* Pillar 3: SaaS */}
          <div className="group relative p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 text-left">
             <div className="w-14 h-14 bg-emerald-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <CreditCard className="w-7 h-7 text-emerald-600" />
             </div>
             <h3 className="text-2xl font-bold text-slate-900 mb-3">SaaS Governance</h3>
             <p className="text-slate-600 mb-6 leading-relaxed">
               Find unused seats in <strong>ChatGPT Team</strong>, GitHub Copilot, and Datadog. Stop paying for shelfware.
             </p>
             <ul className="space-y-2">
                <li className="flex items-center text-sm text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" /> Shadow IT Discovery</li>
                <li className="flex items-center text-sm text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" /> License Utilization</li>
             </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================
import { FeatureTabs } from "@/components/landing/feature-tabs"
import { IntegrationsWall } from "@/components/landing/integrations-wall"
import { Testimonials } from "@/components/landing/testimonials"
import { FaqSection } from "@/components/landing/faq-section"

export default function Home() {
  const [showBanner, setShowBanner] = useState(true)

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <HomeAnnouncementBanner isVisible={showBanner} onClose={() => setShowBanner(false)} />
      
      <main className="flex-grow">
        <HeroSection />
        <TrustedMarquee />
        
        <HowItWorks />
        
        {/* FEATURES DEEP DIVE */}
        <section className="py-24 lg:py-32 bg-slate-50 relative overflow-hidden">
           <div className="container px-4 mx-auto max-w-7xl relative z-10">
              <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
                 <span className="text-emerald-600 font-bold tracking-wide uppercase text-sm">Deep Features</span>
                 <h2 className="text-4xl lg:text-5xl font-bold text-slate-900">Go deeper than the bill</h2>
                 <p className="text-xl text-slate-600">Granular visibility into the resources that matter most.</p>
              </div>
              <FeatureTabs />
           </div>
        </section>

        <FeaturesBento />
        <IntegrationsWall />
        
        {/* TESTIMONIALS */}
        <section className="py-24 bg-slate-50">
           <div className="container px-4 mx-auto max-w-7xl">
              <div className="text-center mb-16">
                 <h2 className="text-3xl font-bold text-slate-900 mb-4">Loved by engineering leaders</h2>
              </div>
              <Testimonials />
           </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-white border-t border-slate-100">
           <div className="container px-4 mx-auto max-w-4xl">
              <div className="text-center mb-16">
                 <h2 className="text-3xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
              </div>
              <FaqSection />
           </div>
        </section>
        
        {/* CTA */}
        <section className="py-24 bg-[#0B1221] relative overflow-hidden">
           {/* Background Glows */}
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
              <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px]" />
              <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px]" />
           </div>
           
           <div className="container px-4 mx-auto max-w-4xl relative z-10 text-center space-y-8">
              <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Ready to stop burning cloud cash?</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                Join high-performance engineering teams saving an average of 35% on their cloud & AI bills in the first 30 days.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                 <Link href="/signup" className="flex items-center justify-center h-14 px-10 text-lg font-bold text-emerald-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-all shadow-glow-mint">
                   Get Started Free
                   <ArrowRight className="w-5 h-5 ml-2" />
                 </Link>
                 <Link href="/demo" className="px-10 h-14 inline-flex items-center justify-center rounded-xl border border-slate-700 text-white font-semibold hover:bg-white/10 transition-all text-lg">
                   Talk to Sales
                 </Link>
              </div>
              <p className="text-sm text-slate-500 pt-4">No credit card required · SOC2 Compliant · 5-min Setup</p>
           </div>
        </section>
      </main>
    </div>
  )
}
