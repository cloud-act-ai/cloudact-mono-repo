"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BarChart3, Brain, Search, Zap } from "lucide-react"

export function FeatureTabs() {
  const [activeTab, setActiveTab] = useState("allocation")

  const tabs = [
    { id: "allocation", label: "Cost Allocation", icon: BarChart3, color: "mint" },
    { id: "anomalies", label: "Anomaly Detection", icon: Zap, color: "coral" },
    { id: "genai", label: "GenAI Tracing", icon: Brain, color: "coral" },
    { id: "k8s", label: "Kubernetes Rightsizing", icon: Search, color: "mint" },
  ]

  const features = {
    allocation: {
      title: "100% Cost Visibility & Allocation",
      description: "Stop manually tagging resources. Our engine automatically allocates 99.8% of your cloud spend to specific teams, products, and features using AI-driven heuristics.",
      stats: [
        { label: "Unallocated Spend", value: "< 0.2%" },
        { label: "Tagging Coverage", value: "100%" },
        { label: "Setup Time", value: "15 min" },
      ]
    },
    anomalies: {
      title: "Catch Spikes Before the Invoice",
      description: "Real-time anomaly detection alerts you instantly via Slack or PagerDuty when cost spikes occur. Prevent runaway jobs and zombie resources.",
      stats: [
        { label: "Detection Speed", value: "< 5 min" },
        { label: "False Positives", value: "Low" },
        { label: "Savings/Month", value: "~12%" },
      ]
    },
    genai: {
      title: "Trace Every Token to a Customer",
      description: "The first FinOps platform built for the AI era. Track token usage, model variants (GPT-4 vs 3.5), and vector DB costs per tenant.",
      stats: [
        { label: "Model Coverage", value: "All" },
        { label: "Token Accuracy", value: "99.9%" },
        { label: "Unit Metrics", value: "Cost/Req" },
      ]
    },
    k8s: {
      title: "Automated K8s Efficiency",
      description: "Right-size your pods and nodes automatically. We analyze historical usage to recommend the perfect request/limit settings.",
      stats: [
        { label: "Avg Cost Reduction", value: "35%" },
        { label: "Implementation", value: "1-Click" },
        { label: "Engine", value: "Custom" },
      ]
    }
  }

  const activeFeature = features[activeTab as keyof typeof features]
  const activeTabConfig = tabs.find(t => t.id === activeTab)

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      {/* TABS HEADER */}
      <div className="flex flex-wrap justify-center gap-2 mb-12">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 border ${
              activeTab === tab.id
                ? "bg-[#90FCA6] border-[#90FCA6] text-slate-900 shadow-lg shadow-[#90FCA6]/30"
                : "bg-white border-slate-200 text-slate-600 hover:border-[#90FCA6]/50"
            }`}
          >
            <tab.icon className={`w-4 h-4 ${
              activeTab === tab.id
                ? "text-slate-900"
                : (tab.color === "mint" ? "text-[#90FCA6]" : "text-[#FF6C5E]")
            }`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* FEATURE CONTENT */}
      <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 overflow-hidden relative group">
        {/* Background accent */}
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px] -mr-32 -mt-32 pointer-events-none ${
          activeTabConfig?.color === "mint" ? "bg-[#90FCA6]/10" : "bg-[#FF6C5E]/10"
        }`} />

        <div className="grid lg:grid-cols-2 gap-12 items-center relative z-10">
          {/* LEFT TEXT */}
          <div className="space-y-8">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-4">{activeFeature.title}</h3>
              <p className="text-base text-slate-600 leading-relaxed mb-8">{activeFeature.description}</p>

              <div className="grid grid-cols-3 gap-6">
                {activeFeature.stats.map((stat, i) => (
                  <div key={i} className="space-y-1">
                    <p className={`text-xl font-bold font-mono ${
                      activeTabConfig?.color === "mint" ? "text-emerald-600" : "text-[#FF6C5E]"
                    }`}>{stat.value}</p>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* RIGHT VISUAL MOCK */}
          <motion.div
            key={`${activeTab}-visual`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="relative"
          >
            {/* Mock UI Container */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-2 aspect-[4/3] flex flex-col overflow-hidden">
              {/* Mock Header */}
              <div className="h-8 border-b border-slate-100 flex items-center gap-2 px-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#90FCA6]/40" />
                <div className="w-2 h-2 rounded-full bg-[#90FCA6]/30" />
                <div className="w-2 h-2 rounded-full bg-[#90FCA6]/20" />
              </div>
              {/* Mock Content Body */}
              <div className="flex-1 bg-white rounded-lg p-4 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                {activeTab === 'allocation' && <MockAllocation />}
                {activeTab === 'anomalies' && <MockAnomalies />}
                {activeTab === 'genai' && <MockGenAI />}
                {activeTab === 'k8s' && <MockK8s />}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// Visual Mocks using mint/coral colors
function MockAllocation() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-full max-w-[300px] h-[200px] relative">
        {/* Pie Chart */}
        <div className="absolute inset-0 border-[20px] border-[#90FCA6]/30 rounded-full" />
        <div className="absolute inset-0 border-[20px] border-[#90FCA6]/60 rounded-full" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-2xl font-bold text-slate-800">100%</div>
          <div className="text-xs text-slate-500">Allocated</div>
        </div>
      </div>
    </div>
  )
}

function MockAnomalies() {
  return (
    <div className="w-full h-full flex flex-col justify-end pb-4 px-4 space-y-2">
      {/* Spike Chart */}
      <div className="flex items-end space-x-2 h-[150px]">
        {[40, 35, 45, 30, 100, 40, 35].map((h, i) => (
          <div key={i} className={`flex-1 rounded-t-sm ${h > 80 ? 'bg-[#FF6C5E] animate-pulse' : 'bg-[#90FCA6]/30'}`} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm flex items-center gap-3">
        <div className="p-2 bg-[#FF6C5E]/15 text-[#FF6C5E] rounded-md"><Zap className="w-4 h-4" /></div>
        <div>
          <div className="text-sm font-bold text-slate-900">Spike Detected</div>
          <div className="text-xs text-slate-500">+240% cost increase in last hour</div>
        </div>
      </div>
    </div>
  )
}

function MockGenAI() {
  return (
    <div className="space-y-3 pt-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-white border border-[#90FCA6]/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FF6C5E]/15 rounded-md flex items-center justify-center text-[#FF6C5E] font-bold text-xs">AI</div>
            <div className="space-y-1">
              <div className="h-2 w-20 bg-[#90FCA6]/30 rounded" />
              <div className="h-2 w-12 bg-[#90FCA6]/15 rounded" />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-slate-700">$0.004</div>
            <div className="text-[10px] text-slate-400">340 tokens</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MockK8s() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        <div className="p-4 bg-white border border-slate-200 rounded-lg text-center space-y-2 opacity-50">
          <div className="text-xs text-slate-400">Current (Large)</div>
          <div className="h-12 w-12 mx-auto bg-[#FF6C5E]/20 rounded-md" />
          <div className="text-sm font-mono text-slate-600">$140/mo</div>
        </div>
        <div className="p-4 bg-[#90FCA6]/10 border-2 border-[#90FCA6] rounded-lg text-center space-y-2 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#90FCA6] text-slate-900 text-[10px] font-semibold px-2 py-0.5 rounded-full">Recommended</div>
          <div className="text-xs text-emerald-700">Optimized (Medium)</div>
          <div className="h-8 w-8 mx-auto bg-[#90FCA6]/30 rounded-md my-2" />
          <div className="text-sm font-mono text-emerald-800">$65/mo</div>
        </div>
      </div>
    </div>
  )
}
