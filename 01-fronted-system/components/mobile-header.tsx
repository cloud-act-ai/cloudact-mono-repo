"use client"

import { useSidebar } from "@/components/ui/sidebar"
import { BarChart3, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MobileHeaderProps {
  orgName: string
}

export function MobileHeader({ orgName }: MobileHeaderProps) {
  const { openMobile, setOpenMobile } = useSidebar()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 md:hidden">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpenMobile(!openMobile)}
          className="h-9 w-9 text-gray-700 hover:bg-gray-100"
          aria-label={openMobile ? "Close menu" : "Open menu"}
        >
          {openMobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007A78]">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">{orgName}</span>
        </div>
      </div>
    </header>
  )
}
