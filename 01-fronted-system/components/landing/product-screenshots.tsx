"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart3,
  Brain,
  Zap,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Plug,
  CreditCard,
  Filter,
} from "lucide-react"

// Product screenshot data - using mint and coral colors only
const screenshots = [
  {
    id: "dashboard",
    title: "Executive Dashboard",
    description: "Get a bird's-eye view of your entire cloud and AI spend. Real-time metrics, trends, and anomalies at a glance.",
    icon: BarChart3,
    color: "mint",
  },
  {
    id: "genai",
    title: "GenAI Cost Intelligence",
    description: "Track every token across OpenAI, Anthropic, and Gemini. Lightning-fast analytics at enterprise scale.",
    icon: Brain,
    color: "coral",
  },
  {
    id: "pipelines",
    title: "Pipeline Runs",
    description: "Monitor your data pipelines in real-time. Enterprise-grade reliability and performance you can trust.",
    icon: GitBranch,
    color: "mint",
  },
  {
    id: "integrations",
    title: "50+ Integrations",
    description: "Connect all your cloud providers, AI platforms, and SaaS tools in minutes. Native multi-cloud support.",
    icon: Plug,
    color: "mint",
  },
  {
    id: "saas",
    title: "SaaS Cost Governance",
    description: "Discover shadow IT and unused licenses across ChatGPT Team, GitHub Copilot, Datadog, and more.",
    icon: CreditCard,
    color: "coral",
  },
  {
    id: "anomaly",
    title: "AI Anomaly Detection",
    description: "AI-powered alerts catch spending anomalies before they become expensive. Intelligent cost protection.",
    icon: Zap,
    color: "coral",
  },
]

