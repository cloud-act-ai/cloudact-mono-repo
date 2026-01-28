"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function IntegrationsWall() {
  const categories = [
    { title: "Cloud Providers", icons: ["aws", "azure", "gcp", "oracle"], color: "mint" },
    { title: "AI Models", icons: ["openai", "anthropic", "cohere", "gemini"], color: "coral" },
    { title: "Monitoring", icons: ["datadog", "prometheus", "grafana", "newrelic"], color: "mint" },
    { title: "Communication", icons: ["slack", "teams", "pagerduty", "discord"], color: "coral" },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container px-4 mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {/* Accent line */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1 rounded-full bg-[#90FCA6]" />
            </div>
            <span className="inline-block text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-3">
              Integrations
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-4">
              Connects with everything you use
            </h2>
            <p className="text-lg text-slate-500">
              Zero-friction setup. We integrate directly with your existing billing accounts,
              Kubernetes clusters, and observability tools.
            </p>
          </motion.div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {categories.map((cat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex flex-col items-center space-y-6"
            >
              {/* Category Title with accent */}
              <div className="text-center">
                <div className={`w-8 h-0.5 rounded-full mx-auto mb-3 ${
                  cat.color === "mint" ? "bg-[#90FCA6]" : "bg-[#FF6C5E]"
                }`} />
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{cat.title}</h3>
              </div>

              {/* Icons Grid */}
              <div className="grid grid-cols-2 gap-4 w-full max-w-[200px]">
                {cat.icons.map((icon) => (
                  <motion.div
                    key={icon}
                    whileHover={{ scale: 1.05 }}
                    className={`aspect-square bg-white border rounded-xl flex items-center justify-center transition-all duration-300 group cursor-pointer ${
                      cat.color === "mint"
                        ? "border-slate-100 hover:border-[#90FCA6]/50 hover:shadow-lg hover:shadow-[#90FCA6]/10"
                        : "border-slate-100 hover:border-[#FF6C5E]/50 hover:shadow-lg hover:shadow-[#FF6C5E]/10"
                    }`}
                  >
                    <span className={`text-xs font-bold capitalize transition-colors ${
                      cat.color === "mint"
                        ? "text-slate-300 group-hover:text-emerald-600"
                        : "text-slate-300 group-hover:text-[#FF6C5E]"
                    }`}>
                      {icon}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 text-emerald-600 font-semibold hover:text-emerald-700 text-sm group"
          >
            See all 50+ integrations
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
