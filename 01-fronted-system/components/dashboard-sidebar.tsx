"use client"

import type * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  CreditCard,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plug,
  Brain,
  Cloud,
  Play,
  List,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { listEnabledProviders, ProviderMeta } from "@/actions/subscription-providers"

// Provider display names mapping
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
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
  custom: "Custom",
}

// Format org name: "guruInc_11242025" → "Guru Inc"
// Preserves common acronyms: SaaS, API, AI, LLM, GCP, AWS, etc.
function formatOrgName(name: string): string {
  const withoutDate = name.replace(/_\d{8}$/, "")

  // Common acronyms to preserve (case-insensitive)
  const acronymPatterns = [
    { pattern: /saas/gi, replacement: "SaaS" },
    { pattern: /\bapi\b/gi, replacement: "API" },
    { pattern: /\bai\b/gi, replacement: "AI" },
    { pattern: /\bllm\b/gi, replacement: "LLM" },
    { pattern: /\bgcp\b/gi, replacement: "GCP" },
    { pattern: /\baws\b/gi, replacement: "AWS" },
    { pattern: /\bml\b/gi, replacement: "ML" },
    { pattern: /\bui\b/gi, replacement: "UI" },
    { pattern: /\bux\b/gi, replacement: "UX" },
  ]

  // First, replace underscores and hyphens with spaces
  let processed = withoutDate.replace(/[_-]/g, " ")

  // Preserve acronyms BEFORE camelCase split
  for (const { pattern, replacement } of acronymPatterns) {
    processed = processed.replace(pattern, replacement)
  }

  // Then handle camelCase (but skip consecutive capitals like "SaaS")
  processed = processed.replace(/([a-z])([A-Z])/g, "$1 $2")

  // Split and title-case each word (but preserve already-cased acronyms)
  const words = processed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // Check if word is an acronym (all caps or known pattern like "SaaS")
      const isAcronym = acronymPatterns.some(({ replacement }) =>
        word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) {
        return word // Keep as-is
      }
      // Otherwise title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")

  return words
}

// Billing status color mapping - defined outside component
function getBillingStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-[#007A78]/10 text-[#007A78] border-[#007A78]/30 font-medium"
    case "trialing":
      return "bg-amber-500/15 text-amber-700 border-amber-500/40 font-semibold"
    case "past_due":
      return "bg-[#FF6E50]/10 text-[#FF6E50] border-[#FF6E50]/30 font-medium"
    case "canceled":
      return "bg-red-500/10 text-red-500 border-red-500/30 font-medium"
    default:
      return "bg-gray-100 text-gray-500"
  }
}

interface DashboardSidebarProps extends React.ComponentProps<typeof Sidebar> {
  orgSlug: string
  orgName: string
  orgPlan: string
  billingStatus: string
  memberCount: number
  userRole: string
}

