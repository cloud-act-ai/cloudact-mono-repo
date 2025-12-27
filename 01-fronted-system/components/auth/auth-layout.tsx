"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cloud, TrendingDown, Shield, Zap, BarChart3 } from "lucide-react"

interface AuthLayoutProps {
  children: React.ReactNode
  variant?: "login" | "signup"
}

const stats = [
  { value: "$2.4M+", label: "Cloud costs optimized" },
  { value: "340+", label: "Enterprise teams" },
  { value: "99.9%", label: "Platform uptime" },
]

const features = [
  { icon: TrendingDown, label: "Cost reduction", desc: "Average 32% savings" },
  { icon: Shield, label: "Enterprise security", desc: "SOC 2 Type II" },
  { icon: Zap, label: "Real-time insights", desc: "Instant visibility" },
  { icon: BarChart3, label: "Multi-cloud", desc: "AWS, GCP, Azure" },
]

export function AuthLayout({ children, variant = "login" }: AuthLayoutProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-svh w-full flex">
      {/* Left Panel - Brand Showcase */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative overflow-hidden bg-[#0a0a0b]">
        {/* Animated Gradient Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[120px] animate-float-slow"
            style={{
              background: "radial-gradient(circle, #90FCA6 0%, transparent 70%)",
              top: "-20%",
              left: "-10%",
            }}
          />
          <div
            className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px] animate-float-slower"
            style={{
              background: "radial-gradient(circle, #FF6C5E 0%, transparent 70%)",
              bottom: "-15%",
              right: "-5%",
            }}
          />
          <div
            className="absolute w-[300px] h-[300px] rounded-full opacity-25 blur-[80px] animate-float-medium"
            style={{
              background: "radial-gradient(circle, #6EE890 0%, transparent 70%)",
              top: "40%",
              left: "50%",
            }}
          />
        </div>

        {/* Noise Texture Overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(144, 252, 166, 0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(144, 252, 166, 0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-14">
          {/* Logo */}
          <div className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <Link href="/" className="inline-flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-[#90FCA6] blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#90FCA6] shadow-lg shadow-[#90FCA6]/30">
                  <Cloud className="h-6 w-6 text-black" strokeWidth={2.5} />
                </div>
              </div>
              <span className="text-2xl font-bold text-white tracking-tight">
                Cloud<span className="text-[#90FCA6]">Act</span>
              </span>
            </Link>
          </div>

          {/* Middle Content - Stats & Features */}
          <div className="space-y-12">
            {/* Headline */}
            <div
              className={`space-y-4 transition-all duration-700 delay-150 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <h1 className="text-4xl xl:text-5xl font-bold text-white leading-[1.1] tracking-tight">
                Take control of your<br />
                <span className="relative">
                  <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#90FCA6] via-[#B8FDCA] to-[#6EE890]">
                    cloud spend
                  </span>
                </span>
              </h1>
              <p className="text-lg text-white/60 max-w-md leading-relaxed">
                Unified visibility across all your cloud providers.
                Real-time cost analytics that drive action.
              </p>
            </div>

            {/* Stats */}
            <div
              className={`grid grid-cols-3 gap-6 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              {stats.map((stat, i) => (
                <div key={stat.label} className="space-y-1">
                  <div className="text-2xl xl:text-3xl font-bold text-[#90FCA6]">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/50">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Features Grid */}
            <div
              className={`grid grid-cols-2 gap-4 transition-all duration-700 delay-[450ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              {features.map((feature) => (
                <div
                  key={feature.label}
                  className="group flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-[#90FCA6]/20 transition-all duration-300"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#90FCA6]/10 text-[#90FCA6] group-hover:bg-[#90FCA6]/20 transition-colors">
                    <feature.icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">{feature.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom - Trust Badge */}
          <div
            className={`flex items-center gap-6 transition-all duration-700 delay-[600ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-white/20 to-white/5 border-2 border-[#0a0a0b] flex items-center justify-center text-xs font-medium text-white/70"
                >
                  {["A", "M", "S", "J"][i - 1]}
                </div>
              ))}
            </div>
            <div className="text-sm text-white/50">
              Join 340+ teams already saving
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col min-h-svh bg-white relative">
        {/* Subtle Top Gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-[400px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(144, 252, 166, 0.08), transparent 70%)",
          }}
        />

        {/* Mobile Logo */}
        <div className="lg:hidden p-6 relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#90FCA6] shadow-lg shadow-[#90FCA6]/20">
              <Cloud className="h-5 w-5 text-black" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold text-[#0a0a0b] tracking-tight">
              Cloud<span className="text-[#1a7a3a]">Act</span>
            </span>
          </Link>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-12 relative z-10">
          <div
            className={`w-full max-w-[440px] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
          >
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center text-sm text-gray-400 relative z-10">
          <span>&copy; {new Date().getFullYear()} CloudAct. All rights reserved.</span>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  )
}
