"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Cloud, TrendingDown, BarChart3, Clock, Users } from "lucide-react"

interface AuthLayoutProps {
  children: React.ReactNode
  variant?: "login" | "signup"
}

// Grouped provider logos by category
const providerGroups = {
  genai: [
    { name: "Gemini", logo: "/logos/providers/gemini.svg" },
    { name: "OpenAI", logo: "/logos/providers/openai.svg" },
    { name: "Anthropic", logo: "/logos/providers/anthropic.svg" },
    { name: "Cursor", logo: "/logos/providers/cursor.svg" },
    { name: "Copilot", logo: "/logos/providers/copilot.svg" },
    { name: "Perplexity", logo: "/logos/providers/perplexity.svg" },
  ],
  cloud: [
    { name: "GCP", logo: "/logos/providers/gcp.svg" },
    { name: "AWS", logo: "/logos/providers/aws.svg" },
    { name: "Azure", logo: "/logos/providers/azure.svg" },
    { name: "Supabase", logo: "/logos/providers/supabase.svg" },
  ],
  saas: [
    { name: "Slack", logo: "/logos/providers/slack.svg" },
    { name: "GitHub", logo: "/logos/providers/github.svg" },
    { name: "Figma", logo: "/logos/providers/figma.svg" },
    { name: "Notion", logo: "/logos/providers/notion.svg" },
    { name: "Jira", logo: "/logos/providers/jira.svg" },
    { name: "Linear", logo: "/logos/providers/linear.svg" },
  ],
}

const features = [
  { icon: TrendingDown, title: "Reduce costs", description: "AI-powered savings recommendations" },
  { icon: BarChart3, title: "Real-time analytics", description: "Live dashboards & trend analysis" },
  { icon: Users, title: "Team collaboration", description: "Unlimited users & role-based access" },
  { icon: Clock, title: "2-minute setup", description: "Quick OAuth integrations" },
]

const stats = [
  { value: "50+", label: "Integrations" },
  { value: "Real-time", label: "Tracking" },
  { value: "Secure", label: "Platform" },
]

// Team avatars for social proof
const teamAvatars = [
  { name: "Sarah", color: "#FF6B6B", initial: "S" },
  { name: "Mike", color: "#4ECDC4", initial: "M" },
  { name: "Alex", color: "#45B7D1", initial: "A" },
  { name: "Jordan", color: "#96CEB4", initial: "J" },
]

