"use client"

import { useState, useEffect } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { DollarSign } from "lucide-react"

const data = [
  { date: "Dec 01", amount: 1200 },
  { date: "Dec 02", amount: 1350 },
  { date: "Dec 03", amount: 1100 },
  { date: "Dec 04", amount: 1600 },
  { date: "Dec 05", amount: 1450 },
  { date: "Dec 06", amount: 1800 },
  { date: "Dec 07", amount: 1700 },
]

export function CostChart() {
  // Wait for mount to ensure container has dimensions
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <div className="metric-card h-full min-h-[300px] flex flex-col">
      <div className="metric-card-header">
        <div className="metric-card-label metric-card-label-coral">
          <DollarSign className="h-[18px] w-[18px]" />
          <span>Spending Trend</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="text-xs font-semibold text-[var(--cloudact-coral)] bg-[var(--cloudact-coral)]/10 px-2 py-1 rounded-md">
             +12.5%
           </div>
        </div>
      </div>

      {/* Fixed height container to prevent Recharts dimension errors */}
      <div className="flex-1 w-full mt-2" style={{ minHeight: 200 }}>
        {isMounted && (
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--cloudact-coral)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--cloudact-coral)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E5EA" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#8E8E93" }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#8E8E93" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
                cursor={{ stroke: "var(--cloudact-coral)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="var(--cloudact-coral)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorAmount)"
                activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2, fill: "var(--cloudact-coral)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
