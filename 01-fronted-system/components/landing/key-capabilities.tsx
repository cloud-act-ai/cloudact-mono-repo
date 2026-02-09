"use client"

import { motion } from "framer-motion"
import {
  BarChart3,
  Brain,
  Zap,
  Layers,
  Target,
  LineChart,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

const capabilities = [
  {
    icon: BarChart3,
    title: "Multi-Cloud Visibility",
    description: "Unified view across AWS, GCP, Azure & OCI with automatic tagging and 100% cost allocation.",
    features: ["Real-time dashboards", "Custom tagging", "Department allocation"],
    color: "blue",
  },
  {
    icon: Brain,
    title: "GenAI Intelligence",
    description: "Track every token across OpenAI, Anthropic, Gemini & more. Cost per request, per customer, per feature.",
    features: ["Token tracking", "Model comparison", "Usage attribution"],
    color: "purple",
  },
  {
    icon: Zap,
    title: "Anomaly Detection",
    description: "AI-powered alerts catch cost spikes in under 5 minutes. Slack, PagerDuty, or email notifications.",
    features: ["< 5 min detection", "Smart thresholds", "Root cause analysis"],
    color: "amber",
  },
  {
    icon: Target,
    title: "Budget & Forecasting",
    description: "Set budgets at any hierarchy level. Accurate forecasts based on trends and seasonality.",
    features: ["Dept budgets", "Trend forecasting", "Variance alerts"],
    color: "emerald",
  },
  {
    icon: Layers,
    title: "SaaS Governance",
    description: "Discover shadow IT and unused licenses across ChatGPT Team, GitHub Copilot, Datadog, and 50+ apps.",
    features: ["License tracking", "Shadow IT", "Renewal alerts"],
    color: "teal",
  },
  {
    icon: LineChart,
    title: "Unit Economics",
    description: "True cost per customer, per transaction, per API call. Data-driven pricing decisions.",
    features: ["Cost per customer", "Margin analysis", "Pricing insights"],
    color: "indigo",
  },
]

const colorClasses = {
  blue: {
    icon: "bg-blue-50 text-blue-600 border-blue-100",
    badge: "bg-blue-50 text-blue-700 border-blue-100",
  },
  purple: {
    icon: "bg-purple-50 text-purple-600 border-purple-100",
    badge: "bg-purple-50 text-purple-700 border-purple-100",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 border-amber-100",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 border-emerald-100",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  teal: {
    icon: "bg-teal-50 text-teal-600 border-teal-100",
    badge: "bg-teal-50 text-teal-700 border-teal-100",
  },
  indigo: {
    icon: "bg-indigo-50 text-indigo-600 border-indigo-100",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
}

export function KeyCapabilities() {
  return (
    <section className="py-20 lg:py-28 bg-white relative overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-60" />

      <div className="container px-4 mx-auto max-w-7xl relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-4">
              Capabilities
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-[2.75rem] font-bold text-slate-900 tracking-tight mb-4">
              Everything you need to optimize spend
            </h2>
            <p className="text-base text-slate-500">
              Visibility, anomaly detection, and optimization — built for modern engineering teams.
            </p>
          </motion.div>
        </div>

        {/* Capabilities Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {capabilities.map((cap, index) => {
            const colors = colorClasses[cap.color as keyof typeof colorClasses]
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="group relative bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-300"
              >
                {/* Icon + Title - INLINE */}
                <div className="flex items-start gap-4 mb-3">
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${colors.icon}`}>
                    <cap.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 pt-1.5">{cap.title}</h3>
                </div>

                {/* Description */}
                <p className="text-slate-600 text-sm leading-relaxed mb-4 pl-14">{cap.description}</p>

                {/* Features - Compact */}
                <div className="flex flex-wrap gap-1.5 pl-14">
                  {cap.features.map((feature) => (
                    <span
                      key={feature}
                      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${colors.badge}`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Hover Arrow */}
                <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mt-12"
        >
          <Link
            href="/features"
            className="inline-flex items-center gap-2 text-emerald-600 font-semibold hover:text-emerald-700 text-sm group"
          >
            Explore all features
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
