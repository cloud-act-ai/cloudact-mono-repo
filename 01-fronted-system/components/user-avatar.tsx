"use client"

import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { getUserInitials } from "@/lib/nav-data"

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
  xl: "text-base",
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
        showRing && "ring-2 ring-[var(--cloudact-mint)] ring-offset-2",
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
