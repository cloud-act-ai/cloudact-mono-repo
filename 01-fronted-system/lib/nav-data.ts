/**
 * Shared Navigation Data
 *
 * Single source of truth for sidebar + mobile nav links.
 * Keeps both components in sync when items are added/changed.
 */

import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Bell,
  Brain,
  Building,
  Calendar,
  Cloud,
  Cpu,
  CreditCard,
  AlertTriangle,
  FileText,
  History,
  LayoutDashboard,
  MessageSquare,
  Network,
  Receipt,
  RefreshCw,
  Server,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react"

// --- Types ---

export type SectionId =
  | "chat"
  | "dashboards"
  | "cost-analytics"
  | "budget-planning"
  | "pipelines"
  | "integrations"
  | "notifications"
  | "settings"
  | "resources"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  badge?: string
  exactMatch?: boolean
  ownerOnly?: boolean
}

export interface NavGroup {
  id: SectionId
  label: string
  badge?: string
  collapsedIcon: LucideIcon
  collapsedHref: string
  items: NavItem[]
}

// --- Navigation Groups ---

export function getNavGroups(orgSlug: string, userRole: string): NavGroup[] {
  const isOwner = userRole === "owner"
  return [
    {
      id: "chat",
      label: "AI Chat",
      badge: "Beta",
      collapsedIcon: MessageSquare,
      collapsedHref: `/${orgSlug}/chat`,
      items: [
        { title: "Chat", href: `/${orgSlug}/chat`, icon: MessageSquare, badge: "Beta" },
        { title: "Chat Settings", href: `/${orgSlug}/settings/ai-chat`, icon: Settings },
      ],
    },
    {
      id: "dashboards",
      label: "Account Summary",
      collapsedIcon: LayoutDashboard,
      collapsedHref: `/${orgSlug}/dashboard`,
      items: [
        { title: "Dashboard", href: `/${orgSlug}/dashboard`, icon: LayoutDashboard, exactMatch: true },
      ],
    },
    {
      id: "cost-analytics",
      label: "Cost Analytics",
      collapsedIcon: TrendingUp,
      collapsedHref: `/${orgSlug}/cost-dashboards/overview`,
      items: [
        { title: "Overview", href: `/${orgSlug}/cost-dashboards/overview`, icon: BarChart3, exactMatch: true },
        { title: "GenAI Costs", href: `/${orgSlug}/cost-dashboards/genai-costs`, icon: Sparkles },
        { title: "Cloud Costs", href: `/${orgSlug}/cost-dashboards/cloud-costs`, icon: Cloud },
        { title: "Subscriptions", href: `/${orgSlug}/cost-dashboards/subscription-costs`, icon: Receipt },
      ],
    },
    {
      id: "budget-planning",
      label: "Budget Planning",
      collapsedIcon: Target,
      collapsedHref: `/${orgSlug}/budgets`,
      items: [
        { title: "Budgets", href: `/${orgSlug}/budgets`, icon: Target, exactMatch: true },
      ],
    },
    {
      id: "pipelines",
      label: "Pipelines",
      collapsedIcon: Workflow,
      collapsedHref: `/${orgSlug}/pipelines`,
      items: [
        { title: "Overview", href: `/${orgSlug}/pipelines`, icon: Workflow, exactMatch: true },
        { title: "Subscription Runs", href: `/${orgSlug}/pipelines/subscription-runs`, icon: RefreshCw },
        { title: "Cloud Runs", href: `/${orgSlug}/pipelines/cloud-runs`, icon: Cloud },
        { title: "GenAI Runs", href: `/${orgSlug}/pipelines/genai-runs`, icon: Cpu },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      collapsedIcon: Server,
      collapsedHref: `/${orgSlug}/integrations`,
      items: [
        { title: "Cloud Providers", href: `/${orgSlug}/integrations/cloud-providers`, icon: Server },
        { title: "GenAI Providers", href: `/${orgSlug}/integrations/genai`, icon: Brain },
        { title: "Subscriptions", href: `/${orgSlug}/integrations/subscriptions`, icon: CreditCard },
      ],
    },
    {
      id: "notifications",
      label: "Notifications",
      collapsedIcon: Bell,
      collapsedHref: `/${orgSlug}/notifications`,
      items: [
        { title: "Overview", href: `/${orgSlug}/notifications`, icon: Bell, exactMatch: true },
        { title: "Channels", href: `/${orgSlug}/notifications?tab=channels`, icon: Settings },
        { title: "Alert Rules", href: `/${orgSlug}/notifications?tab=alerts`, icon: AlertTriangle },
        { title: "Summaries", href: `/${orgSlug}/notifications?tab=summaries`, icon: Calendar },
        { title: "History", href: `/${orgSlug}/notifications?tab=history`, icon: History },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      collapsedIcon: Settings,
      collapsedHref: `/${orgSlug}/settings/organization`,
      items: [
        ...(isOwner ? [{ title: "Organization", href: `/${orgSlug}/settings/organization`, icon: Building, ownerOnly: true }] : []),
        ...(isOwner ? [{ title: "Hierarchy", href: `/${orgSlug}/settings/hierarchy`, icon: Network, ownerOnly: true }] : []),
        { title: "Usage & Quotas", href: `/${orgSlug}/settings/quota-usage`, icon: BarChart3 },
        { title: "Team Members", href: `/${orgSlug}/settings/invite`, icon: UserPlus },
        ...(isOwner ? [{ title: "Billing", href: `/${orgSlug}/billing`, icon: CreditCard, ownerOnly: true }] : []),
      ],
    },
    {
      id: "resources",
      label: "Resources",
      collapsedIcon: FileText,
      collapsedHref: "/user-docs",
      items: [
        { title: "Docs", href: "/user-docs", icon: FileText },
      ],
    },
  ]
}

// --- Org Route Helpers ---

export function orgRoutes(orgSlug: string) {
  return {
    home: `/${orgSlug}/cost-dashboards/overview`,
    dashboard: `/${orgSlug}/dashboard`,
    chat: `/${orgSlug}/chat`,
    profile: `/${orgSlug}/settings/personal`,
    organization: `/${orgSlug}/settings/organization`,
    billing: `/${orgSlug}/billing`,
    invite: `/${orgSlug}/settings/invite`,
    integrations: `/${orgSlug}/integrations`,
  }
}

// --- Utility Functions ---

export function formatOrgName(name: string): string {
  const withoutDate = name.replace(/_\d{8}$/, "")

  if (withoutDate.includes(" ") || /[a-z][A-Z]/.test(withoutDate)) {
    return withoutDate.trim()
  }

  const acronymPatterns = [
    { pattern: /\bsaas\b/gi, replacement: "SaaS" },
    { pattern: /\bapi\b/gi, replacement: "API" },
    { pattern: /\bai\b/gi, replacement: "AI" },
    { pattern: /\bgenai\b/gi, replacement: "GenAI" },
    { pattern: /\bgcp\b/gi, replacement: "GCP" },
    { pattern: /\baws\b/gi, replacement: "AWS" },
  ]

  let processed = withoutDate.replace(/[_-]/g, " ")

  for (const { pattern, replacement } of acronymPatterns) {
    processed = processed.replace(pattern, replacement)
  }

  return processed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const isAcronym = acronymPatterns.some(
        ({ replacement }) => word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

export function getUserInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return "U"
}

export function formatUserName(name: string): string {
  if (!name) return "User"
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}
