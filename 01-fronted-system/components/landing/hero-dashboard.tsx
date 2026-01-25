"use client"

import { motion } from "framer-motion"
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Filter,
  Download,
  Calendar,
  ChevronDown,
  Search,
  Server,
  Database,
  Cpu
} from "lucide-react"

// Mock Data for the chart
const chartData = [1200, 1350, 1100, 950, 1400, 1200, 1100, 1050, 900, 850, 800, 750]

export function HeroDashboard() {
  return (
    <div className="relative w-full max-w-[1200px] mx-auto perspective-1000 group">
      {/* GLOW EFFECTS BEHIND */}
      <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 rounded-[2rem] blur-3xl opacity-50 group-hover:opacity-75 transition duration-1000" />
      
      {/* MAIN DASHBOARD CONTAINER */}
      <motion.div 
        initial={{ rotateX: 20, y: 100, opacity: 0 }}
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ duration: 1, type: "spring", stiffness: 50, damping: 20 }}
        className="relative bg-[#0F172A] border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px] md:h-[700px] w-full"
      >
        {/* HEADER */}
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-[#0F172A]">
           <div className="flex items-center gap-4">
             <div className="flex gap-2">
               <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
               <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
               <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
             </div>
             <div className="h-4 w-[1px] bg-slate-800 mx-2" />
             <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
               <span className="text-emerald-400">cloudact.ai</span>
               <span className="text-slate-600">/</span>
               <span>cost-explorer</span>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-md border border-slate-800 text-xs text-slate-400">
               <Calendar className="w-3.5 h-3.5" />
               <span>Last 30 Days</span>
               <ChevronDown className="w-3 h-3 ml-1" />
             </div>
             <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-xs font-bold ring-2 ring-emerald-500/20">
               GK
             </div>
           </div>
        </div>

        {/* TOP METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 border-b border-slate-800 divide-y md:divide-y-0 md:divide-x divide-slate-800 bg-[#0F172A]/50">
          <MetricCard 
            label="Total YTD Spend" 
            value="$145,203.42" 
            trend="-12.5%" 
            trendUp={false} 
            color="emerald"
          />
          <MetricCard 
            label="Yesterday's Spend" 
            value="$1,240.18" 
            trend="-8.3%" 
            trendUp={false} 
            color="emerald"
            highlight
          />
          <MetricCard 
            label="Forecasted (EOM)" 
            value="$158,000.00" 
            trend="+2.1%" 
            trendUp={true} 
            color="blue"
          />
          <MetricCard 
            label="Anomalies Detected" 
            value="3" 
            subtext="2 Critical, 1 Warning"
            icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
            color="amber"
          />
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* SIDEBAR (Mini) */}
          <div className="w-16 border-r border-slate-800 bg-[#0F172A] hidden md:flex flex-col items-center py-6 gap-6">
             <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500"><TrendingUp className="w-5 h-5" /></div>
             <div className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition"><Server className="w-5 h-5" /></div>
             <div className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition"><Database className="w-5 h-5" /></div>
             <div className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition"><Cpu className="w-5 h-5" /></div>
          </div>

          {/* DASHBOARD CONTENT */}
          <div className="flex-1 overflow-auto bg-[#0B1221] p-6 space-y-6">
             
             {/* CHART SECTION */}
             <div className="p-6 rounded-xl border border-slate-800 bg-[#0F172A]">
               <div className="flex items-center justify-between mb-6">
                 <div>
                   <h3 className="text-sm font-medium text-slate-200">Daily Cost Trend (AWS + OpenAI)</h3>
                   <p className="text-xs text-slate-500">Aggregated usage across all production environments</p>
                 </div>
                 <div className="flex gap-2">
                   <button className="p-1.5 hover:bg-slate-800 rounded text-slate-400"><Filter className="w-4 h-4" /></button>
                   <button className="p-1.5 hover:bg-slate-800 rounded text-slate-400"><Download className="w-4 h-4" /></button>
                 </div>
               </div>
               
               {/* FAKE CHART */}
               <div className="h-48 w-full flex items-end gap-2 px-2 pb-2 border-b border-l border-slate-800 relative">
                 {/* GRID LINES */}
                 <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                    <div className="w-full h-px bg-slate-500 dashed" />
                    <div className="w-full h-px bg-slate-500 dashed" />
                    <div className="w-full h-px bg-slate-500 dashed" />
                    <div className="w-full h-px bg-slate-500 dashed" />
                 </div>
                 
                 {/* BARS/LINES */}
                 {chartData.map((val, i) => (
                   <div key={i} className="flex-1 flex flex-col justify-end group/bar relative">
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${(val / 1500) * 100}%` }}
                        transition={{ duration: 1.5, delay: i * 0.05, ease: "easeOut" }}
                        className="w-full bg-gradient-to-t from-emerald-900/50 to-emerald-500 rounded-t-sm relative hover:from-emerald-800 hover:to-emerald-400 transition-colors"
                      >
                         <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 transition pointer-events-none whitespace-nowrap border border-slate-700">
                           ${val}
                         </div>
                      </motion.div>
                   </div>
                 ))}
               </div>
               <div className="flex justify-between mt-2 text-[10px] text-slate-600 px-2 font-mono">
                 <span>Jan 01</span>
                 <span>Jan 05</span>
                 <span>Jan 10</span>
                 <span>Jan 15</span>
                 <span>Jan 20</span>
                 <span>Jan 25</span>
               </div>
             </div>

             {/* RESOURCE TABLE */}
             <div className="p-6 rounded-xl border border-slate-800 bg-[#0F172A]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-slate-200">Top Cost Drivers</h3>
                  <div className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 flex items-center gap-2">
                    <Search className="w-3 h-3 text-slate-500" />
                    <span className="text-xs text-slate-500">Filter resources...</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <TableRow name="gpt-4-turbo-preview" type="OpenAI" cost="$420.50" change="+12%" status="active" />
                  <TableRow name="nat-gateway-us-east-1" type="AWS Networking" cost="$215.30" change="-5%" status="active" />
                  <TableRow name="db-prod-primary-xl" type="AWS RDS" cost="$180.90" change="0%" status="active" />
                  <TableRow name="cosmos-db-analytics" type="Azure" cost="$145.20" change="+2%" status="warning" />
                  <TableRow name="idle-instance-i3920" type="AWS EC2" cost="$89.40" change="0%" status="error" />
                </div>
             </div>

          </div>
        </div>
        
        {/* FLOATING ACTION NOTIFICATION */}
        <motion.div 
           initial={{ y: 50, opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           transition={{ delay: 2 }}
           className="absolute bottom-6 right-6 bg-slate-800 border border-slate-700 text-slate-200 p-4 rounded-lg shadow-xl flex items-start gap-3 max-w-sm z-50"
        >
           <div className="mt-1 p-1 bg-amber-500/10 rounded text-amber-500">
             <AlertTriangle className="w-4 h-4" />
           </div>
           <div>
             <h4 className="text-sm font-medium">Anomaly Detected</h4>
             <p className="text-xs text-slate-400 mt-1">Spike in <strong>OpenAI Token Usage</strong> detected 15m ago. Potential recursive loop in <code>eval-3</code>.</p>
             <div className="mt-2 flex gap-2">
                <button className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded">Investigate</button>
                <button className="text-xs text-slate-400 hover:text-white px-2 py-1">Dismiss</button>
             </div>
           </div>
        </motion.div>

      </motion.div>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  trend?: string
  trendUp?: boolean
  color?: string
  subtext?: string
  icon?: React.ReactNode
  highlight?: boolean
}

function MetricCard({ label, value, trend, trendUp, subtext, icon, highlight }: MetricCardProps) {
  return (
    <div className={`p-5 flex flex-col justify-between h-full ${highlight ? 'bg-slate-800/30' : ''}`}>
      <div className="flex justify-between items-start">
         <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</span>
         {icon}
      </div>
      <div className="mt-2">
         <div className="text-xl lg:text-2xl font-semibold text-slate-100 font-mono tracking-tight">{value}</div>
         {subtext ? (
           <div className="text-xs text-amber-500 mt-1">{subtext}</div>
         ) : (
           <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendUp ? 'text-rose-400' : 'text-emerald-400'}`}>
             {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
             {trend} <span className="text-slate-600 font-normal">vs last period</span>
           </div>
         )}
      </div>
    </div>
  )
}

interface TableRowProps {
  name: string
  type: string
  cost: string
  change: string
  status: 'active' | 'warning' | 'error'
}

function TableRow({ name, type, cost, change, status }: TableRowProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-lg group transition-colors cursor-pointer">
       <div className="flex items-center gap-3">
         <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
         <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-200 font-mono">{name}</span>
            <span className="text-[10px] text-slate-500">{type}</span>
         </div>
       </div>
       <div className="flex items-center gap-4">
          <div className="text-right">
             <div className="text-sm font-medium text-slate-300 ml-auto">{cost}</div>
             <div className={`text-[10px] ${change.startsWith('+') ? 'text-amber-500' : 'text-emerald-500'}`}>{change}</div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
       </div>
    </div>
  )
}
