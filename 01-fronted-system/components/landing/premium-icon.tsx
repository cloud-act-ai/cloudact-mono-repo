"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface PremiumIconProps {
  icon: LucideIcon
  color?: "mint" | "coral" | "blue" | "indigo" | "purple"
  size?: "sm" | "md" | "lg"
  className?: string
  animationDelay?: number
}

export function PremiumIcon({
  icon: Icon,
  color = "mint",
  size = "md",
  className,
  animationDelay = 0,
}: PremiumIconProps) {
  const sizeClasses = {
    sm: "w-10 h-10 rounded-xl",
    md: "w-14 h-14 rounded-2xl",
    lg: "w-16 h-16 rounded-2xl",
  }

  const iconSizes = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-8 h-8",
  }

  const colors = {
    mint: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-500",
      glow: "shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]",
    },
    coral: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      text: "text-orange-500",
      glow: "shadow-[0_0_20px_-5px_rgba(249,115,22,0.3)]",
    },
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      text: "text-blue-500",
      glow: "shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]",
    },
    indigo: {
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      text: "text-indigo-500",
      glow: "shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]",
    },
    purple: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
      text: "text-purple-500",
      glow: "shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]",
    },
  }

  const selectedColor = colors[color]

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 260, 
        damping: 20, 
        delay: animationDelay 
      }}
      className={cn(
        "relative flex items-center justify-center border backdrop-blur-sm",
        sizeClasses[size],
        selectedColor.bg,
        selectedColor.border,
        selectedColor.glow,
        className
      )}
    >
      <Icon className={cn(iconSizes[size], selectedColor.text)} />
    </motion.div>
  )
}
