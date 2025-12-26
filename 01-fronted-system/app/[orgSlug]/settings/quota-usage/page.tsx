"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Loader2,
  AlertCircle,
  Users,
  Plug,
  Zap,
  Clock,
  Calendar,
  CalendarDays,
  TrendingUp,
  Check,
} from "lucide-react"
import {
  getOrgQuotaLimits,
  type OrgQuotaLimits,
} from "@/actions/organization-locale"

export default function QuotaUsagePage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [quotaLimits, setQuotaLimits] = useState<OrgQuotaLimits | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = "Usage & Quotas | CloudAct.ai"
  }, [])

  const loadQuotaLimits = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getOrgQuotaLimits(orgSlug)
      if (result.success && result.quotaLimits) {
        setQuotaLimits(result.quotaLimits)
      } else {
        setError(result.error || "Failed to load quota information")
      }
    } catch {
      setError("Failed to load quota information")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void loadQuotaLimits()
  }, [loadQuotaLimits])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading quotas...</p>
        </div>
      </div>
    )
  }

  // Calculate usage percentages
  const seatUsage = quotaLimits && quotaLimits.seat_limit > 0
    ? Math.round((quotaLimits.team_members_count / quotaLimits.seat_limit) * 100)
    : 0
  const providerUsage = quotaLimits && quotaLimits.providers_limit > 0
    ? Math.round((quotaLimits.configured_providers_count / quotaLimits.providers_limit) * 100)
    : 0

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#90FCA6] to-[#B8FDCA] flex items-center justify-center flex-shrink-0 shadow-sm">
            <TrendingUp className="h-6 w-6 text-black" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold text-black tracking-tight leading-none">
              Usage & Quotas
            </h1>
            <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
              Monitor your plan usage and resource limits
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {quotaLimits && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="metric-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#1a7a3a]" />
              </div>
              <div>
                <p className="text-[28px] font-bold text-black leading-none tracking-tight">
                  {quotaLimits.team_members_count}
                </p>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                  of {quotaLimits.seat_limit > 0 ? quotaLimits.seat_limit : "∞"} seats
                </p>
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#8B5CF6]/15 flex items-center justify-center">
                <Plug className="h-6 w-6 text-[#8B5CF6]" />
              </div>
              <div>
                <p className="text-[28px] font-bold text-black leading-none tracking-tight">
                  {quotaLimits.configured_providers_count}
                </p>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                  of {quotaLimits.providers_limit > 0 ? quotaLimits.providers_limit : "∞"} integrations
                </p>
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center">
                <Check className="h-6 w-6 text-[#1a7a3a]" />
              </div>
              <div>
                <p className="text-[15px] text-slate-600 font-medium">Plan Status</p>
                <p className="text-[13px] text-[#1a7a3a] font-semibold mt-0.5">Active</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0" />
          <p className="text-[13px] font-medium text-[#FF6C5E]">{error}</p>
        </div>
      )}

      {quotaLimits && (
        <>
          {/* Resource Usage Section */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
                Resource Usage
              </h2>
            </div>

            <div className="console-table-card">
              {/* Team Members */}
              <div className="console-table-row group relative">
                <div
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[#90FCA6] opacity-60 group-hover:opacity-100 transition-opacity"
                />
                <div className="console-table-cell pl-5 py-5 pr-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-12 w-12 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Users className="h-6 w-6 text-[#1a7a3a]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-semibold text-black tracking-tight">
                          Team Members
                        </h3>
                        <p className="text-[13px] text-slate-500 mt-1">
                          Active members in your organization
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[24px] font-bold text-black tracking-tight">
                        {quotaLimits.team_members_count}
                        <span className="text-[15px] font-normal text-slate-500">
                          {" "}/ {quotaLimits.seat_limit > 0 ? quotaLimits.seat_limit : "∞"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {quotaLimits.seat_limit > 0 && (
                    <div className="ml-[64px]">
                      <div className="flex justify-between text-[12px] text-slate-500 mb-2">
                        <span>Usage</span>
                        <span className="font-semibold">{seatUsage}%</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            seatUsage >= 100
                              ? "bg-[#FF6C5E]"
                              : seatUsage >= 80
                                ? "bg-amber-500"
                                : "bg-[#90FCA6]"
                          }`}
                          style={{ width: `${Math.min(seatUsage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-slate-100"></div>

              {/* Integrations */}
              <div className="console-table-row group relative">
                <div
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "#8B5CF6" }}
                />
                <div className="console-table-cell pl-5 py-5 pr-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-12 w-12 rounded-2xl bg-[#8B5CF6]/15 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Plug className="h-6 w-6 text-[#8B5CF6]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-semibold text-black tracking-tight">
                          Integrations
                        </h3>
                        <p className="text-[13px] text-slate-500 mt-1">
                          Configured provider integrations
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[24px] font-bold text-black tracking-tight">
                        {quotaLimits.configured_providers_count}
                        <span className="text-[15px] font-normal text-slate-500">
                          {" "}/ {quotaLimits.providers_limit > 0 ? quotaLimits.providers_limit : "∞"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {quotaLimits.providers_limit > 0 && (
                    <div className="ml-[64px]">
                      <div className="flex justify-between text-[12px] text-slate-500 mb-2">
                        <span>Usage</span>
                        <span className="font-semibold">{providerUsage}%</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            providerUsage >= 100
                              ? "bg-[#FF6C5E]"
                              : providerUsage >= 80
                                ? "bg-amber-500"
                                : "bg-[#8B5CF6]"
                          }`}
                          style={{ width: `${Math.min(providerUsage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Pipeline Limits Section */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
                Pipeline Execution Limits
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Daily */}
              <div className="metric-card text-center">
                <div className="h-14 w-14 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Clock className="h-7 w-7 text-[#1a7a3a]" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Daily
                </p>
                <p className="text-[36px] font-bold text-black leading-none tracking-tight">
                  {quotaLimits.pipelines_per_day_limit > 0 ? quotaLimits.pipelines_per_day_limit : "∞"}
                </p>
                <p className="text-[13px] text-slate-500 mt-2">runs per day</p>
              </div>

              {/* Weekly */}
              <div className="metric-card text-center">
                <div className="h-14 w-14 rounded-2xl bg-[#8B5CF6]/15 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Calendar className="h-7 w-7 text-[#8B5CF6]" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Weekly
                </p>
                <p className="text-[36px] font-bold text-black leading-none tracking-tight">
                  {quotaLimits.pipelines_per_week_limit > 0 ? quotaLimits.pipelines_per_week_limit : "∞"}
                </p>
                <p className="text-[13px] text-slate-500 mt-2">runs per week</p>
              </div>

              {/* Monthly */}
              <div className="metric-card text-center">
                <div className="h-14 w-14 rounded-2xl bg-[#007AFF]/15 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <CalendarDays className="h-7 w-7 text-[#007AFF]" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Monthly
                </p>
                <p className="text-[36px] font-bold text-black leading-none tracking-tight">
                  {quotaLimits.pipelines_per_month_limit > 0 ? quotaLimits.pipelines_per_month_limit : "∞"}
                </p>
                <p className="text-[13px] text-slate-500 mt-2">runs per month</p>
              </div>
            </div>
          </section>

          {/* Info Footer */}
          <div className="metric-card bg-gradient-to-br from-slate-50 to-white">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#007AFF]/15 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Zap className="h-6 w-6 text-[#007AFF]" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-black mb-2">
                  About Your Quotas
                </h3>
                <ul className="text-[13px] text-slate-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-[#007AFF] mt-0.5">•</span>
                    <span>All limits are set based on your Stripe subscription plan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#007AFF] mt-0.5">•</span>
                    <span>Usage counters reset at the start of each day/week/month (UTC)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#007AFF] mt-0.5">•</span>
                    <span>Upgrade your plan to increase limits and unlock more resources</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {!quotaLimits && !error && (
        <div className="p-5 rounded-2xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#FF6C5E]/15 flex items-center justify-center flex-shrink-0 shadow-sm">
            <AlertCircle className="h-6 w-6 text-[#FF6C5E]" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-black">Unable to load quotas</h3>
            <p className="text-[13px] text-slate-600 mt-1">
              Please refresh the page to try again.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
