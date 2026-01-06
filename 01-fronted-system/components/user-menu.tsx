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
    // AUTH-004/005: Server-side auth cache has 5-second TTL, no client-side clearing needed
    window.location.href = "/login"
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative h-11 w-11 rounded-full p-0 hover:bg-[var(--cloudact-mint)]/5 focus-visible:ring-2 focus-visible:ring-[var(--cloudact-mint-dark)] focus-visible:ring-offset-2 focus-visible:outline-[var(--cloudact-mint-dark)]",
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
              <p className="text-xs text-[var(--cloudact-mint-dark)] font-medium capitalize mt-1">
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
          className="px-3 py-2.5 text-sm text-black hover:bg-[var(--cloudact-mint)]/5 hover:text-[var(--cloudact-mint-dark)] cursor-pointer rounded-lg focus:bg-[var(--cloudact-mint)]/5 focus:text-[var(--cloudact-mint-dark)]"
        >
          <User className="mr-3 h-4 w-4 text-[var(--cloudact-mint-dark)]" />
          <span>Profile Settings</span>
        </DropdownMenuItem>

        {userRole === "owner" && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setOpen(false)
                router.push(`/${orgSlug}/settings/onboarding`)
              }}
              className="px-3 py-2.5 text-sm text-black hover:bg-[var(--cloudact-mint)]/5 hover:text-[var(--cloudact-mint-dark)] cursor-pointer rounded-lg focus:bg-[var(--cloudact-mint)]/5 focus:text-[var(--cloudact-mint-dark)]"
            >
              <Building2 className="mr-3 h-4 w-4 text-[var(--cloudact-mint-dark)]" />
              <span>Organization</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => {
                setOpen(false)
                router.push(`/${orgSlug}/billing`)
              }}
              className="px-3 py-2.5 text-sm text-black hover:bg-[var(--cloudact-coral)]/5 hover:text-[var(--cloudact-coral)] cursor-pointer rounded-lg focus:bg-[var(--cloudact-coral)]/5 focus:text-[var(--cloudact-coral)]"
            >
              <CreditCard className="mr-3 h-4 w-4 text-[var(--cloudact-coral)]" />
              <span>Billing</span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            router.push(`/${orgSlug}/settings/members`)
          }}
          className="px-3 py-2.5 text-sm text-black hover:bg-[var(--cloudact-mint)]/5 hover:text-[var(--cloudact-mint-dark)] cursor-pointer rounded-lg focus:bg-[var(--cloudact-mint)]/5 focus:text-[var(--cloudact-mint-dark)]"
        >
          <Users className="mr-3 h-4 w-4 text-[var(--cloudact-mint-light)]" />
          <span>Team Members</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border my-1" />

        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoading}
          className="px-3 py-2.5 text-sm text-[var(--cloudact-coral)] hover:bg-[var(--cloudact-coral)]/10 hover:text-[var(--cloudact-coral)] cursor-pointer rounded-lg focus:bg-[var(--cloudact-coral)]/10 focus:text-[var(--cloudact-coral)]"
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
