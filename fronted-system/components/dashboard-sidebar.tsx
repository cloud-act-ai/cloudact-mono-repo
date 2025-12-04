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
  Sparkles,
  Cloud,
  Cpu,
  Gem,
  Play,
  List,
  Wallet,
  Palette,
  MessageSquare,
  Code,
  FileText,
  DollarSign,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter, usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { getIntegrations } from "@/actions/integrations"
import { listEnabledProviders, ProviderMeta } from "@/actions/subscription-providers"
import { COMMON_SAAS_PROVIDERS } from "@/lib/saas-providers"

// Category icon mapping for subscriptions
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai: Brain,
  design: Palette,
  productivity: FileText,
  communication: MessageSquare,
  development: Code,
  cloud: Cloud,
  other: Wallet,
}

// Provider configuration with backend keys - defined outside component to prevent re-creation
const INTEGRATION_PROVIDERS = [
  { id: "gcp", backendKey: "GCP_SA", name: "GCP", icon: Cloud, href: "gcp" },
  { id: "openai", backendKey: "OPENAI", name: "OpenAI", icon: Brain, href: "openai" },
  { id: "anthropic", backendKey: "ANTHROPIC", name: "Anthropic", icon: Sparkles, href: "anthropic" },
  { id: "gemini", backendKey: "GEMINI", name: "Gemini", icon: Gem, href: "gemini" },
  { id: "deepseek", backendKey: "DEEPSEEK", name: "DeepSeek", icon: Cpu, href: "deepseek" },
] as const

// Format org name: "guruInc_11242025" → "Guru Inc"
function formatOrgName(name: string): string {
  const withoutDate = name.replace(/_\d{8}$/, "")
  const words = withoutDate
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
  return words
}