export function DashboardSidebar({
  orgSlug,
  orgName,
  orgPlan,
  billingStatus,
  memberCount,
  userRole,
  ...props
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [orgExpanded, setOrgExpanded] = useState(false)
  const [integrationsExpanded, setIntegrationsExpanded] = useState(
    pathname?.includes("/settings/integrations") || false
  )
  const [pipelinesExpanded, setPipelinesExpanded] = useState(
    pathname?.includes("/pipelines") || false
  )
  const [subscriptionsExpanded, setSubscriptionsExpanded] = useState(
    pathname?.includes("/subscriptions") || false
  )
  const [enabledProviders, setEnabledProviders] = useState<ProviderMeta[]>([])
  const formattedOrgName = formatOrgName(orgName)

  // Fetch enabled subscription providers for sidebar
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const result = await listEnabledProviders(orgSlug)
        if (result.success && result.providers) {
          setEnabledProviders(result.providers)
        }
      } catch (error) {
        console.error("Failed to fetch providers:", error)
      }
    }
    fetchProviders()

    // Also poll every 10 seconds when subscriptions are expanded
    let interval: NodeJS.Timeout | null = null
    if (subscriptionsExpanded) {
      interval = setInterval(fetchProviders, 10000) // Refresh every 10 seconds
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [orgSlug, subscriptionsExpanded, pathname])

  const handleLogout = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // Use hard redirect to avoid race conditions with auth state changes
    window.location.href = "/login"
  }

  // More specific active state logic - only highlight exact matches
  const isActive = (path: string, exact = false) => {
    if (!pathname) return false

    if (exact) {
      // Exact match only
      return pathname === path
    }

    // For non-exact matches, ensure we don't highlight parent paths
    // when on a child path. E.g., don't highlight /subscriptions when on /subscriptions/chatgpt_plus
    return pathname === path || pathname.startsWith(path + "/")
  }

  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon" className="border-r-0" {...props}>
      {/* Header removed - hamburger menu already shows company/logo */}

      <SidebarContent className="px-0 py-0">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider font-semibold text-[#8E8E93] px-5 pt-5 pb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  className={cn(
                    "h-[42px] px-5 text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
                    isActive(`/${orgSlug}/dashboard`, true) && "bg-[#007AFF]/10 text-[#007AFF] font-medium",
                  )}
                >
                  <Link href={`/${orgSlug}/dashboard`}>
                    <LayoutDashboard className="h-5 w-5 text-[#007A78]" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Subscription Costs - Top Level Menu */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Subscription Costs"
                  className={cn(
                    "h-[42px] px-5 text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
                    isActive(`/${orgSlug}/subscriptions`, true) && "bg-[#FF6E50]/10 text-[#FF6E50] font-medium",
                  )}
                >
                  <Link href={`/${orgSlug}/subscriptions`}>
                    <Wallet className="h-5 w-5 text-[#FF6E50]" />
                    <span>Subscription Costs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Pipelines Menu with Sub-menus */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setPipelinesExpanded(!pipelinesExpanded)}
                  aria-expanded={pipelinesExpanded}
                  aria-controls="pipelines-submenu"
                  tooltip="Pipelines"
                  className={cn(
                    "h-[42px] px-5 text-[14px] font-normal text-black hover:bg-[#007A78]/5 justify-between rounded-none",
                    pipelinesExpanded && "font-medium",
                    isActive(`/${orgSlug}/pipelines`) && "bg-[#AF52DE]/10 text-[#AF52DE] font-medium",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Play className="h-5 w-5 text-[#AF52DE]" />
                    <span>Pipelines</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-150 text-[#C7C7CC] group-data-[collapsible=icon]:hidden",
                      pipelinesExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Pipeline Sub-menus - hidden when collapsed */}
              {pipelinesExpanded && !isCollapsed && (
                <div id="pipelines-submenu" className="group-data-[collapsible=icon]:hidden ml-8 border-l border-[#E5E5EA] pl-0">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-[32px] pl-4 pr-5 text-[12px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] rounded-none",
                        isActive(`/${orgSlug}/pipelines`, true) && "text-[#AF52DE] font-medium bg-[#AF52DE]/8",
                      )}
                    >
                      <Link href={`/${orgSlug}/pipelines`}>
                        <List className="h-3.5 w-3.5 text-[#AF52DE]" />
                        <span>List / Run</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </div>
              )}

              {/* Integrations Menu with Sub-menus */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
                  aria-expanded={integrationsExpanded}
                  aria-controls="integrations-submenu"
                  tooltip="Integrations"
                  className={cn(
                    "h-[42px] px-5 text-[14px] font-normal text-black hover:bg-[#007A78]/5 justify-between rounded-none",
                    integrationsExpanded && "font-medium",
                    isActive(`/${orgSlug}/settings/integrations`) && "bg-[#FF9500]/10 text-[#FF9500] font-medium",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Plug className="h-5 w-5 text-[#FF9500]" />
                    <span>Integrations</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-150 text-[#C7C7CC] group-data-[collapsible=icon]:hidden",
                      integrationsExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Integration Sub-menus - 3 Categories - hidden when collapsed */}
              {integrationsExpanded && !isCollapsed && (
                <div id="integrations-submenu" className="group-data-[collapsible=icon]:hidden ml-8 border-l border-[#E5E5EA] pl-0">
                  {/* Cloud Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-[32px] pl-4 pr-5 text-[12px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] rounded-none",
                        isActive(`/${orgSlug}/settings/integrations/cloud`, true) && "text-[#007AFF] font-medium bg-[#007AFF]/8",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/cloud`}>
                        <Cloud className="h-3.5 w-3.5 text-[#007AFF]" />
                        <span>Cloud Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* LLM Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-[32px] pl-4 pr-5 text-[12px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] rounded-none",
                        isActive(`/${orgSlug}/settings/integrations/llm`, true) && "text-[#FF2D55] font-medium bg-[#FF2D55]/8",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/llm`}>
                        <Brain className="h-3.5 w-3.5 text-[#FF2D55]" />
                        <span>LLM Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers - Expandable submenu */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSubscriptionsExpanded(!subscriptionsExpanded)}
                      className={cn(
                        "h-[32px] pl-4 pr-5 text-[12px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] justify-between rounded-none",
                        isActive(`/${orgSlug}/settings/integrations/subscriptions`) && "text-[#34C759] font-medium bg-[#34C759]/8",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5 text-[#34C759]" />
                        <span>Subscriptions</span>
                        {enabledProviders.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#34C759]/12 text-[#34C759] font-semibold">
                            {enabledProviders.length}
                          </span>
                        )}
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform duration-150 text-[#C7C7CC]",
                          subscriptionsExpanded && "rotate-90"
                        )}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers Sub-menu (third level) - hidden when collapsed */}
                  {subscriptionsExpanded && !isCollapsed && (
                    <div className="group-data-[collapsible=icon]:hidden ml-4 border-l border-[#E5E5EA]/50 pl-0">
                      {/* Manage Subscriptions - main provider management page */}
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          className={cn(
                            "h-[28px] pl-3 pr-5 text-[11px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] rounded-none",
                            pathname === `/${orgSlug}/settings/integrations/subscriptions` && "text-[#34C759] font-medium",
                          )}
                        >
                          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                            <Settings className="h-3 w-3" />
                            <span>Manage</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {/* Show each enabled provider */}
                      {enabledProviders.map((provider) => {
                        // Use PROVIDER_DISPLAY_NAMES mapping for proper capitalization
                        const providerDisplayName = PROVIDER_DISPLAY_NAMES[provider.provider_name] ||
                          provider.provider_name
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (l: string) => l.toUpperCase())
                        return (
                          <SidebarMenuItem key={provider.id}>
                            <SidebarMenuButton
                              asChild
                              className={cn(
                                "h-[28px] pl-3 pr-5 text-[11px] text-[#8E8E93] hover:bg-[#007A78]/5 hover:text-[#007A78] rounded-none",
                                pathname === `/${orgSlug}/subscriptions/${provider.provider_name}` && "text-[#34C759] font-medium",
                              )}
                            >
                              <Link href={`/${orgSlug}/subscriptions/${provider.provider_name}`}>
                                <CreditCard className="h-3 w-3" />
                                <span>{providerDisplayName}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-0 py-0 mt-auto">
        {/* Organization Section - Expandable - hidden when collapsed */}
        {!isCollapsed && (
          <div className="px-5 py-4 group-data-[collapsible=icon]:hidden">
            <button
              onClick={() => setOrgExpanded(!orgExpanded)}
              aria-expanded={orgExpanded}
              aria-controls="org-details-panel"
              className="w-full flex items-center justify-between py-2 text-black hover:bg-[#007A78]/5 rounded-xl px-3 -mx-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <span className="text-[15px] font-medium text-black truncate max-w-[130px]">{formattedOrgName}</span>
              </div>
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-[#C7C7CC] transition-transform duration-150",
                  orgExpanded && "rotate-90"
                )}
              />
            </button>

            {orgExpanded && (
              <div id="org-details-panel" className="mt-3 p-4 rounded-2xl bg-[#F5F5F7] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Plan</span>
                  <span className="text-[13px] font-semibold text-[#007AFF] capitalize">{orgPlan}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Status</span>
                  <span className={cn("text-[13px] font-semibold capitalize",
                    billingStatus === "active" ? "text-[#34C759]" :
                    billingStatus === "trialing" ? "text-[#FF9500]" : "text-[#8E8E93]"
                  )}>{billingStatus}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Members</span>
                  <span className="text-[13px] font-semibold text-black">{memberCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Role</span>
                  <span className="text-[13px] font-medium text-[#8E8E93] capitalize">
                    {userRole === "read_only" ? "Read Only" : userRole}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Account Navigation - Apple Health Style */}
        <div className={cn("", isCollapsed && "flex flex-col items-center py-2")}>
          {/* Only show Billing for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-3 px-5 h-[42px] text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
                isActive(`/${orgSlug}/billing`, true) && "bg-[#34C759]/10 text-[#34C759] font-medium",
                isCollapsed && "w-10 h-10 px-0 justify-center rounded-lg"
              )}
            >
              <Link href={`/${orgSlug}/billing`} title="Billing">
                <CreditCard className="h-5 w-5 text-[#34C759]" />
                {!isCollapsed && <span>Billing</span>}
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-3 px-5 h-[42px] text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
              isActive(`/${orgSlug}/settings/members`, true) && "bg-[#5856D6]/10 text-[#5856D6] font-medium",
              isCollapsed && "w-10 h-10 px-0 justify-center rounded-lg"
            )}
          >
            <Link href={`/${orgSlug}/settings/members`} title="Invite">
              <Users className="h-5 w-5 text-[#5856D6]" />
              {!isCollapsed && <span>Invite</span>}
            </Link>
          </Button>
          {/* Only show Organization for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-3 px-5 h-[42px] text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
                isActive(`/${orgSlug}/settings/onboarding`, true) && "bg-[#007AFF]/10 text-[#007AFF] font-medium",
                isCollapsed && "w-10 h-10 px-0 justify-center rounded-lg"
              )}
            >
              <Link href={`/${orgSlug}/settings/onboarding`} title="Organization">
                <Building2 className="h-5 w-5 text-[#007AFF]" />
                {!isCollapsed && <span>Organization</span>}
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-3 px-5 h-[42px] text-[14px] font-normal text-black hover:bg-[#007A78]/5 rounded-none",
              isActive(`/${orgSlug}/settings/profile`, true) && "bg-[#8E8E93]/10 text-[#8E8E93] font-medium",
              isCollapsed && "w-10 h-10 px-0 justify-center rounded-lg"
            )}
          >
            <Link href={`/${orgSlug}/settings/profile`} title="Settings">
              <Settings className="h-5 w-5 text-[#8E8E93]" />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            disabled={isLoading}
            title="Sign Out"
            className={cn(
              "w-full justify-start gap-3 px-5 h-[44px] text-[17px] font-normal text-black hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] rounded-none",
              isCollapsed && "w-10 h-10 px-0 justify-center rounded-lg"
            )}
          >
            <LogOut className="h-5 w-5 text-[#FF3B30]" />
            {!isCollapsed && (isLoading ? "Signing out..." : "Sign Out")}
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
