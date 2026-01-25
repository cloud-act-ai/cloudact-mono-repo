"use client"

import { ArrowRight } from "lucide-react"

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Connect",
      desc: "Connect your AWS, Azure, or GCP accounts via a secure, read-only role. No agents required for cloud billing.",
      action: "Takes ~5 mins"
    },
    {
      num: "02",
      title: "Analyze",
      desc: "Our engine ingests 12 months using CUR data and unifies it with OpenAI/Datadog usage logs automatically.",
      action: "Instant Backfill"
    },
    {
      num: "03",
      title: "Optimize",
      desc: "Get actionable resource rightsizing recommendations and anomaly alerts pushed to Slack immediately.",
      action: "Start Saving"
    },
  ]

  return (
    <section className="py-24 bg-slate-50">
       <div className="container px-4 mx-auto max-w-7xl">
         <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How it works</h2>
            <p className="text-xl text-slate-600">From zero to full observability in minutes.</p>
         </div>
         
         <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector Line (Desktop) */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-slate-200 -z-10" />
            
            {steps.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center">
                 <div className="w-24 h-24 bg-white border-4 border-slate-100 rounded-full flex items-center justify-center text-3xl font-bold text-emerald-600 shadow-sm mb-6 z-10">
                    {step.num}
                 </div>
                 <h3 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h3>
                 <p className="text-slate-600 leading-relaxed mb-4 max-w-sm">{step.desc}</p>
                 <div className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wide">
                    {step.action}
                 </div>
              </div>
            ))}
         </div>
       </div>
    </section>
  )
}
