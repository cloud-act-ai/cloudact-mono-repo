"use client"

import React, { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Cloud,
  Sparkles,
  PiggyBank,
  Play,
  Settings,
  BarChart3,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Zap,
  Users,
  Database,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface MetricCardProps {
  title: string
  value: string
  change?: string
  trend?: "up" | "down" | "neutral"
  icon: React.ReactNode
  color: "teal" | "coral" | "purple" | "blue"
}

function MetricCard({ title, value, change, trend, icon, color }: MetricCardProps) {
  // Use CSS utility classes from globals.css for brand colors
  const colorClasses = {
    teal: "bg-gradient-mint",
    coral: "bg-gradient-coral",
    purple: "bg-gradient-blue",
    blue: "bg-gradient-blue",
  }

  const iconColorClasses = {
    teal: "icon-container-mint",
    coral: "icon-container-coral",
    purple: "icon-container-blue",
    blue: "icon-container-blue",
  }

  return (
    <Card className={`relative overflow-hidden border ${colorClasses[color]} group`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
              {change && (
                <div className="flex items-center gap-1.5">
                  {trend === "up" && <TrendingUp className="h-4 w-4 text-mint-dark" />}
                  {trend === "down" && <TrendingDown className="h-4 w-4 text-coral" />}
                  <span
                    className={`text-sm font-semibold ${
                      trend === "up"
                        ? "text-mint-dark"
                        : trend === "down"
                        ? "text-coral"
                        : "text-muted-foreground"
                    }`}
                  >
                    {change}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconColorClasses[color]} shadow-lg transition-transform duration-200 group-hover:scale-110`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ActivityItem {
  id: string
  type: "pipeline" | "integration" | "cost" | "alert"
  title: string
  description: string
  timestamp: string
  status: "success" | "warning" | "error" | "info"
}

interface QuickAction {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  color: "teal" | "coral" | "purple"
}

export default function DashboardPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const [greeting, setGreeting] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting("Good morning")
    else if (hour < 18) setGreeting("Good afternoon")
    else setGreeting("Good evening")

    // Simulate data loading
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [])

  // Mock data - replace with real data fetching
  const recentActivity: ActivityItem[] = [
    {
      id: "1",
      type: "pipeline",
      title: "GCP Cost Pipeline",
      description: "Successfully processed 1,234 cost records",
      timestamp: "2 hours ago",
      status: "success",
    },
    {
      id: "2",
      type: "integration",
      title: "OpenAI Integration",
      description: "API key validated and connected",
      timestamp: "5 hours ago",
      status: "success",
    },
    {
      id: "3",
      type: "cost",
      title: "Cost Spike Detected",
      description: "GenAI costs increased 23% this week",
      timestamp: "1 day ago",
      status: "warning",
    },
    {
      id: "4",
      type: "pipeline",
      title: "AWS Cost Pipeline",
      description: "Failed to fetch billing data",
      timestamp: "2 days ago",
      status: "error",
    },
  ]

  const quickActions: QuickAction[] = [
    {
      title: "Run Pipeline",
      description: "Execute data pipelines to sync costs",
      href: `/${orgSlug}/pipelines`,
      icon: <Play className="h-5 w-5" />,
      color: "teal",
    },
    {
      title: "View Analytics",
      description: "Deep dive into cost trends",
      href: `/${orgSlug}/cost-dashboards/overview`,
      icon: <BarChart3 className="h-5 w-5" />,
      color: "purple",
    },
    {
      title: "Manage Settings",
      description: "Configure integrations and team",
      href: `/${orgSlug}/settings/organization`,
      icon: <Settings className="h-5 w-5" />,
      color: "coral",
    },
  ]

  const integrationStatus = [
    { name: "Google Cloud", status: "connected", color: "success" as const },
    { name: "OpenAI", status: "connected", color: "success" as const },
    { name: "AWS", status: "pending", color: "warning" as const },
    { name: "Azure", status: "not_connected", color: "outline" as const },
  ]

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "pipeline":
        return <Database className="h-4 w-4" />
      case "integration":
        return <Zap className="h-4 w-4" />
      case "cost":
        return <DollarSign className="h-4 w-4" />
      case "alert":
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getActivityStatusColor = (status: ActivityItem["status"]) => {
    switch (status) {
      case "success":
        return "bg-[#90FCA6]/10 text-[#1a7a3a] border-[#90FCA6]/20"
      case "warning":
        return "bg-[#FF6C5E]/10 text-[#FF6C5E] border-[#FF6C5E]/20"
      case "error":
        return "bg-red-500/10 text-red-600 border-red-500/20"
      case "info":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="mb-10">
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse"></div>
          <div className="h-5 w-96 bg-slate-100 rounded animate-pulse mt-2"></div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome Header */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          {greeting}
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Here&#39;s what&#39;s happening with your cloud costs today.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Spend (MTD)"
          value="$12,458"
          change="+12.5% vs last month"
          trend="up"
          icon={<DollarSign className="h-6 w-6" />}
          color="teal"
        />
        <MetricCard
          title="GenAI Costs"
          value="$3,245"
          change="+23.4% vs last month"
          trend="up"
          icon={<Sparkles className="h-6 w-6" />}
          color="purple"
        />
        <MetricCard
          title="Cloud Infrastructure"
          value="$9,213"
          change="+8.2% vs last month"
          trend="up"
          icon={<Cloud className="h-6 w-6" />}
          color="blue"
        />
        <MetricCard
          title="Savings Identified"
          value="$1,847"
          change="This month"
          trend="neutral"
          icon={<PiggyBank className="h-6 w-6" />}
          color="coral"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cost Trend Chart - Larger column */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[20px] font-bold text-slate-900">Cost Trends</CardTitle>
                <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                  <button className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Placeholder for chart */}
              <div className="flex h-[280px] items-center justify-center rounded-xl bg-gradient-to-br from-[#90FCA6]/5 to-[#FF6C5E]/5 border border-border">
                <div className="text-center space-y-3">
                  <Activity className="h-12 w-12 mx-auto text-[#6EE890]" />
                  <div className="space-y-1">
                    <p className="text-[15px] font-semibold text-slate-900">
                      Cost trend visualization
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Chart component will be integrated here
                    </p>
                  </div>
                  <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                    <button className="inline-flex items-center gap-2 h-11 px-6 bg-[#90FCA6] text-[#000000] text-[15px] font-semibold rounded-xl hover:bg-[#B8FDCA] transition-colors shadow-sm">
                      <BarChart3 className="h-4 w-4" />
                      Open Analytics
                    </button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Integration Status - Smaller column */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-[20px] font-bold text-slate-900">Integrations</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {integrationStatus.map((integration) => (
                  <div
                    key={integration.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-white to-[#90FCA6]/5 border border-border hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#90FCA6]/10">
                        <Cloud className="h-4 w-4 text-[#1a7a3a]" />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">
                        {integration.name}
                      </span>
                    </div>
                    <Badge variant={integration.color} className="text-[11px]">
                      {integration.status === "connected"
                        ? "Connected"
                        : integration.status === "pending"
                        ? "Pending"
                        : "Not Connected"}
                    </Badge>
                  </div>
                ))}
                <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                  <button className="w-full mt-2 inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#90FCA6]/5 text-[#1a7a3a] text-[15px] font-semibold rounded-xl hover:bg-[#90FCA6]/10 transition-colors border border-[#90FCA6]/20">
                    Manage Integrations
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-4">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map((action) => {
            const colorClasses = {
              teal: "from-[#90FCA6]/10 to-[#90FCA6]/5 border-[#90FCA6]/20 hover:shadow-[0_8px_24px_rgba(144,252,166,0.15)]",
              coral: "from-[#FF6C5E]/10 to-[#FF6C5E]/5 border-[#FF6C5E]/20 hover:shadow-[0_8px_24px_rgba(255,108,94,0.15)]",
              purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:shadow-[0_8px_24px_rgba(168,85,247,0.15)]",
            }

            const iconColorClasses = {
              teal: "bg-[#90FCA6] text-[#1a7a3a]",
              coral: "bg-[#FF6C5E] text-white",
              purple: "bg-purple-500 text-white",
            }

            return (
              <Link key={action.title} href={action.href}>
                <Card
                  className={`group cursor-pointer transition-all duration-300 bg-gradient-to-br border ${colorClasses[action.color]} hover:-translate-y-1`}
                >
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconColorClasses[action.color]} shadow-lg transition-transform duration-200 group-hover:scale-110`}
                      >
                        {action.icon}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-[17px] font-bold text-slate-900">{action.title}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-4">Recent Activity</h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 hover:bg-[#90FCA6]/5 transition-colors"
                >
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${getActivityStatusColor(
                      activity.status
                    )}`}
                  >
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-[15px] font-semibold text-slate-900">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                      </div>
                      <Badge
                        variant={activity.status === "success" ? "success" : activity.status === "warning" ? "warning" : "destructive"}
                        className="text-[10px] flex-shrink-0"
                      >
                        {activity.status === "success" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {activity.status === "warning" && <AlertCircle className="h-3 w-3 mr-1" />}
                        {activity.status === "error" && <AlertCircle className="h-3 w-3 mr-1" />}
                        {activity.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {activity.timestamp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-4 bg-[#90FCA6]/5">
              <Link href={`/${orgSlug}/pipelines`}>
                <button className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                  View All Activity
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom CTA Section */}
      <Card className="relative overflow-hidden border-2 border-[#90FCA6]/20 bg-gradient-to-br from-[#90FCA6]/5 via-white to-[#FF6C5E]/5">
        <CardContent className="p-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Users className="h-5 w-5 text-[#6EE890]" />
                <h3 className="text-[20px] font-bold text-slate-900">Invite Your Team</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Collaborate on cost optimization with your team members
              </p>
            </div>
            <Link href={`/${orgSlug}/settings/members`}>
              <button className="inline-flex items-center gap-2 h-12 px-8 bg-[#90FCA6] text-[#000000] text-[15px] font-semibold rounded-xl hover:bg-[#B8FDCA] transition-all shadow-lg hover:shadow-xl">
                <Users className="h-5 w-5" />
                Manage Team
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
