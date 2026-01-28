"use client"

import { motion } from "framer-motion"

export function Testimonials() {
  return (
    <div className="grid md:grid-cols-3 gap-8">
      <Card
        quote="We cut our OpenAI bill by 40% in the first week. The ability to see cost per request was a game changer for our engineering team."
        author="Sarah Jenkins"
        role="CTO, TechFlow"
        color="mint"
      />
      <Card
        quote="Finally, a tool that developers actually want to use. It doesn't look like a spreadsheet from 2005. It's fast, intuitive, and accurate."
        author="Michael Chen"
        role="VP Engineering, DataScale"
        color="coral"
        featured
      />
      <Card
        quote="The anomaly detection saved us from a $15k bill when a dev left a GPU cluster running over the weekend. Paid for itself instantly."
        author="Elena Rodriguez"
        role="DevOps Lead, Orbit"
        color="mint"
      />
    </div>
  )
}

interface CardProps {
  quote: string
  author: string
  role: string
  color: "mint" | "coral"
  featured?: boolean
}

function Card({ quote, author, role, color, featured }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`relative p-8 rounded-2xl border bg-white flex flex-col justify-between transition-all hover:shadow-xl ${
        featured ? "border-slate-200 shadow-lg md:scale-105 z-10" : "border-slate-100 shadow-sm hover:border-slate-200"
      }`}
    >
      {/* Top accent line */}
      <div className={`absolute top-0 left-8 right-8 h-0.5 rounded-full ${
        color === "mint" ? "bg-[#90FCA6]" : "bg-[#FF6C5E]"
      }`} />

      <div className="space-y-6">
        {/* Stars */}
        <div className={color === "mint" ? "text-[#90FCA6]" : "text-[#FF6C5E]"}>
          {[1, 2, 3, 4, 5].map(i => <span key={i}>★</span>)}
        </div>

        {/* Quote */}
        <p className="text-lg font-medium leading-relaxed text-slate-700">
          "{quote}"
        </p>
      </div>

      {/* Author */}
      <div className="mt-8 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-xs ${
          color === "mint" ? "bg-[#90FCA6]" : "bg-[#FF6C5E]"
        }`}>
          {author.charAt(0)}
        </div>
        <div>
          <div className="font-bold text-sm text-slate-900">{author}</div>
          <div className="text-xs text-slate-500">{role}</div>
        </div>
      </div>
    </motion.div>
  )
}
