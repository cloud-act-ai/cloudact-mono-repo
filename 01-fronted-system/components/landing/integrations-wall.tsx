"use client"

// Image import reserved for future integration icons
// import Image from "next/image"

export function IntegrationsWall() {
  const categories = [
    { title: "Cloud Providers", icons: ["aws", "azure", "gcp", "oracle"] },
    { title: "AI Models", icons: ["openai", "anthropic", "cohere", "huggingface"] },
    { title: "Monitoring", icons: ["datadog", "prometheus", "grafana", "newrelic"] },
    { title: "Communication", icons: ["slack", "teams", "pagerduty", "discord"] },
  ]

  return (
    <div className="py-24 bg-white">
      <div className="container px-4 mx-auto max-w-7xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">Connects with everything you use</h2>
          <p className="text-xl text-slate-600">
            Zero-friction setup. We integrate directly with your existing billing accounts, 
            Kubernetes clusters, and observability tools.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
           {categories.map((cat, i) => (
             <div key={i} className="flex flex-col items-center space-y-6">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{cat.title}</h3>
                <div className="grid grid-cols-2 gap-4 w-full max-w-[200px]">
                   {cat.icons.map((icon) => (
                      <div key={icon} className="aspect-square bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 group">
                         {/* Using simple text placeholders if images missing, ideally actual SVGs */}
                         <span className="text-xs font-bold text-slate-300 group-hover:text-slate-600 capitalize">{icon}</span>
                      </div>
                   ))}
                </div>
             </div>
           ))}
        </div>
        
        <div className="mt-16 text-center">
           <a href="/integrations" className="inline-flex items-center text-emerald-600 font-semibold hover:text-emerald-700 hover:underline">
             See all 50+ integrations &rarr;
           </a>
        </div>
      </div>
    </div>
  )
}