// Billing status color mapping - defined outside component
function getBillingStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-[#007A78]/10 text-[#007A78] border-[#007A78]/20"
    case "trialing":
      return "bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/20"
    case "past_due":
      return "bg-[#FF6E50]/10 text-[#FF6E50] border-[#FF6E50]/20"
    case "canceled":
      return "bg-red-500/10 text-red-500 border-red-500/20"
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
  const router = useRouter()
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
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set())
  const [enabledProviders, setEnabledProviders] = useState<ProviderMeta[]>([])
  const formattedOrgName = formatOrgName(orgName)

  // Fetch integration status to show only connected providers
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const result = await getIntegrations(orgSlug)
        if (result.success && result.integrations) {
          const connected = new Set<string>()
          for (const provider of INTEGRATION_PROVIDERS) {
            const integration = result.integrations.integrations[provider.backendKey]
            if (integration?.status === "VALID") {
              connected.add(provider.id)
            }
          }
          setConnectedProviders(connected)
        }
      } catch (error) {
        console.error("Failed to fetch integrations:", error)
      }
    }
    fetchIntegrations()
  }, [orgSlug])

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
  }, [orgSlug])

  const handleLogout = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // Use hard redirect to avoid race conditions with auth state changes
    window.location.href = "/login"
  }

  const isActive = (path: string) => pathname?.startsWith(path)

  // Get icon for a provider based on category
  const getProviderIcon = (providerId: string) => {
    const provider = COMMON_SAAS_PROVIDERS.find(p => p.id === providerId)
    const category = provider?.category || "other"
    return CATEGORY_ICONS[category] || Wallet
  }

  return (
    <Sidebar className="border-r bg-white border-gray-200" {...props}>
      <SidebarHeader className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007A78] text-white">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-gray-900">{formattedOrgName}</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-500 text-xs uppercase tracking-wider px-2 mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
                    isActive(`/${orgSlug}/dashboard`) &&
                      !isActive(`/${orgSlug}/dashboard/`) &&
                      "bg-[#007A78]/10 text-[#007A78]",
                  )}
                >
                  <Link href={`/${orgSlug}/dashboard`}>
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
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
                  className={cn(
                    "text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5 justify-between",
                    isActive(`/${orgSlug}/pipelines`) && "bg-[#007A78]/5 text-[#007A78]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    <span>Pipelines</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      pipelinesExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Pipeline Sub-menus */}
              {pipelinesExpanded && (
                <div id="pipelines-submenu" className="ml-4 pl-2 border-l border-gray-200 space-y-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-8",
                        isActive(`/${orgSlug}/pipelines`) && !pathname?.includes("/pipelines/runs") && "bg-[#007A78]/10 text-[#007A78]",
                      )}
                    >
                      <Link href={`/${orgSlug}/pipelines`}>
                        <List className="h-3.5 w-3.5" />
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
                  className={cn(
                    "text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5 justify-between",
                    isActive(`/${orgSlug}/settings/integrations`) && "bg-[#007A78]/5 text-[#007A78]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    <span>Integrations</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      integrationsExpanded && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Integration Sub-menus - 3 Categories */}
              {integrationsExpanded && (
                <div id="integrations-submenu" className="ml-4 pl-2 border-l border-gray-200 space-y-1">
                  {/* Cloud Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-8",
                        isActive(`/${orgSlug}/settings/integrations/cloud`) && "bg-[#007A78]/10 text-[#007A78]",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/cloud`}>
                        <Cloud className="h-3.5 w-3.5" />
                        <span>Cloud Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* LLM Providers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-8",
                        isActive(`/${orgSlug}/settings/integrations/llm`) && "bg-[#007A78]/10 text-[#007A78]",
                      )}
                    >
                      <Link href={`/${orgSlug}/settings/integrations/llm`}>
                        <Brain className="h-3.5 w-3.5" />
                        <span>LLM Providers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers - Expandable submenu */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSubscriptionsExpanded(!subscriptionsExpanded)}
                      className={cn(
                        "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-8 justify-between",
                        isActive(`/${orgSlug}/settings/integrations/subscriptions`) && "bg-[#007A78]/10 text-[#007A78]",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5" />
                        <span>Subscription Providers</span>
                        {enabledProviders.length > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-[#007A78]/5 text-[#007A78] border-[#007A78]/20">
                            {enabledProviders.length}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform duration-200",
                          subscriptionsExpanded && "rotate-90"
                        )}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Subscription Providers Sub-menu (third level) */}
                  {subscriptionsExpanded && (
                    <div className="ml-6 pl-2 border-l border-gray-200 space-y-1">
                      {/* Manage Subscriptions - main provider management page */}
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          className={cn(
                            "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-7",
                            pathname === `/${orgSlug}/settings/integrations/subscriptions` && "bg-[#007A78]/10 text-[#007A78]",
                          )}
                        >
                          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                            <Settings className="h-3 w-3" />
                            <span>Manage Subscriptions</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {/* Show each enabled provider */}
                      {enabledProviders.map((provider) => {
                        const ProviderIcon = getProviderIcon(provider.provider_name)
                        const displayName = COMMON_SAAS_PROVIDERS.find(p => p.id === provider.provider_name)?.name ||
                                          provider.provider_name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                        return (
                          <SidebarMenuItem key={provider.id}>
                            <SidebarMenuButton
                              asChild
                              className={cn(
                                "text-gray-500 hover:text-[#007A78] hover:bg-[#007A78]/5 text-sm h-7",
                                isActive(`/${orgSlug}/subscriptions/${provider.provider_name}`) && "bg-[#007A78]/10 text-[#007A78]",
                              )}
                            >
                              <Link href={`/${orgSlug}/subscriptions/${provider.provider_name}`}>
                                <ProviderIcon className="h-3 w-3" />
                                <span className="truncate">{displayName}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Subscriptions Menu - Only show if there are enabled providers */}
              {enabledProviders.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
                      pathname === `/${orgSlug}/subscriptions` && "bg-[#007A78]/5 text-[#007A78]",
                    )}
                  >
                    <Link href={`/${orgSlug}/subscriptions`}>
                      <DollarSign className="h-4 w-4" />
                      <span>Subscription Costs</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-gray-200 px-2 py-3">
        {/* Organization Section - Expandable */}
        <div className="mb-2">
          <button
            onClick={() => setOrgExpanded(!orgExpanded)}
            aria-expanded={orgExpanded}
            aria-controls="org-details-panel"
            className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-[#007A78]/5 text-gray-600 hover:text-[#007A78] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="text-sm font-medium truncate max-w-[120px]">{orgName}</span>
            </div>
            {orgExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {orgExpanded && (
            <div id="org-details-panel" className="mt-2 mx-2 p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Plan</span>
                <Badge variant="outline" className="text-xs capitalize border-[#007A78]/20 text-[#007A78]">
                  {orgPlan}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <Badge variant="outline" className={cn("text-xs capitalize", getBillingStatusColor(billingStatus))}>
                  {billingStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Members</span>
                <span className="text-xs font-medium text-gray-900">{memberCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Your Role</span>
                <Badge variant="outline" className="text-xs capitalize border-gray-200 text-gray-700">
                  {userRole === "read_only" ? "Read Only" : userRole}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Account Navigation */}
        <div className="space-y-1">
          {/* Only show Billing for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-2 px-2 h-9 text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
                isActive(`/${orgSlug}/billing`) && "bg-[#007A78]/10 text-[#007A78]",
              )}
            >
              <Link href={`/${orgSlug}/billing`}>
                <CreditCard className="h-4 w-4" />
                <span>Billing</span>
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-2 px-2 h-9 text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
              isActive(`/${orgSlug}/settings/members`) && "bg-[#007A78]/10 text-[#007A78]",
            )}
          >
            <Link href={`/${orgSlug}/settings/members`}>
              <Users className="h-4 w-4" />
              <span>Invite</span>
            </Link>
          </Button>
          {/* Only show Organization for owners */}
          {userRole === "owner" && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "w-full justify-start gap-2 px-2 h-9 text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
                isActive(`/${orgSlug}/settings/onboarding`) && "bg-[#007A78]/10 text-[#007A78]",
              )}
            >
              <Link href={`/${orgSlug}/settings/onboarding`}>
                <Building2 className="h-4 w-4" />
                <span>Organization</span>
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={cn(
              "w-full justify-start gap-2 px-2 h-9 text-gray-600 hover:text-[#007A78] hover:bg-[#007A78]/5",
              isActive(`/${orgSlug}/settings/profile`) && "bg-[#007A78]/10 text-[#007A78]",
            )}
          >
            <Link href={`/${orgSlug}/settings/profile`}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full justify-start gap-2 px-2 h-9 text-gray-600 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"
          >
            <LogOut className="h-4 w-4" />
            {isLoading ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
