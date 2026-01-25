"use client"

import { ShieldCheck, Lock, FileKey, Server } from "lucide-react"

export function SecuritySection() {
  return (
    <section className="py-20 bg-white border-y border-slate-100">
      <div className="container px-4 mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="md:w-1/2 space-y-6">
           <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider">
             <ShieldCheck className="w-3 h-3" />
             Enterprise Grade Security
           </div>
           <h2 className="text-3xl font-bold text-slate-900">Your data never leaves your cloud.</h2>
           <p className="text-lg text-slate-600 leading-relaxed">
             We operate with a <strong>Zero-Data-Retention</strong> policy. Our engine analyzes metadata via read-only roles and processes logs ephemerally. 
             We are SOC2 Type II compliant and ISO 27001 certified.
           </p>
           <ul className="space-y-3 pt-2">
             <li className="flex items-center gap-3 text-slate-700 font-medium">
               <CheckIcon /> Read-Only IAM Roles (Cross-Account)
             </li>
             <li className="flex items-center gap-3 text-slate-700 font-medium">
               <CheckIcon /> End-to-End Encryption (TLS 1.3)
             </li>
             <li className="flex items-center gap-3 text-slate-700 font-medium">
               <CheckIcon /> Single Sign-On (Okta, Azure AD)
             </li>
           </ul>
        </div>
        
        <div className="md:w-1/2">
           <div className="grid grid-cols-2 gap-4">
              <ComplianceBadge label="SOC 2 Type II" icon={<ShieldCheck size={32} />} />
              <ComplianceBadge label="ISO 27001" icon={<Lock size={32} />} />
              <ComplianceBadge label="GDPR Ready" icon={<FileKey size={32} />} />
              <ComplianceBadge label="HIPAA" icon={<Server size={32} />} />
           </div>
        </div>
      </div>
    </section>
  )
}

function ComplianceBadge({ label, icon }: { label: string, icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-xl hover:shadow-lg hover:border-emerald-200 hover:bg-white transition-all duration-300 group">
       <div className="text-slate-400 group-hover:text-emerald-500 transition-colors mb-3">
         {icon}
       </div>
       <span className="font-bold text-slate-700 group-hover:text-slate-900">{label}</span>
    </div>
  )
}

function CheckIcon() {
  return (
    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}