export function AuthLayout({ children, variant = "login" }: AuthLayoutProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-svh w-full flex flex-col lg:flex-row">
      {/* Left Panel - Content Rich */}
      <div className="hidden lg:flex lg:w-[50%] relative bg-gradient-to-br from-[#fafffe] via-white to-[#f0fdf4]">
        {/* Decorative Elements */}
        <div className="absolute inset-0">
          {/* Top-left mint glow */}
          <div
            className="absolute w-[600px] h-[600px] -top-[200px] -left-[200px]"
            style={{
              background: "radial-gradient(circle, rgba(144,252,166,0.25) 0%, transparent 60%)",
              filter: "blur(80px)"
            }}
          />
          {/* Bottom-right coral glow */}
          <div
            className="absolute w-[400px] h-[400px] -bottom-[100px] -right-[100px]"
            style={{
              background: "radial-gradient(circle, rgba(255,108,94,0.1) 0%, transparent 60%)",
              filter: "blur(60px)"
            }}
          />
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "50px 50px"
            }}
          />
        </div>

        {/* Content Container - Flexible with reduced spacing */}
        <div className="relative z-10 flex flex-col h-full w-full px-6 xl:px-8 py-5">
          {/* Logo - Top */}
          <div className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0a0a0b] shadow-lg group-hover:scale-105 transition-transform">
                <Cloud className="h-5 w-5 text-[#90FCA6]" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold text-[#0a0a0b] tracking-tight">
                Cloud<span className="text-[#16a34a]">Act</span>
              </span>
            </Link>
          </div>

          {/* Main Content - Flexible Layout */}
          <div className="flex-1 flex flex-col justify-center w-full py-4">
            {/* Headline - Centered */}
            <div className={`text-center space-y-3 transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <h1 className="text-[30px] xl:text-[38px] font-bold text-[#0a0a0b] leading-[1.1] tracking-tight">
                One dashboard for
                <br />
                <span className="bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a] bg-clip-text text-transparent">GenAI, Cloud & SaaS</span>
                <br />
                spending
              </h1>
              <p className="text-[14px] xl:text-[15px] text-gray-500 leading-relaxed max-w-lg mx-auto">
                Track, analyze, and optimize your tech spend across all your cloud and AI providers.
              </p>
            </div>

            {/* Stats Row */}
            <div className={`flex items-center justify-between px-4 mt-6 transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center flex-1">
                  <div className="text-2xl xl:text-3xl font-black text-[#0a0a0b]">{stat.value}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Features Grid */}
            <div className={`mt-6 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <div className="grid grid-cols-2 gap-3">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="group p-3 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-[#90FCA6]/50 hover:shadow-lg hover:shadow-[#90FCA6]/15 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10">
                        <feature.icon className="h-4 w-4 text-[#16a34a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-[#0a0a0b] block">{feature.title}</span>
                        <p className="text-[10px] text-gray-500 leading-tight">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Provider Logos - Single Row */}
            <div className={`mt-8 transition-all duration-700 delay-400 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <div className="text-center mb-4">
                <p className="text-[12px] font-semibold text-[#0a0a0b] tracking-wide">Track Every Dollar</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Unified cost visibility across all your tools</p>
              </div>

              {/* All Providers in Single Row */}
              <div className="p-4 rounded-xl bg-white/70 backdrop-blur-sm border border-gray-100/80">
                <div className="flex items-center justify-between gap-6">
                  {/* GenAI */}
                  <div className="flex-1 text-center">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#90FCA6]/15 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                      <span className="text-[9px] font-semibold text-[#16a34a] uppercase tracking-wider">GenAI</span>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {providerGroups.genai.map((provider) => (
                        <div
                          key={provider.name}
                          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shadow-sm border border-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                          title={provider.name}
                        >
                          <Image src={provider.logo} alt={provider.name} width={20} height={20} className="opacity-90" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-12 bg-gray-200" />

                  {/* Cloud */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#3b82f6]/10 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                      <span className="text-[9px] font-semibold text-[#3b82f6] uppercase tracking-wider">Cloud</span>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {providerGroups.cloud.map((provider) => (
                        <div
                          key={provider.name}
                          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shadow-sm border border-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                          title={provider.name}
                        >
                          <Image src={provider.logo} alt={provider.name} width={20} height={20} className="opacity-90" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-12 bg-gray-200" />

                  {/* SaaS */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#f59e0b]/10 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span className="text-[9px] font-semibold text-[#f59e0b] uppercase tracking-wider">SaaS</span>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {providerGroups.saas.slice(0, 4).map((provider) => (
                        <div
                          key={provider.name}
                          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shadow-sm border border-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                          title={provider.name}
                        >
                          <Image src={provider.logo} alt={provider.name} width={20} height={20} className="opacity-90" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between pt-3 transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            {/* Social Proof */}
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {teamAvatars.map((avatar, index) => (
                  <div
                    key={avatar.name}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold shadow-md"
                    style={{
                      backgroundColor: avatar.color,
                      color: '#fff',
                      zIndex: teamAvatars.length - index,
                    }}
                  >
                    {avatar.initial}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#0a0a0b]">Built for modern teams</div>
                <div className="text-[8px] text-gray-400">from startups to enterprise</div>
              </div>
            </div>

            {/* Google Cloud Badge - Center */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-gray-100 shadow-sm">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="#4285F4"/>
              </svg>
              <div className="flex flex-col">
                <span className="text-[9px] font-semibold text-[#0a0a0b]">Powered by Google</span>
                <span className="text-[8px] text-gray-400">Data, AI & ML</span>
              </div>
            </div>

            {/* Stripe Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-100 shadow-sm">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" fill="#635BFF"/>
              </svg>
              <div className="flex flex-col">
                <span className="text-[9px] font-semibold text-[#0a0a0b]">Secure payments</span>
                <span className="text-[8px] text-gray-400">powered by Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col min-h-svh bg-white dark:bg-[#0a0a0b] relative">
        {/* Mobile Logo Header */}
        <div className="lg:hidden p-4 sm:p-6 relative z-10 border-b border-gray-100 dark:border-white/10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-[#0a0a0b] shadow-lg">
              <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-[#90FCA6]" strokeWidth={2.5} />
            </div>
            <span className="text-lg sm:text-xl font-bold text-[#0a0a0b] dark:text-white tracking-tight">
              Cloud<span className="text-[#16a34a] dark:text-[#90FCA6]">Act</span>
            </span>
          </Link>
        </div>

        {/* Form Container - Centered in Right Panel */}
        <div className="flex-1 flex flex-col justify-center overflow-y-auto px-6 sm:px-10 lg:px-12 py-6 sm:py-8 lg:py-12 relative z-10">
          <div className={`w-full max-w-[420px] mx-auto my-auto transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 text-center text-xs sm:text-sm text-gray-400 dark:text-white/40 relative z-10 border-t border-gray-100 dark:border-white/10 lg:border-t-0">
          <span>&copy; {new Date().getFullYear()} CloudAct. All rights reserved.</span>
          <span className="mx-1 sm:mx-2">·</span>
          <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-white/60 transition-colors">Privacy</Link>
          <span className="mx-1 sm:mx-2">·</span>
          <Link href="/terms" className="hover:text-gray-600 dark:hover:text-white/60 transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  )
}
