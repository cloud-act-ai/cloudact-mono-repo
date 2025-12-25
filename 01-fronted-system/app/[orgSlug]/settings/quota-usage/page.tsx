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
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Usage & Quotas
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Monitor your plan usage and resource limits
        </p>
      </div>

      {/* Stats Row */}
      {quotaLimits && (
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-mint/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-mint" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">
                {quotaLimits.team_members_count}
              </p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                of {quotaLimits.seat_limit > 0 ? quotaLimits.seat_limit : "∞"} seats
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200"></div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
              <Plug className="h-5 w-5 text-[#8B5CF6]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">
                {quotaLimits.configured_providers_count}
              </p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                of {quotaLimits.providers_limit > 0 ? quotaLimits.providers_limit : "∞"} integrations
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200"></div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-mint/10 flex items-center justify-center">
              <Check className="h-5 w-5 text-mint" />
            </div>
            <div>
              <p className="text-[14px] text-slate-600 font-medium">Plan Status</p>
              <p className="text-[12px] text-mint font-semibold">Active</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Team Members */}
              <div className="group relative">
                <div
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-mint opacity-60 group-hover:opacity-100 transition-opacity"
                />
                <div className="pl-5 py-5 pr-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-xl bg-mint/10 flex items-center justify-center flex-shrink-0">
                        <Users className="h-5 w-5 text-mint" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                          Team Members
                        </h3>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          Active members in your organization
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[20px] font-bold text-slate-900">
                        {quotaLimits.team_members_count}
                        <span className="text-[14px] font-normal text-slate-500">
                          {" "}/ {quotaLimits.seat_limit > 0 ? quotaLimits.seat_limit : "∞"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {quotaLimits.seat_limit > 0 && (
                    <div className="ml-[60px]">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Usage</span>
                        <span>{seatUsage}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            seatUsage >= 100
                              ? "bg-coral"
                              : seatUsage >= 80
                                ? "bg-amber-500"
                                : "bg-mint"
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
              <div className="group relative">
                <div
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "#8B5CF6" }}
                />
                <div className="pl-5 py-5 pr-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center flex-shrink-0">
                        <Plug className="h-5 w-5 text-[#8B5CF6]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                          Integrations
                        </h3>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          Configured provider integrations
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[20px] font-bold text-slate-900">
                        {quotaLimits.configured_providers_count}
                        <span className="text-[14px] font-normal text-slate-500">
                          {" "}/ {quotaLimits.providers_limit > 0 ? quotaLimits.providers_limit : "∞"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {quotaLimits.providers_limit > 0 && (
                    <div className="ml-[60px]">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Usage</span>
                        <span>{providerUsage}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            providerUsage >= 100
                              ? "bg-coral"
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Daily */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-center">
                <div className="h-12 w-12 rounded-xl bg-mint/10 flex items-center justify-center mx-auto mb-3">
                  <Clock className="h-6 w-6 text-mint" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Daily
                </p>
                <p className="text-[32px] font-bold text-slate-900 leading-none">
                  {quotaLimits.pipelines_per_day_limit > 0 ? quotaLimits.pipelines_per_day_limit : "∞"}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">runs per day</p>
              </div>

              {/* Weekly */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-center">
                <div className="h-12 w-12 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="h-6 w-6 text-[#8B5CF6]" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Weekly
                </p>
                <p className="text-[32px] font-bold text-slate-900 leading-none">
                  {quotaLimits.pipelines_per_week_limit > 0 ? quotaLimits.pipelines_per_week_limit : "∞"}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">runs per week</p>
              </div>

              {/* Monthly */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-center">
                <div className="h-12 w-12 rounded-xl bg-[#10B981]/10 flex items-center justify-center mx-auto mb-3">
                  <CalendarDays className="h-6 w-6 text-[#10B981]" />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Monthly
                </p>
                <p className="text-[32px] font-bold text-slate-900 leading-none">
                  {quotaLimits.pipelines_per_month_limit > 0 ? quotaLimits.pipelines_per_month_limit : "∞"}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">runs per month</p>
              </div>
            </div>
          </section>

          {/* Info Footer */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="h-5 w-5 text-mint" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 mb-1">
                  About Your Quotas
                </h3>
                <ul className="text-[13px] text-slate-500 space-y-1">
                  <li>• All limits are set based on your Stripe subscription plan</li>
                  <li>• Usage counters reset at the start of each day/week/month (UTC)</li>
                  <li>• Upgrade your plan to increase limits and unlock more resources</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {!quotaLimits && !error && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-amber-800">Unable to load quotas</h3>
            <p className="text-[13px] text-amber-700 mt-1">
              Please refresh the page to try again.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
