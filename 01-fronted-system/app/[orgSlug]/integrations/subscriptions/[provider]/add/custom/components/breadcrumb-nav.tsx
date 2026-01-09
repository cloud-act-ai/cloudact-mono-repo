/**
 * Breadcrumb Navigation Component
 */

import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface BreadcrumbNavProps {
  orgSlug: string
  provider: string
  providerDisplayName: string
}

export function BreadcrumbNav({ orgSlug, provider, providerDisplayName }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      <Link
        href={`/${orgSlug}/integrations/subscriptions`}
        className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[200px]"
        title="Subscription Providers"
      >
        Subscription Providers
      </Link>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <Link
        href={`/${orgSlug}/integrations/subscriptions/${provider}`}
        className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[200px]"
        title={providerDisplayName}
      >
        {providerDisplayName}
      </Link>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="text-gray-600 truncate max-w-[200px]" title="Add Subscription">Add Subscription</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="text-gray-900 font-medium truncate max-w-[300px]" title="Custom">Custom</span>
    </nav>
  )
}
