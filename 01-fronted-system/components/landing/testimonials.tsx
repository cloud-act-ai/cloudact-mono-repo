"use client"

import { motion } from "framer-motion"
import { Quote } from "lucide-react"

export function Testimonials() {
  const testimonials = [
    {
      quote: "We cut our OpenAI bill by 40% in the first week. The ability to see cost per request was a game changer for our engineering team.",
      author: "Sarah J.",
      role: "CTO, Series B Startup",
      initials: "SJ",
      gradient: "from-[#90FCA6] to-emerald-500"
    },
    {
      quote: "Finally, a tool that developers actually want to use. It's fast, intuitive, and gives us real-time visibility into every dollar we spend on cloud and AI.",
      author: "Michael C.",
      role: "VP Engineering, FinTech",
      initials: "MC",
      gradient: "from-blue-400 to-indigo-500"
    },
    {
      quote: "The anomaly detection saved us from a $15k bill when a dev left a GPU cluster running over the weekend. Paid for itself instantly.",
      author: "Elena R.",
      role: "DevOps Lead, AI Company",
      initials: "ER",
      gradient: "from-purple-400 to-pink-500"
    }
  ]

  return (
    <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
      {testimonials.map((t, i) => (
        <Card key={i} {...t} index={i} />
      ))}
    </div>
  )
}

interface CardProps {
  quote: string
  author: string
  role: string
  initials: string
  gradient: string
  index: number
}

function Card({ quote, author, role, initials, gradient, index }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="relative p-8 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full group"
    >
      {/* Decorative gradient blob */}
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-10 blur-2xl rounded-bl-3xl -z-10 transition-opacity group-hover:opacity-20`} />

      <div className="mb-6">
        <Quote className="w-8 h-8 text-slate-200 mb-4 group-hover:text-slate-300 transition-colors" />
        <p className="text-lg text-slate-700 leading-relaxed font-medium">
          {quote}
        </p>
      </div>

      <div className="flex items-center gap-4 mt-auto pt-6 border-t border-slate-100">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br ${gradient} shadow-md`}>
          {initials}
        </div>
        <div>
          <div className="font-bold text-slate-900">{author}</div>
          <div className="text-sm text-slate-500 font-medium">{role}</div>
        </div>
      </div>
    </motion.div>
  )
}