// High-fidelity dashboard mockup component
function DashboardMockup({ activeId }: { activeId: string }) {
  return (
    <div className="relative w-full h-full bg-[#0F172A] rounded-xl overflow-hidden border border-slate-700/50">
      {/* Header Bar */}
      <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-[#0F172A]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500/50" />
          </div>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <span className="text-xs text-[#90FCA6] font-medium">cloudact.ai</span>
          <span className="text-slate-600">/</span>
          <span className="text-xs text-slate-400">{activeId}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-400 border border-slate-700">
            Last 30 days
          </div>
          <div className="w-7 h-7 rounded-full bg-[#90FCA6]/20 flex items-center justify-center text-[#90FCA6] text-[10px] font-bold">
            GK
          </div>
        </div>
      </div>

      {/* Content based on active screenshot */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="p-4 h-[calc(100%-3rem)]"
        >
          {activeId === "dashboard" && <ExecutiveDashboardContent />}
          {activeId === "genai" && <GenAICostContent />}
          {activeId === "pipelines" && <PipelinesContent />}
          {activeId === "integrations" && <IntegrationsContent />}
          {activeId === "saas" && <SaaSContent />}
          {activeId === "anomaly" && <AnomalyContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ExecutiveDashboardContent() {
  const chartData = [45, 52, 48, 65, 55, 42, 38, 45, 50, 48, 42, 35, 38, 42, 45]
  const avgValue = chartData.reduce((a, b) => a + b, 0) / chartData.length

  return (
    <div className="space-y-3 h-full">
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total YTD Spend", value: "$145,203", trend: "-12.5%", positive: true },
          { label: "This Month", value: "$18,450", trend: "-8.3%", positive: true },
          { label: "Forecasted (EOM)", value: "$21,000", trend: "+2.1%", positive: false },
          { label: "Active Anomalies", value: "3", trend: "2 Critical", positive: null },
        ].map((m, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
            <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">{m.label}</p>
            <p className="text-base font-bold text-white font-mono">{m.value}</p>
            <p className={`text-[9px] ${m.positive === true ? 'text-[#90FCA6]' : m.positive === false ? 'text-[#FF6C5E]' : 'text-amber-500'}`}>
              {m.trend}
            </p>
          </div>
        ))}
      </div>

      {/* Chart Area */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-3 flex-1">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-300 font-medium">Daily Cost Trend</p>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-[9px] text-slate-400">
              <Filter className="w-2.5 h-2.5" />
              <span>All Services</span>
            </div>
          </div>
          <div className="flex gap-1.5 text-[9px]">
            <span className="px-2 py-0.5 bg-[#90FCA6]/20 text-[#90FCA6] rounded border border-[#90FCA6]/30">Cloud</span>
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded border border-purple-500/30">GenAI</span>
            <span className="px-2 py-0.5 bg-[#FF6C5E]/20 text-[#FF6C5E] rounded border border-[#FF6C5E]/30">SaaS</span>
          </div>
        </div>

        {/* Chart */}
        <div className="relative h-28">
          {/* Average Line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-blue-400/50 z-10"
            style={{ top: `${100 - avgValue}%` }}
          >
            <span className="absolute -top-2 right-0 text-[8px] text-blue-400 bg-slate-900 px-1 rounded">
              Avg: ${Math.round(avgValue * 10)}
            </span>
          </div>

          {/* Bars */}
          <div className="flex items-end gap-0.5 h-full">
            {chartData.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.6, delay: i * 0.03 }}
                className="flex-1 bg-gradient-to-t from-[#90FCA6]/20 to-[#90FCA6]/60 rounded-t border border-[#90FCA6]/30 hover:from-[#90FCA6]/30 hover:to-[#90FCA6]/80 transition-colors relative"
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#90FCA6] shadow-[0_0_4px_#90FCA6]" />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex justify-between mt-1.5 text-[8px] text-slate-600">
          <span>Jan 1</span>
          <span>Jan 8</span>
          <span>Jan 15</span>
        </div>
      </div>

      {/* Bottom Table */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-2">
        <div className="flex justify-between items-center mb-1.5">
          <p className="text-[10px] text-slate-400">Top Cost Drivers</p>
          <span className="text-[8px] text-slate-500">Real-time analytics</span>
        </div>
        {[
          { name: "gpt-4-turbo", type: "OpenAI", cost: "$420.50", trend: "+12%" },
          { name: "compute-engine-prod", type: "GCP", cost: "$315.30", trend: "-8%" },
          { name: "ec2-instances-us", type: "AWS", cost: "$180.90", trend: "+5%" },
        ].map((r, i) => (
          <div key={i} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${r.trend.startsWith('+') ? 'bg-[#FF6C5E]' : 'bg-[#90FCA6]'}`} />
              <span className="text-[10px] text-slate-300 font-mono">{r.name}</span>
              <span className="text-[8px] text-slate-600">{r.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[8px] ${r.trend.startsWith('+') ? 'text-[#FF6C5E]' : 'text-[#90FCA6]'}`}>{r.trend}</span>
              <span className="text-[10px] text-slate-300 font-medium">{r.cost}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenAICostContent() {
  const tokenData = [30, 45, 38, 55, 72, 48, 35, 42, 58, 65, 52, 48]

  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#FF6C5E]" />
          <span className="text-xs text-[#FF6C5E]/90 font-medium">GenAI Cost Intelligence</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px]">
          <Filter className="w-2.5 h-2.5 text-slate-400" />
          <span className="text-slate-400">Filter by Model</span>
        </div>
      </div>

      {/* Model Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { model: "GPT-4 Turbo", tokens: "2.4M", cost: "$72.50", provider: "OpenAI" },
          { model: "Claude 3.5", tokens: "1.8M", cost: "$54.20", provider: "Anthropic" },
          { model: "Gemini Pro", tokens: "1.2M", cost: "$28.40", provider: "Google" },
          { model: "Llama 3", tokens: "890K", cost: "$18.40", provider: "Meta" },
        ].map((m, i) => (
          <div key={i} className="bg-[#FF6C5E]/10 rounded-lg p-2 border border-[#FF6C5E]/20">
            <div className="flex items-center gap-1 mb-1">
              <Brain className="w-3 h-3 text-[#FF6C5E]" />
              <span className="text-[9px] text-[#FF6C5E]/90 font-medium truncate">{m.model}</span>
            </div>
            <p className="text-sm font-bold text-white font-mono">{m.cost}</p>
            <p className="text-[8px] text-[#FF6C5E]/70">{m.tokens} tokens</p>
          </div>
        ))}
      </div>

      {/* Token Usage Chart */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-3 flex-1">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-slate-300 font-medium">Token Usage Trend</p>
          <span className="text-[8px] text-slate-500">Real-time tracking</span>
        </div>
        <div className="relative h-20">
          <div className="absolute left-0 right-0 border-t border-dashed border-[#FF6C5E]/50 z-10" style={{ top: '50%' }}>
            <span className="absolute -top-2 right-0 text-[7px] text-[#FF6C5E] bg-slate-900 px-1 rounded">Avg</span>
          </div>
          <div className="flex items-end gap-0.5 h-full">
            {tokenData.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
                className="flex-1 bg-gradient-to-t from-[#FF6C5E]/30 to-[#FF6C5E] rounded-t"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Usage by Feature */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-2">
        <p className="text-[10px] text-slate-400 mb-2">Token Usage by Feature</p>
        <div className="space-y-1.5">
          {[
            { feature: "Chat API", usage: 85, cost: "$68.40" },
            { feature: "Embeddings", usage: 60, cost: "$24.20" },
            { feature: "Code Assistant", usage: 45, cost: "$36.80" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[9px] text-slate-400 w-24 truncate">{f.feature}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${f.usage}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="h-full bg-gradient-to-r from-[#FF6C5E]/80 to-[#FF6C5E] rounded-full"
                />
              </div>
              <span className="text-[9px] text-slate-300 font-mono w-12 text-right">{f.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PipelinesContent() {
  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[#90FCA6]" />
          <span className="text-xs text-[#90FCA6]/90 font-medium">Pipeline Runs</span>
        </div>
        <span className="px-1.5 py-0.5 bg-[#90FCA6]/20 text-[#90FCA6] text-[8px] rounded border border-[#90FCA6]/30">
          99.9% Uptime
        </span>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Runs", value: "1,247", status: "success" },
          { label: "Success Rate", value: "99.2%", status: "success" },
          { label: "Avg Duration", value: "2.4m", status: "neutral" },
          { label: "Failed Today", value: "3", status: "warning" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
            <p className="text-[8px] text-slate-500 uppercase">{s.label}</p>
            <p className={`text-sm font-bold font-mono ${s.status === 'success' ? 'text-[#90FCA6]' : s.status === 'warning' ? 'text-[#FF6C5E]' : 'text-white'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Pipeline Runs */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-3 flex-1">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-slate-300 font-medium">Recent Pipeline Runs</p>
          <div className="flex items-center gap-1 text-[8px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#90FCA6]" /> Success
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6C5E] ml-1" /> Failed
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { name: "cloud/gcp/cost/billing", status: "success", duration: "1m 45s", time: "2m ago" },
            { name: "genai/openai/cost", status: "success", duration: "2m 12s", time: "5m ago" },
            { name: "subscription/saas/costs", status: "failed", duration: "0m 34s", time: "8m ago" },
            { name: "genai/anthropic/usage", status: "success", duration: "1m 58s", time: "12m ago" },
            { name: "cloud/aws/cost/billing", status: "success", duration: "3m 21s", time: "15m ago" },
          ].map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded border border-slate-700/30"
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'success' ? 'bg-[#90FCA6]' : 'bg-[#FF6C5E] animate-pulse'}`} />
                <span className="text-[9px] text-slate-300 font-mono">{p.name}</span>
              </div>
              <div className="flex items-center gap-3 text-[8px]">
                <span className="text-slate-500">{p.duration}</span>
                <span className="text-slate-600">{p.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IntegrationsContent() {
  const integrations = [
    { name: "Google Cloud", icon: "GCP", status: "connected", lastSync: "2m ago" },
    { name: "AWS", icon: "AWS", status: "connected", lastSync: "3m ago" },
    { name: "Azure", icon: "AZ", status: "connected", lastSync: "5m ago" },
    { name: "OpenAI", icon: "OAI", status: "connected", lastSync: "1m ago" },
    { name: "Anthropic", icon: "ANT", status: "connected", lastSync: "4m ago" },
    { name: "Datadog", icon: "DD", status: "connected", lastSync: "8m ago" },
  ]

  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-[#90FCA6]" />
          <span className="text-xs text-[#90FCA6]/90 font-medium">50+ Integrations</span>
        </div>
        <span className="px-1.5 py-0.5 bg-[#90FCA6]/20 text-[#90FCA6] text-[8px] rounded border border-[#90FCA6]/30">
          All Connected
        </span>
      </div>

      {/* Google Cloud Featured */}
      <div className="bg-gradient-to-r from-[#90FCA6]/10 to-[#FF6C5E]/10 rounded-lg p-3 border border-[#90FCA6]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#90FCA6]">GCP</span>
            </div>
            <div>
              <p className="text-xs text-white font-medium">Google Cloud Platform</p>
              <p className="text-[8px] text-slate-400">Primary Cloud Provider</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-white font-mono">$45,230</p>
            <p className="text-[8px] text-[#90FCA6]">-8.2% this month</p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <span className="px-1.5 py-0.5 bg-[#90FCA6]/20 text-[#90FCA6] text-[7px] rounded">Compute</span>
          <span className="px-1.5 py-0.5 bg-[#FF6C5E]/20 text-[#FF6C5E] text-[7px] rounded">Storage</span>
          <span className="px-1.5 py-0.5 bg-[#90FCA6]/20 text-[#90FCA6] text-[7px] rounded">Network</span>
          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[7px] rounded">AI/ML</span>
        </div>
      </div>

      {/* Integration Grid */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-2 flex-1">
        <p className="text-[10px] text-slate-400 mb-2">Connected Services</p>
        <div className="grid grid-cols-3 gap-1.5">
          {integrations.map((int, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex items-center gap-1.5 p-1.5 bg-slate-800/50 rounded border border-slate-700/30"
            >
              <div className="w-5 h-5 bg-slate-700 rounded flex items-center justify-center">
                <span className="text-[7px] font-bold text-slate-300">{int.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-slate-300 truncate">{int.name}</p>
                <p className="text-[7px] text-[#90FCA6]">{int.lastSync}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SaaSContent() {
  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#FF6C5E]" />
          <span className="text-xs text-[#FF6C5E]/90 font-medium">SaaS Cost Governance</span>
        </div>
        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] rounded border border-amber-500/30">
          12 Unused Licenses
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total SaaS Spend", value: "$24,580", color: "white" },
          { label: "Active Tools", value: "47", color: "white" },
          { label: "Unused Licenses", value: "12", color: "#FF6C5E" },
          { label: "Potential Savings", value: "$3,240", color: "#90FCA6" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
            <p className="text-[8px] text-slate-500 uppercase">{s.label}</p>
            <p className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* SaaS Tools List */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-2 flex-1">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[10px] text-slate-400">SaaS Subscriptions</p>
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded text-[8px] text-slate-400">
            <Filter className="w-2 h-2" />
            Sort by Cost
          </div>
        </div>
        <div className="space-y-1">
          {[
            { name: "ChatGPT Team", cost: "$960", licenses: "48/50", status: "warning", waste: "$38" },
            { name: "GitHub Copilot", cost: "$570", licenses: "28/30", status: "ok", waste: "$38" },
            { name: "Datadog", cost: "$1,850", licenses: "18/20", status: "ok", waste: "$185" },
            { name: "Slack Pro", cost: "$420", licenses: "35/42", status: "warning", waste: "$70" },
            { name: "Figma", cost: "$180", licenses: "8/12", status: "critical", waste: "$60" },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded border border-slate-700/30"
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'ok' ? 'bg-[#90FCA6]' : s.status === 'warning' ? 'bg-amber-500' : 'bg-[#FF6C5E]'}`} />
                <span className="text-[9px] text-slate-300">{s.name}</span>
                <span className="text-[8px] text-slate-600">{s.licenses}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-[#FF6C5E]">-{s.waste}</span>
                <span className="text-[9px] text-slate-300 font-mono">{s.cost}/mo</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AnomalyContent() {
  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#FF6C5E]" />
          <span className="text-xs text-[#FF6C5E]/90 font-medium">AI Anomaly Detection</span>
        </div>
        <span className="px-1.5 py-0.5 bg-[#FF6C5E]/20 text-[#FF6C5E] text-[8px] rounded border border-[#FF6C5E]/30">
          ML-Powered
        </span>
      </div>

      {/* Alert Header */}
      <div className="bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 rounded-lg p-2.5 flex items-start gap-2">
        <Zap className="w-4 h-4 text-[#FF6C5E] mt-0.5" />
        <div>
          <p className="text-xs font-medium text-[#FF6C5E]">3 Active Anomalies Detected</p>
          <p className="text-[9px] text-slate-400">2 require immediate attention</p>
        </div>
      </div>

      {/* Anomaly List */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 flex-1 overflow-hidden">
        {[
          { resource: "embedding-service-prod", type: "AI/ML", spike: "+240%", severity: "critical", time: "15m ago" },
          { resource: "data-warehouse-queries", type: "Analytics", spike: "+180%", severity: "critical", time: "1h ago" },
          { resource: "gpt-4-turbo-preview", type: "OpenAI", spike: "+65%", severity: "warning", time: "3h ago" },
        ].map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="p-2 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${a.severity === 'critical' ? 'bg-[#FF6C5E] animate-pulse' : 'bg-amber-500'}`} />
                <div>
                  <p className="text-[10px] text-slate-200 font-mono">{a.resource}</p>
                  <p className="text-[8px] text-slate-500">{a.type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-[#FF6C5E]">{a.spike}</p>
                <p className="text-[8px] text-slate-500">{a.time}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart showing spike */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-2">
        <div className="flex justify-between items-center mb-1.5">
          <p className="text-[9px] text-slate-400">Cost Spike Timeline</p>
          <span className="text-[7px] text-slate-500">ML-powered detection</span>
        </div>
        <div className="flex items-end gap-0.5 h-16">
          {[20, 22, 25, 23, 24, 85, 30, 28, 25, 24].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={`flex-1 rounded-t ${i === 5 ? 'bg-[#FF6C5E] animate-pulse shadow-[0_0_8px_rgba(255,108,94,0.5)]' : 'bg-slate-600'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}


export function ProductScreenshots() {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeScreenshot = screenshots[activeIndex]

  const goNext = () => setActiveIndex((i) => (i + 1) % screenshots.length)
  const goPrev = () => setActiveIndex((i) => (i - 1 + screenshots.length) % screenshots.length)

  return (
    <section className="py-24 lg:py-32 bg-white relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-white" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#90FCA6]/5 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#FF6C5E]/5 rounded-full blur-[120px]" />

      <div className="container px-4 mx-auto max-w-7xl relative z-10">
        {/* Section Header */}
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
              See It In Action
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-4">
              Built for GenAI & Modern Cloud
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Track every <strong className="text-slate-900">LLM token</strong> and cloud resource with <strong className="text-slate-900">real-time GenAI analytics</strong> and intelligent anomaly detection.
            </p>
          </motion.div>
        </div>

        {/* Screenshot Display */}
        <div className="grid lg:grid-cols-5 gap-8 items-center">
          {/* Navigation Pills - Left */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <div className="flex lg:flex-col gap-3 justify-center">
              {screenshots.map((ss, i) => (
                <button
                  key={ss.id}
                  onClick={() => setActiveIndex(i)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
                    i === activeIndex
                      ? "bg-white border border-slate-200 shadow-lg"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <ss.icon className={`w-5 h-5 ${i === activeIndex ? (ss.color === "mint" ? "text-[#90FCA6]" : "text-[#FF6C5E]") : "text-slate-400"}`} />
                  <span className={`text-sm font-medium hidden lg:block ${i === activeIndex ? "text-slate-900" : "text-slate-500"}`}>
                    {ss.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Screenshot */}
          <div className="lg:col-span-4 order-1 lg:order-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              {/* Glow Effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#90FCA6]/20 via-[#90FCA6]/10 to-[#FF6C5E]/15 rounded-2xl blur-2xl opacity-60" />

              {/* Screenshot Container */}
              <div className="relative bg-slate-900 border border-slate-200 rounded-2xl shadow-2xl shadow-slate-300/30 overflow-hidden aspect-[16/10]">
                <DashboardMockup activeId={activeScreenshot.id} />
              </div>

              {/* Navigation Arrows */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-4 pointer-events-none">
                <button
                  onClick={goPrev}
                  className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors pointer-events-auto"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={goNext}
                  className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors pointer-events-auto"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>

            {/* Description */}
            <motion.div
              key={activeScreenshot.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center mt-8"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-2">{activeScreenshot.title}</h3>
              <p className="text-slate-600 max-w-lg mx-auto">{activeScreenshot.description}</p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
