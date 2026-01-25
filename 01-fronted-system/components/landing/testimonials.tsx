"use client"

// Quote icon reserved for future design iteration
// import { Quote } from "lucide-react"

export function Testimonials() {
  return (
    <div className="grid md:grid-cols-3 gap-8">
       <Card 
         quote="We cut our OpenAI bill by 40% in the first week. The ability to see cost per request was a game changer for our engineering team."
         author="Sarah Jenkins"
         role="CTO, TechFlow"
         logo="/logos/customers/techflow.svg"
       />
       <Card 
         quote="Finally, a tool that developers actually want to use. It doesn't look like a spreadsheet from 2005. It's fast, intuitive, and accurate."
         author="Michael Chen"
         role="VP Engineering, DataScale"
         logo="/logos/customers/datascale.svg"
         featured
       />
       <Card 
         quote="The anomaly detection saved us from a $15k bill when a dev left a GPU cluster running over the weekend. Paid for itself instantly."
         author="Elena Rodriguez"
         role="DevOps Lead, Orbit"
         logo="/logos/customers/orbit.svg"
       />
    </div>
  )
}

interface CardProps {
  quote: string
  author: string
  role: string
  logo?: string
  featured?: boolean
}

function Card({ quote, author, role, featured }: CardProps) {
  return (
    <div className={`p-8 rounded-2xl border flex flex-col justify-between ${featured ? 'bg-slate-900 border-slate-800 text-white shadow-xl scale-105 z-10' : 'bg-white border-slate-100 text-slate-900 shadow-sm hover:shadow-md'}`}>
       <div className="space-y-6">
          <div className={`${featured ? 'text-emerald-400' : 'text-emerald-600'}`}>
             {[1,2,3,4,5].map(i => <span key={i}>★</span>)}
          </div>
          <p className={`text-lg font-medium leading-relaxed ${featured ? 'text-slate-200' : 'text-slate-700'}`}>
            "{quote}"
          </p>
       </div>
       <div className="mt-8 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 text-xs">
             {author.charAt(0)}
          </div>
          <div>
             <div className="font-bold text-sm">{author}</div>
             <div className={`text-xs ${featured ? 'text-slate-400' : 'text-slate-500'}`}>{role}</div>
          </div>
       </div>
    </div>
  )
}
