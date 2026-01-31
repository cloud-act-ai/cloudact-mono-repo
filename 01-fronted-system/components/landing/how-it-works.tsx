"use client"

import { motion } from "framer-motion"

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Connect",
      desc: "Connect your AWS, Azure, or GCP accounts via a secure, read-only role. No agents required for cloud billing.",
      action: "Takes ~5 mins",
      color: "mint"
    },
    {
      num: "02",
      title: "Analyze",
      desc: "Our engine ingests 12 months using CUR data and unifies it with OpenAI/Datadog usage logs automatically.",
      action: "Instant Backfill",
      color: "coral"
    },
    {
      num: "03",
      title: "Optimize",
      desc: "Get actionable resource rightsizing recommendations and anomaly alerts pushed to Slack immediately.",
      action: "Start Saving",
      color: "mint"
    },
  ]

  return (
    <div className="container px-4 mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {/* Accent line */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1 rounded-full bg-[#FF6C5E]" />
            </div>
            <span className="inline-block text-sm font-semibold text-[#FF6C5E] uppercase tracking-wider mb-3">
              How It Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-4">
              From zero to full observability
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Get started in minutes, not weeks. No complex setup required.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector Line (Desktop) */}
          <div className="hidden md:block absolute top-14 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-[#90FCA6] via-[#FF6C5E] to-[#90FCA6] -z-10" />

          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center"
            >
              {/* Number Circle */}
              <div className={`w-28 h-28 bg-white rounded-full flex items-center justify-center text-4xl font-bold shadow-lg border-4 mb-6 z-10 ${
                step.color === "mint"
                  ? "border-[#90FCA6]/30 text-emerald-600"
                  : "border-[#FF6C5E]/30 text-[#FF6C5E]"
              }`}>
                {step.num}
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h3>

              {/* Description */}
              <p className="text-slate-600 leading-relaxed mb-4 max-w-sm">{step.desc}</p>

              {/* Action Badge */}
              <div className={`inline-flex items-center text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide ${
                step.color === "mint"
                  ? "bg-[#90FCA6]/20 text-emerald-700"
                  : "bg-[#FF6C5E]/15 text-[#FF6C5E]"
              }`}>
                {step.action}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
  )
}
