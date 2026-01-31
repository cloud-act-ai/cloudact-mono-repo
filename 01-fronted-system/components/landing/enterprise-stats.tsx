"use client"

import { motion } from "framer-motion"
import { Shield, Award, Clock, Users, TrendingDown, DollarSign, Building2 } from "lucide-react"
import Image from "next/image"

const stats = [
  {
    value: "$500M+",
    label: "Cloud Spend Managed",
    icon: DollarSign,
    description: "Across multi-cloud environments",
  },
  {
    value: "500+",
    label: "Engineering Teams",
    icon: Users,
    description: "Trust CloudAct daily",
  },
  {
    value: "35%",
    label: "Average Savings",
    icon: TrendingDown,
    description: "In the first 90 days",
  },
  {
    value: "15+",
    label: "Enterprise Customers",
    icon: Building2,
    description: "Fortune 500 companies",
  },
]

const trustBadges = [
  { icon: Shield, label: "SOC 2 Type II", sublabel: "Certified" },
  { icon: Award, label: "G2 Leader", sublabel: "Winter 2026" },
  { icon: Clock, label: "99.9%", sublabel: "Uptime SLA" },
]

export function EnterpriseStats() {
  return (
    <section className="py-16 lg:py-20 bg-white border-y border-slate-100">
      <div className="container px-4 mx-auto max-w-7xl">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-12 lg:mb-16">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 mb-4">
                <stat.icon className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-semibold text-slate-700 mb-1">{stat.label}</div>
              <div className="text-xs text-slate-500">{stat.description}</div>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges & Logos */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 pt-8 border-t border-slate-100">
          {/* Trust Badges */}
          <div className="flex items-center gap-6 lg:gap-8">
            {trustBadges.map((badge, i) => (
              <motion.div
                key={badge.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <badge.icon className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{badge.label}</div>
                  <div className="text-xs text-slate-500">{badge.sublabel}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Customer Logos */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-8"
          >
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Trusted by</span>
            <div className="flex items-center gap-6">
              {[
                "/logos/providers/gcp.svg",
                "/logos/providers/anthropic.svg",
                "/logos/providers/openai.svg",
                "/logos/providers/github.svg",
              ].map((logo, i) => (
                <Image
                  key={i}
                  src={logo}
                  alt="Customer logo"
                  width={80}
                  height={32}
                  className="h-6 w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
