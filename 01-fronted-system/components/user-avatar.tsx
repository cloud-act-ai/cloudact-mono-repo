"use client"

import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  user: {
    email: string
    full_name?: string
    avatar_url?: string
  }
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  showRing?: boolean
}

function getUserInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      // First and last name initials
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    // Single name - use first 2 chars
    return name.slice(0, 2).toUpperCase()
  }

  if (email) {
    // Use first 2 chars of email
    return email.slice(0, 2).toUpperCase()
  }

  return "U"
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
}

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
}

export function UserAvatar({
  user,
  size = "md",
  className,
  showRing = true,
}: UserAvatarProps) {
  const initials = getUserInitials(user.full_name, user.email)

  return (
    <Avatar
      className={cn(
        sizeClasses[size],
        showRing && "ring-2 ring-[#007A78] ring-offset-2",
        className
      )}
    >
      <AvatarImage
        src={user.avatar_url}
        alt={user.full_name || user.email}
      />
      <AvatarFallback className={textSizeClasses[size]}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
