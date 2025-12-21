"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import {
  User,
  Settings,
  LogOut,
  Loader2,
  Building2,
  CreditCard,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface UserMenuProps {
  user: {
    email: string
    full_name?: string
    avatar_url?: string
  }
  orgSlug: string
  userRole?: string
  className?: string
}

export function UserMenu({ user, orgSlug, userRole, className }: UserMenuProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // Use hard redirect to avoid race conditions with auth state changes
    window.location.href = "/login"
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative h-11 w-11 rounded-full p-0 hover:bg-[#007A78]/5 focus-visible:ring-2 focus-visible:ring-[#007A78] focus-visible:ring-offset-2 focus-visible:outline-[#007A78]",
            className
          )}
          aria-label="User menu"
        >
          <UserAvatar user={user} size="md" showRing={true} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 bg-white shadow-lg border border-border rounded-xl p-2"
      >
        <DropdownMenuLabel className="font-normal px-3 py-2">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold text-black leading-tight">
              {user.full_name || "User"}
            </p>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {user.email}
            </p>
            {userRole && (
              <p className="text-xs text-[#007A78] font-medium capitalize mt-1">
                {userRole === "read_only" ? "Read Only" : userRole}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border my-1" />

        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            router.push(`/${orgSlug}/settings/profile`)
          }}
          className="px-3 py-2.5 text-sm text-black hover:bg-[#007A78]/5 hover:text-[#007A78] cursor-pointer rounded-lg focus:bg-[#007A78]/5 focus:text-[#007A78]"
        >
          <User className="mr-3 h-4 w-4 text-[#007A78]" />
          <span>Profile Settings</span>
        </DropdownMenuItem>

        {userRole === "owner" && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setOpen(false)
                router.push(`/${orgSlug}/settings/onboarding`)
              }}
              className="px-3 py-2.5 text-sm text-black hover:bg-[#007A78]/5 hover:text-[#007A78] cursor-pointer rounded-lg focus:bg-[#007A78]/5 focus:text-[#007A78]"
            >
              <Building2 className="mr-3 h-4 w-4 text-[#007A78]" />
              <span>Organization</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => {
                setOpen(false)
                router.push(`/${orgSlug}/billing`)
              }}
              className="px-3 py-2.5 text-sm text-black hover:bg-[#FF6E50]/5 hover:text-[#FF6E50] cursor-pointer rounded-lg focus:bg-[#FF6E50]/5 focus:text-[#FF6E50]"
            >
              <CreditCard className="mr-3 h-4 w-4 text-[#FF8A73]" />
              <span>Billing</span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            router.push(`/${orgSlug}/settings/members`)
          }}
          className="px-3 py-2.5 text-sm text-black hover:bg-[#007A78]/5 hover:text-[#007A78] cursor-pointer rounded-lg focus:bg-[#007A78]/5 focus:text-[#007A78]"
        >
          <Users className="mr-3 h-4 w-4 text-[#14B8A6]" />
          <span>Team Members</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border my-1" />

        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoading}
          className="px-3 py-2.5 text-sm text-[#FF6E50] hover:bg-[#FF6E50]/10 hover:text-[#FF6E50] cursor-pointer rounded-lg focus:bg-[#FF6E50]/10 focus:text-[#FF6E50]"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-3 h-4 w-4 animate-spin" />
              <span>Signing out...</span>
            </>
          ) : (
            <>
              <LogOut className="mr-3 h-4 w-4" />
              <span>Sign Out</span>
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
