"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { BarChart3 } from "lucide-react"

interface MobileHeaderProps {
  orgName: string
}

export function MobileHeader({ orgName }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 md:hidden">
      <SidebarTrigger className="-ml-1" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#007A78]">
          <BarChart3 className="h-4 w-4 text-white" />
        </div>
        <span className="console-body text-gray-900 font-semibold truncate max-w-[200px]">{orgName}</span>
      </div>
    </header>
  )
}
