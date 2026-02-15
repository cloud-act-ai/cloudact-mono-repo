"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

// All available provider logos organized by category
const cloudProviders = [
  { name: "AWS", logo: "/logos/providers/aws.svg" },
  { name: "Google Cloud", logo: "/logos/providers/gcp.svg" },
  { name: "Azure", logo: "/logos/providers/azure.svg" },
  { name: "Oracle Cloud", logo: "/logos/providers/oci.svg" },
]

const aiProviders = [
  { name: "OpenAI", logo: "/logos/providers/openai.svg" },
  { name: "Anthropic", logo: "/logos/providers/anthropic.svg" },
  { name: "Gemini", logo: "/logos/providers/gemini.svg" },
  { name: "DeepSeek", logo: "/logos/providers/deepseek.svg" },
  { name: "Perplexity", logo: "/logos/providers/perplexity.svg" },
  { name: "GitHub Copilot", logo: "/logos/providers/copilot.svg" },
  { name: "Cursor", logo: "/logos/providers/cursor.svg" },
  { name: "Windsurf", logo: "/logos/providers/windsurf.svg" },
  { name: "v0", logo: "/logos/providers/v0.svg" },
  { name: "Lovable", logo: "/logos/providers/lovable.svg" },
  { name: "Replit", logo: "/logos/providers/replit.svg" },
]

const saasProviders = [
  { name: "Slack", logo: "/logos/providers/slack.svg" },
  { name: "Notion", logo: "/logos/providers/notion.svg" },
  { name: "Figma", logo: "/logos/providers/figma.svg" },
  { name: "Canva", logo: "/logos/providers/canva.svg" },
  { name: "Asana", logo: "/logos/providers/asana.svg" },
  { name: "Linear", logo: "/logos/providers/linear.svg" },
  { name: "Jira", logo: "/logos/providers/jira.svg" },
  { name: "Miro", logo: "/logos/providers/miro.svg" },
  { name: "GitHub", logo: "/logos/providers/github.svg" },
  { name: "GitLab", logo: "/logos/providers/gitlab.svg" },
  { name: "Zoom", logo: "/logos/providers/zoom.svg" },
  { name: "Teams", logo: "/logos/providers/teams.svg" },
  { name: "Zapier", logo: "/logos/providers/zapier.svg" },
  { name: "Supabase", logo: "/logos/providers/supabase.svg" },
  { name: "Adobe", logo: "/logos/providers/adobe.svg" },
  { name: "Adobe CC", logo: "/logos/providers/adobe_cc.svg" },
]

// Combine for marquee rows
const row1Providers = [...cloudProviders, ...aiProviders.slice(0, 6)]
const row2Providers = [...aiProviders.slice(6), ...saasProviders.slice(0, 8)]
const row3Providers = [...saasProviders.slice(8)]

// Marquee component
function Marquee({
  providers,
  direction = "left",
  speed = 25
}: {
  providers: typeof cloudProviders
  direction?: "left" | "right"
  speed?: number
}) {
  // Duplicate for seamless loop
  const items = [...providers, ...providers, ...providers]

  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <motion.div
        className="flex gap-6 py-3"
        animate={{
          x: direction === "left" ? ["0%", "-33.333%"] : ["-33.333%", "0%"],
        }}
        transition={{
          x: {
            duration: speed,
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {items.map((provider, i) => (
          <div
            key={`${provider.name}-${i}`}
            className="group flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-100 rounded-lg hover:border-slate-300 hover:shadow-md transition-all duration-300 cursor-pointer flex-shrink-0"
          >
            <div className="relative w-6 h-6 flex items-center justify-center transition-all duration-300 filter grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100">
              <Image
                src={provider.logo}
                alt={provider.name}
                width={24}
                height={24}
                className="object-contain"
              />
            </div>
            <span className="text-sm font-medium text-slate-500 group-hover:text-slate-900 transition-colors duration-300 whitespace-nowrap">
              {provider.name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export function IntegrationsWall() {
  return (
    <section className="relative py-12 lg:py-16 overflow-hidden bg-white">
      {/* CORAL radial gradient - alternating with hero's mint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 108, 94, 0.08), transparent 70%)'
        }}
      />
      <div className="container relative z-10 px-4 mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <h2 className="text-2xl md:text-4xl font-bold text-slate-900 tracking-tight mb-3">
            Connects with everything you use
          </h2>
          <p className="text-base text-slate-600">
            30+ integrations with cloud providers, AI services, and SaaS tools
          </p>
        </motion.div>
      </div>

      {/* Full-width scrolling logos */}
      <div className="relative z-10 space-y-3">
        <Marquee providers={row1Providers} direction="left" speed={35} />
        <Marquee providers={row2Providers} direction="right" speed={40} />
        <Marquee providers={row3Providers} direction="left" speed={32} />
      </div>

      {/* CTA */}
      <div className="container relative z-10 px-4 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <Link
            href="/integrations"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700 transition-colors"
          >
            See all integrations
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
