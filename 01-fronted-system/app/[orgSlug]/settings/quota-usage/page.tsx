"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Loader2,
  AlertTriangle,
  Users,
  Plug,
  Zap,
  Clock,
  Calendar,
  CalendarDays,
  BarChart3,
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
    } catch (err: unknown) {
      console.error("Failed to load quota limits:", err)
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
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Usage & Quotas</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">
          Current usage and limits based on your Stripe subscription plan
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {quotaLimits && (
        <>
          {/* Resource Usage Section */}
          <div className="metric-card shadow-sm">
            <div className="metric-card-header mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#8E8E93]" />
                <h2 className="text-[22px] font-bold text-black">Resource Usage</h2>
              </div>
              <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">
                Current usage of your plan resources
              </p>
            </div>

            <div className="metric-card-content">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Team Members Quota */}
                <div className="p-6 border border-[#E5E5EA] rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-[#007A78]/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-[#007A78]" />
                    </div>
                    <div>
                      <span className="text-[17px] font-semibold text-black">Team Members</span>
                      <p className="text-[13px] text-[#8E8E93]">Active members in your organization</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-[36px] font-bold text-black">{quotaLimits.team_members_count}</span>
                    <span className="text-[17px] text-[#8E8E93] mb-2">
                      / {quotaLimits.seat_limit > 0 ? quotaLimits.seat_limit : "Unlimited"}
                    </span>
                  </div>
                  {quotaLimits.seat_limit > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-[12px] text-[#8E8E93] mb-1">
                        <span>Usage</span>
                        <span>{Math.round((quotaLimits.team_members_count / quotaLimits.seat_limit) * 100)}%</span>
                      </div>
                      <div className="h-3 bg-[#E5E5EA] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            quotaLimits.team_members_count >= quotaLimits.seat_limit
                              ? "bg-[#FF6E50]"
                              : quotaLimits.team_members_count >= quotaLimits.seat_limit * 0.8
                                ? "bg-yellow-500"
                                : "bg-[#007A78]"
                          }`}
                          style={{
                            width: `${Math.min((quotaLimits.team_members_count / quotaLimits.seat_limit) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Providers Quota */}
                <div className="p-6 border border-[#E5E5EA] rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-[#007A78]/10 flex items-center justify-center">
                      <Plug className="h-5 w-5 text-[#007A78]" />
                    </div>
                    <div>
                      <span className="text-[17px] font-semibold text-black">Integrations</span>
                      <p className="text-[13px] text-[#8E8E93]">Configured provider integrations</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-[36px] font-bold text-black">{quotaLimits.configured_providers_count}</span>
                    <span className="text-[17px] text-[#8E8E93] mb-2">
                      / {quotaLimits.providers_limit > 0 ? quotaLimits.providers_limit : "Unlimited"}
                    </span>
                  </div>
                  {quotaLimits.providers_limit > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-[12px] text-[#8E8E93] mb-1">
                        <span>Usage</span>
                        <span>{Math.round((quotaLimits.configured_providers_count / quotaLimits.providers_limit) * 100)}%</span>
                      </div>
                      <div className="h-3 bg-[#E5E5EA] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            quotaLimits.configured_providers_count >= quotaLimits.providers_limit
                              ? "bg-[#FF6E50]"
                              : quotaLimits.configured_providers_count >= quotaLimits.providers_limit * 0.8
                                ? "bg-yellow-500"
                                : "bg-[#007A78]"
                          }`}
                          style={{
                            width: `${Math.min((quotaLimits.configured_providers_count / quotaLimits.providers_limit) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline Execution Limits Section */}
          <div className="metric-card shadow-sm">
            <div className="metric-card-header mb-6">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#8E8E93]" />
                <h2 className="text-[22px] font-bold text-black">Pipeline Execution Limits</h2>
              </div>
              <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">
                Maximum number of pipeline runs allowed per time period
              </p>
            </div>

            <div className="metric-card-content">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Daily Limit */}
                <div className="p-6 border border-[#E5E5EA] rounded-lg bg-gray-50 text-center">
                  <div className="h-12 w-12 rounded-full bg-[#007A78]/10 flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-6 w-6 text-[#007A78]" />
                  </div>
                  <span className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">Daily</span>
                  <div className="mt-2">
                    <span className="text-[42px] font-bold text-black">
                      {quotaLimits.pipelines_per_day_limit > 0 ? quotaLimits.pipelines_per_day_limit : "∞"}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#8E8E93] mt-1">runs per day</p>
                </div>

                {/* Weekly Limit */}
                <div className="p-6 border border-[#E5E5EA] rounded-lg bg-gray-50 text-center">
                  <div className="h-12 w-12 rounded-full bg-[#007A78]/10 flex items-center justify-center mx-auto mb-4">
                    <Calendar className="h-6 w-6 text-[#007A78]" />
                  </div>
                  <span className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">Weekly</span>
                  <div className="mt-2">
                    <span className="text-[42px] font-bold text-black">
                      {quotaLimits.pipelines_per_week_limit > 0 ? quotaLimits.pipelines_per_week_limit : "∞"}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#8E8E93] mt-1">runs per week</p>
                </div>

                {/* Monthly Limit */}
                <div className="p-6 border border-[#E5E5EA] rounded-lg bg-gray-50 text-center">
                  <div className="h-12 w-12 rounded-full bg-[#007A78]/10 flex items-center justify-center mx-auto mb-4">
                    <CalendarDays className="h-6 w-6 text-[#007A78]" />
                  </div>
                  <span className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">Monthly</span>
                  <div className="mt-2">
                    <span className="text-[42px] font-bold text-black">
                      {quotaLimits.pipelines_per_month_limit > 0 ? quotaLimits.pipelines_per_month_limit : "∞"}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#8E8E93] mt-1">runs per month</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="metric-card shadow-sm bg-[#007A78]/5 border-[#007A78]/20">
            <div className="metric-card-content">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[#007A78] mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-[15px] font-semibold text-[#005F5D]">About Your Quotas</h3>
                  <ul className="text-[13px] text-[#007A78] space-y-1 list-disc list-inside">
                    <li>All limits are dynamically set based on your Stripe subscription plan</li>
                    <li>Usage counters reset at the start of each day/week/month (UTC)</li>
                    <li>Upgrade your plan to increase limits and unlock more resources</li>
                    <li>Contact support if you need custom limits for enterprise use cases</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!quotaLimits && !error && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">
            Unable to load quota information. Please refresh the page.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
