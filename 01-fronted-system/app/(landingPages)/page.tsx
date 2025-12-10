"use client"

import Link from "next/link"
import { useState } from "react"

// Note: metadata export won't work with "use client" - moved to layout or separate file
// For client components, SEO is handled by the parent layout
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Shield,
  Sparkles,
  TrendingDown,
  Zap,
  Globe,
  Cpu,
  Clock,
  DollarSign,
  Search,
  Headphones,
  FileText,
} from "lucide-react"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"

export default function HomePage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  const testimonials = [
    {
      quote:
        "Cost analysis used to take at least one full day per month. With CloudAct.ai, we track spending in real-time now, which saves us hours each month.",
      author: "Sarah Mitchell",
      role: "VP Engineering",
      company: "TechCorp",
    },
    {
      quote:
        "We were burning $400K annually on inefficient model usage. CloudAct.ai's recommendations saved us $270K in the first year alone.",
      author: "Marcus Rodriguez",
      role: "CTO",
      company: "DataFlow Technologies",
    },
    {
      quote:
        "Finally, a single dashboard for all our cloud and AI costs. CloudAct.ai transformed how our FinOps team operates.",
      author: "Emily Watson",
      role: "Head of FinOps",
      company: "Enterprise Cloud Corp",
    },
  ]

  const clients = ["Anthropic", "OpenAI", "Stripe", "Vercel", "Cloudflare", "MongoDB"]

  const nextTestimonial = () => setActiveTestimonial((prev) => (prev + 1) % testimonials.length)
  const prevTestimonial = () => setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  return (
    <>
      {/* Promo Banner */}
      <div className="cloudact-promo-banner">
        <span className="inline-block bg-white/20 backdrop-blur-sm text-white px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase mr-2">
          LIMITED TIME OFFER
        </span>
        <span className="text-sm font-medium">Get 3 months free when you sign up by Jan 31st</span>
      </div>

      {/* Hero Section */}
      <section className="text-center px-4 md:px-12 py-12 md:py-20 cloudact-hero-gradient">
        <h1 className="cloudact-heading-xl max-w-[900px] mx-auto mb-4 md:mb-6">
          GenAI Cloud Cost Intelligence. Simplified.
        </h1>
        <p className="cloudact-body text-base md:text-lg max-w-[650px] mx-auto mb-8 md:mb-10 px-4 leading-relaxed">
          Join 500+ enterprises that optimize their cloud spend and GenAI workloads with CloudAct.ai.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center px-4">
          <Link
            href="/signup"
            className="cloudact-btn-primary w-full sm:w-auto"
          >
            Request a Demo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/features"
            className="cloudact-btn-secondary w-full sm:w-auto"
          >
            How CloudAct.ai works
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-xs font-medium text-gray-600">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-[#007A78]" />
            <span>SOC 2 Type II Certified</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[#FF6E50]" />
            <span>5-Minute Integration</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-[#007A78]" />
            <span>67% Average Cost Reduction</span>
          </div>
        </div>

        {/* Dashboard Preview Card */}
        <div className="max-w-[1200px] mx-auto mt-12 md:mt-16 px-4">
          <div className="bg-white rounded-xl md:rounded-2xl shadow-[0_20px_60px_rgba(0,122,120,0.15)] p-4 md:p-8 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-gray-50 p-4 md:p-6 rounded-lg border border-gray-200">
                <div className="text-gray-600 text-sm mb-2">Cloud Spend Overview</div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#007A78] flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-gray-300 rounded w-3/4"></div>
                      <div className="h-2 bg-gray-200 rounded w-1/2 mt-2"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 md:p-6 rounded-lg border border-gray-200">
                <div className="text-gray-600 text-sm mb-2">GenAI Usage Metrics</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#FF6E50]">$62K</div>
                    <div className="text-xs text-gray-600">This month</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#FF6E50]">22%</div>
                    <div className="text-xs text-gray-600">Savings</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#FF6E50]">15</div>
                    <div className="text-xs text-gray-600">Services</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Client Logos */}
      <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 px-4 md:px-12 py-8 md:py-12 bg-white border-b border-gray-200">
        <p className="w-full text-center text-xs font-medium text-gray-500 mb-4 uppercase tracking-widest">Trusted by Industry Leaders</p>
        {clients.map((client) => (
          <div key={client} className="text-lg font-bold text-gray-400 hover:text-gray-600 transition-colors">
            {client}
          </div>
        ))}
      </div>

      {/* Feature Section 1 */}
      <section className="px-4 md:px-12 py-12 md:py-24 max-w-[1400px] mx-auto">
        <div className="grid md:grid-cols-2 gap-8 md:gap-20 items-center mb-16 md:mb-32">
          <div>
            <h2 className="cloudact-heading-lg mb-4 md:mb-6">
              Analyze cloud costs in minutes with smart technology.
            </h2>

            <div className="space-y-6 mb-8">
              <div className="flex gap-4">
                <div className="cloudact-icon-box flex-shrink-0">
                  <Shield className="w-6 h-6 text-[#007A78]" />
                </div>
                <div>
                  <h4 className="cloudact-heading-md mb-1">Cost analysis takes just a few clicks</h4>
                  <p className="cloudact-body-sm">
                    Plus, we automatically identify optimization opportunities and track your savings.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="cloudact-icon-box flex-shrink-0">
                  <Clock className="w-6 h-6 text-[#007A78]" />
                </div>
                <div>
                  <h4 className="cloudact-heading-md mb-1">Real-time GenAI monitoring</h4>
                  <p className="cloudact-body-sm">
                    CloudAct.ai automatically tracks your GenAI model usage, token consumption, and associated costs.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="cloudact-icon-box flex-shrink-0">
                  <DollarSign className="w-6 h-6 text-[#007A78]" />
                </div>
                <div>
                  <h4 className="cloudact-heading-md mb-1">Multi-cloud cost visibility</h4>
                  <p className="cloudact-body-sm">
                    Track AWS, Azure, and GCP costs in one unified dashboard with automated recommendations.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="cloudact-card p-8">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007A78] flex items-center justify-center flex-shrink-0">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-3/4 mb-2"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="text-[#007A78] font-bold">$3,420</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007A78]/80 flex items-center justify-center flex-shrink-0">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-2/3 mb-2"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="text-[#007A78] font-bold">$2,890</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#007A78]/60 flex items-center justify-center flex-shrink-0">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-4/5 mb-2"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="text-[#007A78] font-bold">$4,580</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="max-w-[900px] mx-auto text-center px-4 md:px-12 py-12 md:py-20 bg-gray-50">
        <blockquote className="cloudact-heading-lg italic mb-8">
          "{testimonials[activeTestimonial].quote}"
        </blockquote>
        <div className="font-semibold text-gray-900">{testimonials[activeTestimonial].author}</div>
        <div className="text-sm md:text-[15px] text-gray-600 mt-1">
          {testimonials[activeTestimonial].role}, {testimonials[activeTestimonial].company}
        </div>

        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={prevTestimonial}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white transition-all hover:border-[#007A78] hover:text-[#007A78]"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTestimonial(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === activeTestimonial ? "w-6 bg-[#007A78]" : "w-1.5 bg-gray-300"
                  }`}
                aria-label={`Go to testimonial ${idx + 1}`}
              />
            ))}
          </div>
          <button
            onClick={nextTestimonial}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white transition-all hover:border-[#007A78] hover:text-[#007A78]"
            aria-label="Next testimonial"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 md:px-12 py-12 md:py-24 bg-white">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="cloudact-heading-lg">
            But wait, there's more.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-[1200px] mx-auto">
          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <Clock className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Real-time tracking</h4>
            <p className="cloudact-body-sm">
              Track usage in real-time, manage budgets, and sync seamlessly with your billing.
            </p>
          </div>

          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <BarChart3 className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Performance analytics</h4>
            <p className="cloudact-body-sm">
              Set goals, track metrics, and optimize your cloud infrastructure performance.
            </p>
          </div>

          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <Sparkles className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">AI recommendations</h4>
            <p className="cloudact-body-sm">
              Data-backed guidance and comprehensive optimization recommendations.
            </p>
          </div>

          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <Shield className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Enterprise security</h4>
            <p className="cloudact-body-sm">
              SOC 2 Type II certified with enterprise-grade security and compliance.
            </p>
          </div>

          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <Globe className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Multi-cloud support</h4>
            <p className="cloudact-body-sm">
              Support for AWS, Azure, GCP, and all major GenAI providers in one platform.
            </p>
          </div>

          <div className="cloudact-card p-8 md:p-10">
            <div className="cloudact-icon-box mb-5">
              <Cpu className="w-8 h-8 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">GenAI optimization</h4>
            <p className="cloudact-body-sm">
              Optimize your GenAI workloads with intelligent model and prompt recommendations.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="px-4 md:px-12 py-12 md:py-24 bg-gray-50">
        <div className="text-center mb-12 md:mb-16 max-w-[800px] mx-auto">
          <h2 className="cloudact-heading-lg mb-4">
            Let's find the right plan for your business
          </h2>
          <p className="cloudact-body max-w-[600px] mx-auto mb-8">
            Choose from a variety of plans and add-ons. You won't pay a cent until you're ready.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-[1300px] mx-auto">
          <div className="cloudact-pricing-card">
            <div className="text-xl font-bold mb-2 text-gray-900">Starter</div>
            <p className="text-sm text-gray-600 mb-6">For small teams getting started</p>
            <div className="mb-6">
              <span className="cloudact-pricing-value">$0</span>
              <span className="text-gray-600">/mo</span>
            </div>
            <Link href="/signup" className="cloudact-btn-secondary w-full justify-center">
              Get started
            </Link>
          </div>

          <div className="cloudact-pricing-card cloudact-pricing-card-featured relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#FF6E50] to-[#FF8A70] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
              Most Popular
            </div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Plus</h3>
            <p className="text-sm text-gray-600 mb-6">Best for growing teams</p>
            <div className="mb-6">
              <span className="cloudact-pricing-value">$249</span>
              <span className="text-gray-600">/mo</span>
            </div>
            <Link href="/signup" className="cloudact-btn-primary w-full justify-center">
              Get started
            </Link>
          </div>

          <div className="cloudact-pricing-card">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Premium</h3>
            <p className="text-sm text-gray-600 mb-6">Advanced features for scale</p>
            <div className="mb-6">
              <span className="cloudact-pricing-value">$499</span>
              <span className="text-gray-600">/mo</span>
            </div>
            <Link href="/signup" className="cloudact-btn-secondary w-full justify-center">
              Get started
            </Link>
          </div>

          <div className="cloudact-pricing-card">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Enterprise</h3>
            <p className="text-sm text-gray-600 mb-6">Custom for large organizations</p>
            <div className="mb-6">
              <span className="text-gray-900 text-3xl font-bold">Contact us</span>
            </div>
            <Link href="/contact" className="cloudact-btn-secondary w-full justify-center">
              Contact sales
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-4 md:px-12 py-16 md:py-24 cloudact-stats-section">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-[48px] font-light mb-6 leading-tight text-white">
            See how CloudAct.ai stacks up <br className="hidden md:block" />
            against other cloud cost platforms.
          </h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-8 md:gap-12 max-w-[900px] mx-auto text-center">
          <div>
            <div className="cloudact-stat-value mb-2">9 out of 10</div>
            <p className="text-white/90">customers say we're easier to use than competitors</p>
          </div>
          <div>
            <div className="cloudact-stat-value mb-2">132x</div>
            <p className="text-white/90">faster on average for cost analysis</p>
          </div>
          <div>
            <div className="cloudact-stat-value mb-2">4.95 stars</div>
            <p className="text-white/90">based on 14,000+ reviews</p>
          </div>
        </div>

        <div className="text-center mt-12">
          <Link
            href="/about"
            className="inline-block px-8 py-3 bg-white text-[#007A78] rounded-md text-[15px] font-semibold hover:bg-gray-100 transition-all"
          >
            Learn more
          </Link>
        </div>
      </section>

      {/* Get Started Steps */}
      <section className="px-4 md:px-12 py-16 md:py-24 bg-white">
        <div className="text-center mb-12">
          <h2 className="cloudact-heading-lg">
            You're three steps away from easy, automated cost optimization.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center max-w-[1200px] mx-auto">
          <div className="bg-gray-100 rounded-2xl p-8 min-h-[300px] flex items-center justify-center">
            <div className="text-center text-gray-400">
              <BarChart3 className="w-16 h-16 mx-auto mb-4" />
              <p>Dashboard Preview</p>
            </div>
          </div>
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-[#E6F7F6] rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[#007A78]">
                1
              </div>
              <div>
                <h4 className="cloudact-heading-md mb-2">Create an account.</h4>
                <p className="cloudact-body">
                  It's free to sign up. You'll connect your cloud accounts and set preferences.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-[#E6F7F6] rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[#007A78]">
                2
              </div>
              <div>
                <h4 className="cloudact-heading-md mb-2">Connect your cloud providers.</h4>
                <p className="cloudact-body">
                  Add AWS, Azure, or GCP credentials. We'll start analyzing costs immediately.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-[#E6F7F6] rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[#007A78]">
                3
              </div>
              <div>
                <h4 className="cloudact-heading-md mb-2">View your first dashboard.</h4>
                <p className="cloudact-body">
                  Once connected, you can view detailed cost breakdowns and optimization recommendations.
                </p>
              </div>
            </div>
            <div className="pt-4">
              <Link
                href="/signup"
                className="cloudact-btn-primary"
              >
                Get started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section className="px-4 md:px-12 py-16 md:py-24 bg-gray-50">
        <div className="text-center mb-12">
          <h2 className="cloudact-heading-lg">
            Questions? Meet answers.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-[1100px] mx-auto">
          <div className="cloudact-card p-8 text-center">
            <div className="w-20 h-20 bg-[#FFF5F3] rounded-full flex items-center justify-center mx-auto mb-5">
              <FileText className="w-10 h-10 text-[#FF6E50]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Compare CloudAct.ai</h4>
            <p className="cloudact-body-sm mb-5">See how CloudAct.ai stacks up against other providers.</p>
            <Link href="/compare" className="cloudact-link text-sm">
              Compare CloudAct.ai
            </Link>
          </div>

          <div className="cloudact-card p-8 text-center">
            <div className="w-20 h-20 bg-[#E6F7F6] rounded-full flex items-center justify-center mx-auto mb-5">
              <Search className="w-10 h-10 text-[#007A78]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Search the help center</h4>
            <p className="cloudact-body-sm mb-5">
              Find instant answers by searching our help center or browsing topics.
            </p>
            <Link href="/help" className="cloudact-link text-sm">
              Help center
            </Link>
          </div>

          <div className="cloudact-card p-8 text-center">
            <div className="w-20 h-20 bg-[#FFF5F3] rounded-full flex items-center justify-center mx-auto mb-5">
              <Headphones className="w-10 h-10 text-[#FF6E50]" />
            </div>
            <h4 className="cloudact-heading-md mb-3">Give us a ring</h4>
            <p className="cloudact-body-sm mb-5">Monday through Friday from 6AM – 6PM MST.</p>
            <a href="tel:(800) 936-0383" className="cloudact-link text-sm">
              (800) 936-0383
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA - Coral Banner */}
      <section className="py-16 md:py-20 px-4 md:px-12">
        <div className="banner-coral rounded-2xl p-8 md:p-12 max-w-[1200px] mx-auto">
          <div className="mx-auto max-w-3xl text-center space-y-6 relative z-10">
            <h2 className="text-hero text-white">
              Ready to Optimize Your Costs?
            </h2>
            <p className="text-white/90 text-lg max-w-xl mx-auto">
              Join hundreds of companies reducing their GenAI and cloud infrastructure costs by an average of 67%.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link
                href="/signup"
                className="inline-flex items-center px-6 py-3 bg-white text-[#FF6E50] rounded-lg text-[15px] font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Request a Demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center px-6 py-3 bg-transparent text-white border-2 border-white/30 rounded-lg text-[15px] font-semibold hover:bg-white/10 hover:border-white/50 transition-all"
              >
                View Pricing
              </Link>
            </div>
            <p className="text-white/70 text-xs pt-3 font-medium">{DEFAULT_TRIAL_DAYS}-day free trial • No credit card required</p>
          </div>
        </div>
      </section>
    </>
  )
}
