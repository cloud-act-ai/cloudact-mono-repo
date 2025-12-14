"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Check, Loader2, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Success Confirmation Page
 *
 * Displays success message after subscription actions (create/edit/end).
 * Query params: ?action=created|updated|ended&plan={plan_name}
 */

function SuccessContent() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const searchParams = useSearchParams()
  const { orgSlug, provider } = params

  const action = searchParams.get("action") as "created" | "updated" | "ended" | null
  const planName = searchParams.get("plan")

  // Provider display names
  const providerDisplayNames: Record<string, string> = {
    chatgpt_plus: "ChatGPT Plus",
    claude_pro: "Claude Pro",
    gemini_advanced: "Gemini Advanced",
    copilot: "GitHub Copilot",
    cursor: "Cursor",
    windsurf: "Windsurf",
    replit: "Replit",
    v0: "v0",
    lovable: "Lovable",
    canva: "Canva",
    adobe_cc: "Adobe Creative Cloud",
    figma: "Figma",
    miro: "Miro",
    notion: "Notion",
    confluence: "Confluence",
    asana: "Asana",
    monday: "Monday.com",
    slack: "Slack",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    vercel: "Vercel",
    netlify: "Netlify",
    railway: "Railway",
    supabase: "Supabase",
  }

  const providerDisplayName = providerDisplayNames[provider] ||
    provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())

  // Action-based content
  const actionMessages = {
    created: {
      title: "Subscription Added Successfully",
      description: "Your subscription has been added and will be included in cost tracking.",
      color: "text-[#007A78]",
      bgColor: "bg-[#F0FDFA]"
    },
    updated: {
      title: "Subscription Updated Successfully",
      description: "Your subscription changes have been saved with version history.",
      color: "text-[#007A78]",
      bgColor: "bg-[#F0FDFA]"
    },
    ended: {
      title: "Subscription Ended Successfully",
      description: "Your subscription has been marked as ended. Costs will stop being calculated after the end date.",
      color: "text-[#FF6E50]",
      bgColor: "bg-[#FFF5F3]"
    }
  }

  const message = action && actionMessages[action]
    ? actionMessages[action]
    : actionMessages.created // fallback

  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-lg">
      {/* Success Icon */}
      <div className={`flex h-20 w-20 items-center justify-center rounded-full ${message.bgColor}`}>
        <Check className={`h-10 w-10 ${message.color}`} />
      </div>

      {/* Success Message */}
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold text-black tracking-tight">
          {message.title}
        </h1>
        <p className="text-[15px] text-[#8E8E93]">
          {message.description}
        </p>
      </div>

      {/* What was done */}
      {planName && (
        <div className="metric-card w-full">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[#8E8E93] uppercase tracking-wide font-semibold">Provider</span>
              <span className="text-[15px] font-semibold text-black">{providerDisplayName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[#8E8E93] uppercase tracking-wide font-semibold">Plan</span>
              <span className="text-[15px] font-semibold text-black">{planName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[#8E8E93] uppercase tracking-wide font-semibold">Action</span>
              <span className={`text-[15px] font-semibold capitalize ${message.color}`}>
                {action || "created"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Link href={`/${orgSlug}/subscriptions/${provider}/add`} className="flex-1">
          <Button
            className="w-full h-[44px] px-6 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm"
          >
            Add Another Subscription
          </Button>
        </Link>
        <Link href={`/${orgSlug}/subscriptions/${provider}`} className="flex-1">
          <Button
            variant="outline"
            className="w-full h-[44px] px-6 border-[#007A78]/30 text-[#007A78] hover:bg-[#007A78]/5 rounded-xl text-[15px] font-semibold"
          >
            Back to {providerDisplayName}
          </Button>
        </Link>
      </div>

      <Link href={`/${orgSlug}/subscriptions`} className="w-full">
        <Button
          variant="ghost"
          className="w-full h-[44px] px-6 text-[#8E8E93] hover:bg-[#F5F5F7] rounded-xl text-[15px] font-medium"
        >
          View All Subscriptions
        </Button>
      </Link>
    </div>
  )
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-[24px] font-bold text-black">Loading...</h1>
        <p className="text-[15px] text-[#8E8E93]">Please wait...</p>
      </div>
    </div>
  )
}

export default function SubscriptionSuccessPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider } = params

  const providerDisplayNames: Record<string, string> = {
    chatgpt_plus: "ChatGPT Plus",
    claude_pro: "Claude Pro",
    gemini_advanced: "Gemini Advanced",
    copilot: "GitHub Copilot",
    cursor: "Cursor",
    windsurf: "Windsurf",
    replit: "Replit",
    v0: "v0",
    lovable: "Lovable",
    canva: "Canva",
    adobe_cc: "Adobe Creative Cloud",
    figma: "Figma",
    miro: "Miro",
    notion: "Notion",
    confluence: "Confluence",
    asana: "Asana",
    monday: "Monday.com",
    slack: "Slack",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    vercel: "Vercel",
    netlify: "Netlify",
    railway: "Railway",
    supabase: "Supabase",
  }

  const providerDisplayName = providerDisplayNames[provider] ||
    provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())

  return (
    <div className="flex min-h-svh w-full flex-col bg-white">
      {/* Breadcrumb Navigation */}
      <div className="px-6 pt-6">
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link
            href={`/${orgSlug}/subscriptions`}
            className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded truncate max-w-[200px]"
            title="Subscriptions"
          >
            Subscriptions
          </Link>
          <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
          <Link
            href={`/${orgSlug}/subscriptions/${provider}`}
            className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded truncate max-w-[200px]"
            title={providerDisplayName}
          >
            {providerDisplayName}
          </Link>
          <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
          <span className="text-gray-900 font-medium truncate max-w-[300px]" title="Success">
            Success
          </span>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Suspense fallback={<SuccessFallback />}>
          <SuccessContent />
        </Suspense>
      </div>
    </div>
  )
}
