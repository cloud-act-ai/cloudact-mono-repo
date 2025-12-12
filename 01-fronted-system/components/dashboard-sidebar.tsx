"use client"

import type * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
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
  BarChart3,
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
    <Sidebar collapsible="icon" className="border-r bg-white border-gray-200" {...props}>
      <SidebarHeader className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#007A78] text-white flex-shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <span className="text-base font-semibold text-gray-900 truncate">{formattedOrgName}</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wide font-semibold text-gray-400 px-3 mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  className={cn(
                    "h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                    isActive(`/${orgSlug}/dashboard`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                  )}
                >
                  <Link href={`/${orgSlug}/dashboard`}>
                    <LayoutDashboard className="h-4 w-4" />
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
                    "h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                    isActive(`/${orgSlug}/subscriptions`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                  )}
                >
                  <Link href={`/${orgSlug}/subscriptions`}>
                    <Wallet className="h-4 w-4" />
                    <span>Subscription Costs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Analytics - Coming Soon */}
              {/* Pipelines Menu with Sub-menus */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setPipelinesExpanded(!pipelinesExpanded)}
                  aria-expanded={pipelinesExpanded}
                  aria-controls="pipelines-submenu"
                  tooltip="Pipelines"
                  className={cn(
                    "h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 justify-between",
                    isActive(`/${orgSlug}/pipelines`) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    <span>Pipelines</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden",
                      pipelinesExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Pipeline Sub-menus - hidden when collapsed */}
              {pipelinesExpanded && !isCollapsed && (
                <div id="pipelines-submenu" className="ml-4 space-y-1 group-data-[collapsible=icon]:hidden">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                        isActive(`/${orgSlug}/pipelines`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                      )}
                    >
                      <Link href={`/${orgSlug}/pipelines`}>
                        <List className="h-4 w-4" />
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
                    "h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 justify-between",
                    isActive(`/${orgSlug}/settings/integrations`) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    <span>Integrations</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden",
                      integrationsExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Integration Sub-menus - 3 Categories - hidden when collapsed */}
              {integrationsExpanded && !isCollapsed && (
                <div id="integrations-submenu" className="ml-4 space-y-1 group-data-[collapsible=icon]:hidden">
                  {/* Cloud Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                        isActive(`/${orgSlug}/settings/integrations/cloud`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/cloud`}>
                        <Cloud className="h-4 w-4" />
                        <span>Cloud Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* LLM Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                        isActive(`/${orgSlug}/settings/integrations/llm`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/llm`}>
                        <Brain className="h-4 w-4" />
                        <span>LLM Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers - Expandable submenu */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSubscriptionsExpanded(!subscriptionsExpanded)}
                      className={cn(
                        "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 justify-between",
                        isActive(`/${orgSlug}/settings/integrations/subscriptions`) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        <span>Subscriptions</span>
                        {enabledProviders.length > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-[#007A78]/10 text-[#007A78] border-[#007A78]/30">
                            {enabledProviders.length}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          subscriptionsExpanded && "rotate-90"
                        )}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers Sub-menu (third level) - hidden when collapsed */}
                  {subscriptionsExpanded && !isCollapsed && (
                    <div className="ml-6 space-y-1 group-data-[collapsible=icon]:hidden">
                      {/* Manage Subscriptions - main provider management page */}
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          className={cn(
                            "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                            pathname === `/${orgSlug}/settings/integrations/subscriptions` && "bg-[#007A78]/10 text-[#007A78] font-medium",
                          )}
                        >
                          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                            <Settings className="h-4 w-4" />
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
                                "h-8 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                                pathname === `/${orgSlug}/subscriptions/${provider.provider_name}` && "bg-[#007A78]/10 text-[#007A78] font-medium",
                              )}
                            >
                              <Link href={`/${orgSlug}/subscriptions/${provider.provider_name}`}>
                                <CreditCard className="h-4 w-4" />
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

      <SidebarFooter className="border-t border-gray-200 px-3 py-3">
        {/* Organization Section - Expandable - hidden when collapsed */}
        {!isCollapsed && (
          <div className="mb-2 group-data-[collapsible=icon]:hidden">
            <button
              onClick={() => setOrgExpanded(!orgExpanded)}
              aria-expanded={orgExpanded}
              aria-controls="org-details-panel"
              className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 hover:text-gray-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="text-sm font-medium truncate max-w-[140px]">{formattedOrgName}</span>
              </div>
              {orgExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {orgExpanded && (
              <div id="org-details-panel" className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Plan</span>
                  <Badge variant="outline" className="text-xs capitalize border-[#007A78]/30 text-[#007A78] bg-[#007A78]/5">
                    {orgPlan}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge variant="outline" className={cn("text-xs capitalize", getBillingStatusColor(billingStatus))}>
                    {billingStatus}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Members</span>
                  <span className="text-sm font-medium text-gray-900">{memberCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Your Role</span>
                  <Badge variant="outline" className="text-xs capitalize border-gray-300 text-gray-700">
                    {userRole === "read_only" ? "Read Only" : userRole}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Account Navigation */}
        <div className={cn("space-y-1", isCollapsed && "flex flex-col items-center")}>
          {/* Only show Billing for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-2 px-3 h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                isActive(`/${orgSlug}/billing`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                isCollapsed && "w-9 px-0 justify-center"
              )}
            >
              <Link href={`/${orgSlug}/billing`} title="Billing">
                <CreditCard className="h-4 w-4" />
                {!isCollapsed && <span>Billing</span>}
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-2 px-3 h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
              isActive(`/${orgSlug}/settings/members`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
              isCollapsed && "w-9 px-0 justify-center"
            )}
          >
            <Link href={`/${orgSlug}/settings/members`} title="Invite">
              <Users className="h-4 w-4" />
              {!isCollapsed && <span>Invite</span>}
            </Link>
          </Button>
          {/* Only show Organization for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-2 px-3 h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                isActive(`/${orgSlug}/settings/onboarding`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
                isCollapsed && "w-9 px-0 justify-center"
              )}
            >
              <Link href={`/${orgSlug}/settings/onboarding`} title="Organization">
                <Building2 className="h-4 w-4" />
                {!isCollapsed && <span>Organization</span>}
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-2 px-3 h-9 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900",
              isActive(`/${orgSlug}/settings/profile`, true) && "bg-[#007A78]/10 text-[#007A78] font-medium",
              isCollapsed && "w-9 px-0 justify-center"
            )}
          >
            <Link href={`/${orgSlug}/settings/profile`} title="Settings">
              <Settings className="h-4 w-4" />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            disabled={isLoading}
            title="Sign Out"
            className={cn(
              "w-full justify-start gap-2 px-3 h-9 text-sm font-medium text-gray-700 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]",
              isCollapsed && "w-9 px-0 justify-center"
            )}
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && (isLoading ? "Signing out..." : "Sign Out")}
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
