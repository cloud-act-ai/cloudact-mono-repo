"use client"

/**
 * Analytics Dashboard - v1
 * 
 * Team Collaboration:
 * - E1/E2: Dashboard UI structure
 * - E10: Chart components and visualizations
 * - E8: E2E test coverage
 * 
 * Features:
 * - Cost trend analysis
 * - Provider comparison
 * - Usage patterns
 * - Anomaly detection summary
 * - Custom report builder (future)
 */

import React, { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart,
  Activity,
  AlertTriangle,
  Download,
  Filter,
  Calendar,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCostData } from "@/contexts/cost-data-context"
import { DailyTrendChart, CostRingChart, getCategoryColor } from "@/components/charts"
import { TimeRangeFilter, CostSummaryGrid } from "@/components/costs"

// Analytics-specific types
interface AnalyticsInsight {
  id: string
  title: string
  description: string
  type: "cost_spike" | "savings_opportunity" | "trend" | "anomaly"
  severity: "info" | "warning" | "critical"
  value?: number
  percentChange?: number
  createdAt: Date
}

interface ProviderComparison {
  provider: string
  currentPeriod: number
  previousPeriod: number
  change: number
  changePercent: number
}

export default function AnalyticsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  
  const {
    totalCosts,
    isLoading,
    refresh,
    getFilteredTimeSeries,
    getFilteredProviderBreakdown,
    getFilteredCategoryBreakdown,
    filters,
    setUnifiedFilters,
  } = useCostData()

  const [activeTab, setActiveTab] = useState("overview")
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Get time series data for charts
  const trendData = useMemo(() => {
    const timeSeries = getFilteredTimeSeries()
    return timeSeries.map(point => ({
      date: point.date,
      label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: point.total,
    }))
  }, [getFilteredTimeSeries])

  // Get provider breakdown
  const providerData = useMemo(() => {
    return getFilteredProviderBreakdown()
  }, [getFilteredProviderBreakdown])

  // Get category breakdown for ring chart
  const categoryData = useMemo(() => {
    const breakdown = getFilteredCategoryBreakdown()
    return breakdown.map(cat => ({
      key: cat.category.toLowerCase(),
      name: cat.category,
      value: cat.total_cost,
      color: getCategoryColor(cat.category.toLowerCase() as "genai" | "cloud" | "subscription"),
    }))
  }, [getFilteredCategoryBreakdown])

  // Calculate insights (mock data for now - E3/E4 will build real API)
  const insights: AnalyticsInsight[] = useMemo(() => {
    const insights: AnalyticsInsight[] = []
    
    // Check for cost spikes
    if (trendData.length >= 2) {
      const lastValue = trendData[trendData.length - 1]?.value ?? 0
      const prevValue = trendData[trendData.length - 2]?.value ?? 0
      const change = prevValue > 0 ? ((lastValue - prevValue) / prevValue) * 100 : 0
      
      if (change > 20) {
        insights.push({
          id: "spike-1",
          title: "Cost Spike Detected",
          description: `Daily costs increased by ${change.toFixed(1)}% compared to previous day`,
          type: "cost_spike",
          severity: change > 50 ? "critical" : "warning",
          percentChange: change,
          createdAt: new Date(),
        })
      }
    }

    // Check for savings opportunities
    const lowUsageProviders = providerData.filter(p => p.total_cost < 10)
    if (lowUsageProviders.length > 0) {
      insights.push({
        id: "savings-1",
        title: "Potential Consolidation Opportunity",
        description: `${lowUsageProviders.length} providers have very low usage. Consider consolidating.`,
        type: "savings_opportunity",
        severity: "info",
        value: lowUsageProviders.reduce((sum, p) => sum + p.total_cost, 0),
        createdAt: new Date(),
      })
    }

    return insights
  }, [trendData, providerData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refresh()
    setIsRefreshing(false)
  }

  // Calculate total and changes
  const totalCost = useMemo(() => {
    return trendData.reduce((sum, d) => sum + d.value, 0)
  }, [trendData])

  const avgDailyCost = useMemo(() => {
    return trendData.length > 0 ? totalCost / trendData.length : 0
  }, [totalCost, trendData.length])

  return (
    <div className="console-page-inner">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-slate-700" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Deep insights into your cloud and AI spending patterns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeFilter
            value={filters.timeRange}
            onChange={(range) => setUnifiedFilters({ timeRange: range })}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Period Total</p>
                <p className="text-xl font-bold">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-[var(--cloudact-mint-dark)]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Daily Average</p>
                <p className="text-xl font-bold">${avgDailyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Providers</p>
                <p className="text-xl font-bold">{providerData.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Insights</p>
                <p className="text-xl font-bold">{insights.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost Trend</CardTitle>
                <CardDescription>Daily spending over selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <DailyTrendChart
                    title="Cost Trend"
                    data={trendData}
                    height={256}
                  />
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
                <CardDescription>Spending by category</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <CostRingChart
                    title="Category Breakdown"
                    segments={categoryData}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights Summary */}
          {insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Active Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {insights.slice(0, 3).map((insight) => (
                    <div
                      key={insight.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <Badge
                        variant={insight.severity === "critical" ? "destructive" : 
                                insight.severity === "warning" ? "default" : "secondary"}
                      >
                        {insight.type.replace("_", " ")}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {insight.title}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {insight.description}
                        </p>
                      </div>
                      {insight.percentChange && (
                        <div className="flex items-center gap-1 text-red-500">
                          <TrendingUp className="w-4 h-4" />
                          <span className="font-medium">+{insight.percentChange.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Trend Analysis</CardTitle>
              <CardDescription>
                Analyze spending patterns over time with rolling averages and predictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DailyTrendChart
                title="Detailed Trend Analysis"
                data={trendData}
                height={400}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Provider Comparison</CardTitle>
              <CardDescription>
                Compare costs across all your cloud and AI providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {providerData
                  .sort((a, b) => b.total_cost - a.total_cost)
                  .map((provider, index) => (
                    <div
                      key={provider.provider}
                      className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <span className="w-6 text-center text-gray-400 font-medium">
                        #{index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {provider.provider}
                        </p>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                          <div
                            className="bg-[var(--cloudact-mint)] h-2 rounded-full"
                            style={{
                              width: `${(provider.total_cost / (providerData[0]?.total_cost || 1)) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">
                        ${provider.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle>All Insights</CardTitle>
              <CardDescription>
                AI-powered insights and recommendations for cost optimization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {insights.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No insights available for the selected period.</p>
                  <p className="text-sm mt-1">Try selecting a longer time range.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <div
                      key={insight.id}
                      className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Badge
                            variant={insight.severity === "critical" ? "destructive" : 
                                    insight.severity === "warning" ? "default" : "secondary"}
                          >
                            {insight.severity}
                          </Badge>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {insight.title}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {insight.description}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
